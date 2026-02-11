"""
Backfill missing Spotify discography albums into DB.

Strategy:
1) Load target creators from creator_spotify_profile.
2) For each artist, fetch Spotify artist albums (include albums/singles/compilations/appears_on).
3) Insert only missing spotify:album:* album_groups.
4) Always upsert album_links + album_credits for the target creator (even if album exists).

Usage:
  docker exec sonic_backend python scripts/db/import/backfill-spotify-discography.py
"""

import asyncio
import os
import sys
import time
import json
from pathlib import Path
import uuid
from datetime import datetime, date
from typing import Dict, List, Optional

import aiohttp
from sqlalchemy import select, func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

# Docker container root
sys.path.insert(0, "/app")

from app.database import DATABASE_URL, Base
from app.models import (
    AlbumCredit,
    AlbumGroup,
    AlbumLink,
    AlbumDetailsCache,
    CreatorSpotifyProfile,
    Role,
)

SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_ARTIST_ALBUMS_URL = "https://api.spotify.com/v1/artists/{artist_id}/albums"

INCLUDE_GROUPS = os.getenv(
    "SPOTIFY_INCLUDE_GROUPS",
    "album,single,compilation,appears_on",
)
MARKET = os.getenv("SPOTIFY_MARKET", "")
SPOTIFY_MIN_INTERVAL_MS = int(os.getenv("SPOTIFY_MIN_INTERVAL_MS", "200"))
SPOTIFY_MAX_RETRIES = int(os.getenv("SPOTIFY_MAX_RETRIES", "6"))
SPOTIFY_BATCH_DELAY_MS = int(os.getenv("SPOTIFY_BATCH_DELAY_MS", "200"))
CREATOR_LIMIT = int(os.getenv("SPOTIFY_DISCO_LIMIT", "0"))
CREATOR_START = int(os.getenv("SPOTIFY_DISCO_START", "0"))
BATCH_SIZE = int(os.getenv("SPOTIFY_DISCO_DB_BATCH", "500"))
UPDATE_EXISTING = os.getenv("SPOTIFY_DISCO_UPDATE_EXISTING", "").lower() in ("1", "true", "yes")
ENRICH_COUNTRY = os.getenv("SPOTIFY_DISCO_ENRICH_COUNTRY", "").lower() in ("1", "true", "yes")
DISCOGS_TOKEN = os.getenv("DISCOGS_TOKEN")
CACHE_DIR = Path(os.getenv("SPOTIFY_DISCO_CACHE_DIR", "/out"))
MB_CACHE_FILE = CACHE_DIR / "mb_cache.json"
DISCOGS_CACHE_FILE = CACHE_DIR / "discogs_cache.json"
SPOTIFY_RESPECT_RETRY_AFTER = os.getenv("SPOTIFY_RESPECT_RETRY_AFTER", "").lower() in ("1", "true", "yes")
SPOTIFY_RETRY_AFTER_CAP_SEC = int(os.getenv("SPOTIFY_RETRY_AFTER_CAP_SEC", "600"))


class TokenExpired(Exception):
    pass


def to_creator_id(raw_spotify_artist_id: str) -> str:
    return f"spotify:artist:{raw_spotify_artist_id}"


def to_album_group_id(raw_spotify_album_id: str) -> str:
    return f"spotify:album:{raw_spotify_album_id}"


def parse_release_date(raw: Optional[str], precision: Optional[str]) -> Optional[date]:
    if not raw:
        return None
    try:
        if precision == "year":
            return datetime.fromisoformat(f"{raw}-01-01").date()
        if precision == "month":
            return datetime.fromisoformat(f"{raw}-01").date()
        return datetime.fromisoformat(raw).date()
    except Exception:
        return None


class SpotifyClient:
    def __init__(self, client_id: str, client_secret: str):
        self.client_id = client_id
        self.client_secret = client_secret
        self.access_token: Optional[str] = None
        self.expires_at: float = 0.0
        self.last_request_at: float = 0.0

    async def throttle(self) -> None:
        now = time.time() * 1000
        wait_for = self.last_request_at + SPOTIFY_MIN_INTERVAL_MS - now
        if wait_for > 0:
            await asyncio.sleep((wait_for + 15) / 1000)
        self.last_request_at = time.time() * 1000

    async def get_access_token(self, session: aiohttp.ClientSession) -> str:
        now = time.time()
        if self.access_token and now < self.expires_at:
            return self.access_token

        auth = aiohttp.BasicAuth(self.client_id, self.client_secret)
        data = {"grant_type": "client_credentials"}
        async with session.post(SPOTIFY_TOKEN_URL, data=data, auth=auth) as res:
            if res.status != 200:
                text = await res.text()
                raise RuntimeError(f"Spotify token error: HTTP {res.status} - {text[:200]}")
            payload = await res.json()
            self.access_token = payload["access_token"]
            expires_in = payload.get("expires_in", 3600)
            self.expires_at = now + max(0, expires_in - 60)
            return self.access_token

    async def fetch_json(
        self,
        session: aiohttp.ClientSession,
        url: str,
        params: Optional[Dict[str, str]] = None,
        retry: int = 0,
    ) -> Dict:
        await self.throttle()
        token = await self.get_access_token(session)
        headers = {"Authorization": f"Bearer {token}"}
        async with session.get(url, params=params, headers=headers) as res:
            if res.status == 401:
                raise TokenExpired()
            if res.status == 429:
                retry_after = int(res.headers.get("retry-after", "1"))
                if SPOTIFY_RESPECT_RETRY_AFTER:
                    wait_sec = min(retry_after, max(1, SPOTIFY_RETRY_AFTER_CAP_SEC))
                    print(f"429 Too Many Requests. Retry-After={retry_after}s; waiting {wait_sec}s", flush=True)
                else:
                    wait_sec = max(retry_after, 1)
                if retry >= SPOTIFY_MAX_RETRIES:
                    raise RuntimeError("Spotify rate limit exceeded")
                await asyncio.sleep(wait_sec + 0.2)
                return await self.fetch_json(session, url, params, retry + 1)
            if res.status >= 500 and retry < SPOTIFY_MAX_RETRIES:
                await asyncio.sleep((retry + 1) * 0.4)
                return await self.fetch_json(session, url, params, retry + 1)
            if res.status != 200:
                text = await res.text()
                raise RuntimeError(f"Spotify API error: HTTP {res.status} - {text[:200]}")
            return await res.json()

    async def get_artist_albums(
        self,
        session: aiohttp.ClientSession,
        artist_id: str,
    ) -> List[Dict]:
        items: List[Dict] = []
        offset = 0
        limit = 50
        while True:
            params = {
                "include_groups": INCLUDE_GROUPS,
                "limit": str(limit),
                "offset": str(offset),
            }
            if MARKET:
                params["market"] = MARKET
            url = SPOTIFY_ARTIST_ALBUMS_URL.format(artist_id=artist_id)
            try:
                payload = await self.fetch_json(session, url, params=params)
            except TokenExpired:
                self.access_token = None
                payload = await self.fetch_json(session, url, params=params)
            page_items = payload.get("items", []) or []
            if not page_items:
                break
            items.extend(page_items)
            if len(page_items) < limit:
                break
            offset += limit
            await asyncio.sleep(SPOTIFY_BATCH_DELAY_MS / 1000)
        return items

    async def get_albums_batch(
        self,
        session: aiohttp.ClientSession,
        album_ids: List[str],
    ) -> List[Dict]:
        if not album_ids:
            return []
        url = "https://api.spotify.com/v1/albums"
        params = {"ids": ",".join(album_ids)}
        try:
            payload = await self.fetch_json(session, url, params=params)
        except TokenExpired:
            self.access_token = None
            payload = await self.fetch_json(session, url, params=params)
        albums = payload.get("albums", []) or []
        return [a for a in albums if a]

    async def get_artists_batch(
        self,
        session: aiohttp.ClientSession,
        artist_ids: List[str],
    ) -> List[Dict]:
        if not artist_ids:
            return []
        url = "https://api.spotify.com/v1/artists"
        params = {"ids": ",".join(artist_ids)}
        try:
            payload = await self.fetch_json(session, url, params=params)
        except TokenExpired:
            self.access_token = None
            payload = await self.fetch_json(session, url, params=params)
        artists = payload.get("artists", []) or []
        return [a for a in artists if a]


async def ensure_role(session: AsyncSession, role_name: str, role_group: str) -> str:
    stmt = select(Role).where(Role.role_name == role_name)
    result = await session.execute(stmt)
    role = result.scalars().first()
    if role:
        return role.role_id
    role_id = f"local:role:{uuid.uuid4()}"
    role = Role(role_id=role_id, role_name=role_name, role_group=role_group)
    session.add(role)
    await session.commit()
    return role_id


def pick_role_id(album_group: Optional[str], primary_role_id: str, featured_role_id: str) -> str:
    if album_group == "appears_on":
        return featured_role_id
    return primary_role_id


def load_cache(path: Path) -> Dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_cache(path: Path, data: Dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


CODE_TO_NAME = {
    "KR": "South Korea", "US": "United States", "UK": "United Kingdom",
    "CA": "Canada", "MX": "Mexico", "FR": "France", "DE": "Germany",
    "IT": "Italy", "ES": "Spain", "JP": "Japan", "CN": "China",
    "BR": "Brazil", "AR": "Argentina", "AU": "Australia", "SE": "Sweden",
    "NO": "Norway", "FI": "Finland", "NL": "Netherlands", "BE": "Belgium",
    "CH": "Switzerland", "AT": "Austria", "PL": "Poland", "PT": "Portugal",
    "IE": "Ireland", "GR": "Greece", "DK": "Denmark", "CZ": "Czech Republic",
    "HU": "Hungary", "RO": "Romania", "IN": "India", "TH": "Thailand",
    "MY": "Malaysia", "ID": "Indonesia", "PH": "Philippines", "SG": "Singapore",
    "TW": "Taiwan", "HK": "Hong Kong", "VN": "Vietnam", "CL": "Chile",
    "CO": "Colombia", "PE": "Peru", "VE": "Venezuela", "EC": "Ecuador",
    "UY": "Uruguay", "PY": "Paraguay", "CU": "Cuba", "JM": "Jamaica",
    "DO": "Dominican Republic", "PR": "Puerto Rico", "TT": "Trinidad and Tobago",
    "NZ": "New Zealand", "ZA": "South Africa", "NG": "Nigeria", "KE": "Kenya",
    "EG": "Egypt", "MA": "Morocco", "GH": "Ghana", "SN": "Senegal",
}
NAME_TO_CODE = {v: k for k, v in CODE_TO_NAME.items()}


async def query_musicbrainz_country(http_session: aiohttp.ClientSession, artist_name: str, mb_cache: Dict) -> Optional[str]:
    key = artist_name.strip().lower()
    cached = mb_cache.get(key)
    if cached:
        if cached.get("notFound"):
            return None
        code = cached.get("countryCode")
        if code:
            return code

    url = "https://musicbrainz.org/ws/2/artist"
    params = {"query": f"artist:{artist_name}", "fmt": "json", "limit": "5"}
    headers = {"User-Agent": "SonicTopography/1.0 (backfill)"}
    await asyncio.sleep(1.0)
    async with http_session.get(url, params=params, headers=headers) as res:
        if res.status != 200:
            return None
        payload = await res.json()
    artists = payload.get("artists", []) or []
    if not artists:
        mb_cache[key] = {"notFound": True, "countryCode": None}
        return None
    def name_match(a: Dict) -> bool:
        return a.get("name", "").replace(" ", "").lower() == artist_name.replace(" ", "").lower()
    artists.sort(key=lambda a: (0 if name_match(a) else 1, -(a.get("score") or 0)))
    best = artists[0]
    code = best.get("country")
    if not code and best.get("area", {}).get("name"):
        code = NAME_TO_CODE.get(best["area"]["name"])
    mb_cache[key] = {"notFound": False, "countryCode": code}
    return code


async def query_discogs_country(http_session: aiohttp.ClientSession, artist_name: str, album_title: str, discogs_cache: Dict) -> Optional[str]:
    if not DISCOGS_TOKEN:
        return None
    key = f"{artist_name}||{album_title}".lower()
    cached = discogs_cache.get(key)
    if cached:
        if cached.get("notFound"):
            return None
        return cached.get("countryCode")
    query = f"{artist_name} {album_title}"
    url = "https://api.discogs.com/database/search"
    params = {"q": query, "type": "release", "token": DISCOGS_TOKEN, "per_page": "5"}
    await asyncio.sleep(1.1)
    async with http_session.get(url, params=params) as res:
        if res.status != 200:
            return None
        payload = await res.json()
    results = payload.get("results", []) or []
    if not results:
        discogs_cache[key] = {"notFound": True, "countryCode": None}
        return None
    best = results[0]
    country_name = best.get("country")
    code = NAME_TO_CODE.get(country_name) if country_name else None
    discogs_cache[key] = {"notFound": False, "countryCode": code}
    return code


async def main() -> None:
    client_id = os.getenv("SPOTIFY_CLIENT_ID")
    client_secret = os.getenv("SPOTIFY_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise RuntimeError("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET")

    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        stmt = select(AlbumGroup.album_group_id).where(
            AlbumGroup.album_group_id.like("spotify:album:%")
        )
        result = await session.execute(stmt)
        existing_album_ids = set(result.scalars().all())

        stmt = select(CreatorSpotifyProfile.creator_id)
        result = await session.execute(stmt)
        creator_ids = list(result.scalars().all())

        primary_role_id = await ensure_role(session, "Primary Artist", "artist")
        featured_role_id = await ensure_role(session, "Featured Artist", "artist")

    if CREATOR_START or CREATOR_LIMIT:
        creator_ids = creator_ids[CREATOR_START:]
        if CREATOR_LIMIT > 0:
            creator_ids = creator_ids[:CREATOR_LIMIT]

    print(f"Creators to process: {len(creator_ids)}", flush=True)
    print(f"Existing spotify albums in DB: {len(existing_album_ids)}", flush=True)
    print(f"Include groups: {INCLUDE_GROUPS}", flush=True)
    print(f"Update existing album metadata: {'yes' if UPDATE_EXISTING else 'no'}", flush=True)
    print(f"Enrich country (MB + Discogs): {'yes' if ENRICH_COUNTRY else 'no'}", flush=True)

    spotify = SpotifyClient(client_id, client_secret)

    album_rows: List[Dict] = []
    link_rows: List[Dict] = []
    credit_rows: List[Dict] = []
    cache_rows: List[Dict] = []
    inserted_albums = 0
    inserted_links = 0
    inserted_credits = 0

    mb_cache = load_cache(MB_CACHE_FILE) if ENRICH_COUNTRY else {}
    discogs_cache = load_cache(DISCOGS_CACHE_FILE) if ENRICH_COUNTRY else {}
    artist_cache: Dict[str, Dict] = {}
    started_at = time.time()

    timeout = aiohttp.ClientTimeout(total=45, connect=10, sock_connect=10, sock_read=25)
    async with aiohttp.ClientSession(timeout=timeout) as http_session:
        for idx, creator_id in enumerate(creator_ids, start=1):
            if not creator_id.startswith("spotify:artist:"):
                continue
            artist_id = creator_id.replace("spotify:artist:", "", 1)

            print(f"[{idx}/{len(creator_ids)}] fetching albums for {creator_id}", flush=True)
            try:
                albums = await asyncio.wait_for(
                    spotify.get_artist_albums(http_session, artist_id),
                    timeout=45,
                )
            except Exception as e:
                print(f"[{idx}/{len(creator_ids)}] fetch failed: {e}", flush=True)
                continue
            if not albums:
                continue

            summary_by_id: Dict[str, Dict] = {}
            for album in albums:
                raw_album_id = album.get("id")
                if not raw_album_id:
                    continue
                summary_by_id[raw_album_id] = album

            creator_new_albums = 0
            creator_links = 0
            creator_credits = 0

            # Upsert links + credits only for albums that already exist in DB
            pending_new_ids = set()
            for raw_album_id, summary in summary_by_id.items():
                album_group_id = to_album_group_id(raw_album_id)
                if album_group_id not in existing_album_ids:
                    pending_new_ids.add(raw_album_id)
                    continue
                album_group = summary.get("album_group")
                role_id = pick_role_id(album_group, primary_role_id, featured_role_id)

                spotify_url = None
                if isinstance(summary.get("external_urls"), dict):
                    spotify_url = summary["external_urls"].get("spotify")
                if not spotify_url:
                    spotify_url = f"https://open.spotify.com/album/{raw_album_id}"

                link_rows.append(
                    {
                        "album_group_id": album_group_id,
                        "provider": "spotify",
                        "url": spotify_url,
                        "external_id": raw_album_id,
                        "is_primary": True,
                    }
                )
                inserted_links += 1
                creator_links += 1

                credit_rows.append(
                    {
                        "album_group_id": album_group_id,
                        "creator_id": creator_id,
                        "role_id": role_id,
                        "credit_order": None,
                        "source_confidence": 50,
                    }
                )
                inserted_credits += 1
                creator_credits += 1

            detail_ids = []
            for raw_album_id in summary_by_id.keys():
                album_group_id = to_album_group_id(raw_album_id)
                should_insert = album_group_id not in existing_album_ids
                if should_insert or UPDATE_EXISTING:
                    detail_ids.append(raw_album_id)

            # Fetch album details in batches
            for start in range(0, len(detail_ids), 20):
                batch_ids = detail_ids[start:start + 20]
                detailed = await spotify.get_albums_batch(http_session, batch_ids)

                # Preload artist genres
                artist_ids = []
                for alb in detailed:
                    artists = alb.get("artists") or []
                    if artists:
                        artist_ids.append(artists[0].get("id"))
                artist_ids = [a for a in set(artist_ids) if a]
                new_artist_ids = [a for a in artist_ids if a not in artist_cache]
                if new_artist_ids:
                    for i in range(0, len(new_artist_ids), 50):
                        batch = new_artist_ids[i:i + 50]
                        artists = await spotify.get_artists_batch(http_session, batch)
                        for art in artists:
                            if art.get("id"):
                                artist_cache[art["id"]] = art

                for album_detail in detailed:
                    raw_album_id = album_detail.get("id")
                    if not raw_album_id:
                        continue
                    album_group_id = to_album_group_id(raw_album_id)
                    summary = summary_by_id.get(raw_album_id, {})

                    album_group = summary.get("album_group")

                    release_date_str = album_detail.get("release_date")
                    release_precision = album_detail.get("release_date_precision")
                    release_date = parse_release_date(release_date_str, release_precision)
                    year = None
                    if release_date_str and len(release_date_str) >= 4:
                        try:
                            year = int(release_date_str[:4])
                        except Exception:
                            year = None

                    artists = album_detail.get("artists") or []
                    primary_artist = artists[0].get("name") if artists else None
                    primary_artist_id = artists[0].get("id") if artists else None
                    artist_genres = []
                    if primary_artist_id and primary_artist_id in artist_cache:
                        artist_genres = artist_cache[primary_artist_id].get("genres") or []

                    primary_genre = artist_genres[0] if artist_genres else None

                    country_code = None
                    if ENRICH_COUNTRY and primary_artist:
                        country_code = await query_musicbrainz_country(http_session, primary_artist, mb_cache)
                        if not country_code:
                            country_code = await query_discogs_country(http_session, primary_artist, album_detail.get("name") or "", discogs_cache)

                    should_insert = album_group_id not in existing_album_ids
                    if should_insert or UPDATE_EXISTING:
                        album_rows.append(
                            {
                                "album_group_id": album_group_id,
                                "title": album_detail.get("name") or "Unknown Title",
                                "primary_artist_display": primary_artist or "Unknown Artist",
                                "original_year": year,
                                "earliest_release_date": release_date,
                                "country_code": country_code,
                                "primary_genre": primary_genre,
                                "popularity": (album_detail.get("popularity") or 0) / 100.0,
                                "cover_url": (album_detail.get("images") or [{}])[0].get("url"),
                            }
                        )
                        if should_insert:
                            existing_album_ids.add(album_group_id)
                            inserted_albums += 1
                            creator_new_albums += 1
                            # For newly inserted albums, add link + credit now
                            spotify_url = None
                            if isinstance(album_detail.get("external_urls"), dict):
                                spotify_url = album_detail["external_urls"].get("spotify")
                            if not spotify_url:
                                spotify_url = f"https://open.spotify.com/album/{raw_album_id}"

                            link_rows.append(
                                {
                                    "album_group_id": album_group_id,
                                    "provider": "spotify",
                                    "url": spotify_url,
                                    "external_id": raw_album_id,
                                    "is_primary": True,
                                }
                            )
                            inserted_links += 1
                            creator_links += 1

                            credit_rows.append(
                                {
                                    "album_group_id": album_group_id,
                                    "creator_id": creator_id,
                                    "role_id": role_id,
                                    "credit_order": None,
                                    "source_confidence": 50,
                                }
                            )
                            inserted_credits += 1
                            creator_credits += 1

                    cache_rows.append(
                        {
                            "album_group_id": album_group_id,
                            "cached_json": {
                                "label": album_detail.get("label"),
                                "spotify_album_type": album_detail.get("album_type"),
                                "spotify_album_group": album_group,
                            },
                        }
                    )

                    if (
                        len(album_rows) + len(link_rows) + len(credit_rows) + len(cache_rows)
                        >= BATCH_SIZE
                    ):
                        async with async_session() as session:
                            if album_rows:
                                stmt = insert(AlbumGroup).values(album_rows)
                                if UPDATE_EXISTING:
                                    stmt = stmt.on_conflict_do_update(
                                        index_elements=[AlbumGroup.album_group_id],
                                        set_={
                                            "title": stmt.excluded.title,
                                            "primary_artist_display": stmt.excluded.primary_artist_display,
                                            "original_year": stmt.excluded.original_year,
                                            "earliest_release_date": stmt.excluded.earliest_release_date,
                                            "country_code": func.coalesce(stmt.excluded.country_code, AlbumGroup.country_code),
                                            "primary_genre": func.coalesce(stmt.excluded.primary_genre, AlbumGroup.primary_genre),
                                            "popularity": func.coalesce(stmt.excluded.popularity, AlbumGroup.popularity),
                                            "cover_url": func.coalesce(stmt.excluded.cover_url, AlbumGroup.cover_url),
                                        },
                                    )
                                else:
                                    stmt = stmt.on_conflict_do_nothing(
                                        index_elements=[AlbumGroup.album_group_id]
                                    )
                                await session.execute(stmt)
                            if link_rows:
                                await session.execute(
                                    insert(AlbumLink)
                                    .values(link_rows)
                                    .on_conflict_do_nothing(
                                        index_elements=[
                                            AlbumLink.album_group_id,
                                            AlbumLink.provider,
                                            AlbumLink.url,
                                        ]
                                    )
                                )
                            if credit_rows:
                                await session.execute(
                                    insert(AlbumCredit)
                                    .values(credit_rows)
                                    .on_conflict_do_nothing(
                                        index_elements=[
                                            AlbumCredit.album_group_id,
                                            AlbumCredit.creator_id,
                                            AlbumCredit.role_id,
                                        ]
                                    )
                                )
                            if cache_rows:
                                cache_stmt = insert(AlbumDetailsCache).values(cache_rows)
                                cache_stmt = cache_stmt.on_conflict_do_update(
                                    index_elements=[AlbumDetailsCache.album_group_id],
                                    set_={"cached_json": cache_stmt.excluded.cached_json},
                                )
                                await session.execute(cache_stmt)
                            await session.commit()
                        album_rows.clear()
                        link_rows.clear()
                        credit_rows.clear()
                        cache_rows.clear()

            if idx % 50 == 0:
                elapsed = max(1, int(time.time() - started_at))
                rate = idx / elapsed
                remaining = int((len(creator_ids) - idx) / rate) if rate > 0 else 0
                print(
                    f"Processed {idx}/{len(creator_ids)} creators | "
                    f"+albums {creator_new_albums} | +links {creator_links} | +credits {creator_credits} | "
                    f"rate {rate:.2f}/s | eta {remaining//60}m{remaining%60:02d}s"
                , flush=True)
            elif creator_new_albums or creator_links or creator_credits:
                print(
                    f"[{idx}/{len(creator_ids)}] {creator_id} | "
                    f"+albums {creator_new_albums} | +links {creator_links} | +credits {creator_credits}"
                , flush=True)
            elif idx % 10 == 0:
                print(f"[{idx}/{len(creator_ids)}] heartbeat", flush=True)

    if album_rows or link_rows or credit_rows or cache_rows:
        async with async_session() as session:
            if album_rows:
                stmt = insert(AlbumGroup).values(album_rows)
                if UPDATE_EXISTING:
                    stmt = stmt.on_conflict_do_update(
                        index_elements=[AlbumGroup.album_group_id],
                        set_={
                            "title": stmt.excluded.title,
                            "primary_artist_display": stmt.excluded.primary_artist_display,
                            "original_year": stmt.excluded.original_year,
                            "earliest_release_date": stmt.excluded.earliest_release_date,
                            "country_code": func.coalesce(stmt.excluded.country_code, AlbumGroup.country_code),
                            "primary_genre": func.coalesce(stmt.excluded.primary_genre, AlbumGroup.primary_genre),
                            "popularity": func.coalesce(stmt.excluded.popularity, AlbumGroup.popularity),
                            "cover_url": func.coalesce(stmt.excluded.cover_url, AlbumGroup.cover_url),
                        },
                    )
                else:
                    stmt = stmt.on_conflict_do_nothing(
                        index_elements=[AlbumGroup.album_group_id]
                    )
                await session.execute(stmt)
            if link_rows:
                await session.execute(
                    insert(AlbumLink)
                    .values(link_rows)
                    .on_conflict_do_nothing(
                        index_elements=[
                            AlbumLink.album_group_id,
                            AlbumLink.provider,
                            AlbumLink.url,
                        ]
                    )
                )
            if credit_rows:
                await session.execute(
                    insert(AlbumCredit)
                    .values(credit_rows)
                    .on_conflict_do_nothing(
                        index_elements=[
                            AlbumCredit.album_group_id,
                            AlbumCredit.creator_id,
                            AlbumCredit.role_id,
                        ]
                    )
                )
            if cache_rows:
                cache_stmt = insert(AlbumDetailsCache).values(cache_rows)
                cache_stmt = cache_stmt.on_conflict_do_update(
                    index_elements=[AlbumDetailsCache.album_group_id],
                    set_={"cached_json": cache_stmt.excluded.cached_json},
                )
                await session.execute(cache_stmt)
            await session.commit()

    if ENRICH_COUNTRY:
        save_cache(MB_CACHE_FILE, mb_cache)
        save_cache(DISCOGS_CACHE_FILE, discogs_cache)

    await engine.dispose()

    print("\nBackfill complete.", flush=True)
    print(f"Album groups inserted (attempted): {inserted_albums}", flush=True)
    print(f"Album links upserted (attempted): {inserted_links}", flush=True)
    print(f"Album credits upserted (attempted): {inserted_credits}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
