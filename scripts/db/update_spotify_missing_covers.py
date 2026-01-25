"""
Fill missing Spotify album covers using MusicBrainz/Discogs.

Strategy:
1) Find Spotify albums with missing cover_url.
2) Try MusicBrainz release-group match (strict).
3) Fallback to Discogs search (strict).
4) Update cover_url only on confident match.

Env:
  DISCOGS_TOKEN (optional)
  COVER_LIMIT (optional, default: 0 = no limit)
  DRY_RUN (optional, "1" to skip DB updates)
"""

import asyncio
import json
import os
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path

import httpx
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select

# Docker 컨테이너 내부에서는 /app이 루트
sys.path.insert(0, "/app")
from app.models import AlbumGroup

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://sonic:0416@localhost:5432/sonic_db"
)

DISCOGS_TOKEN = os.getenv("DISCOGS_TOKEN")
COVER_LIMIT = int(os.getenv("COVER_LIMIT", "0"))
DRY_RUN = os.getenv("DRY_RUN", "0") == "1"

MB_CACHE_FILE = Path("./out/cover_cache_mb.json")
DISCOGS_CACHE_FILE = Path("./out/cover_cache_discogs.json")

MB_RATE_LIMIT_SEC = 1.0
DISCOGS_RATE_LIMIT_SEC = 1.1


def normalize_text(text: str) -> str:
    if not text:
        return ""
    text = text.lower()
    text = re.sub(r"\([^)]*\)", " ", text)
    text = re.sub(r"\[[^]]*\]", " ", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def load_cache(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_cache(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


async def mb_search_release_group(client: httpx.AsyncClient, artist: str, title: str, year: int | None):
    query_parts = [f'release-group:"{title}"', f'artist:"{artist}"']
    if year:
        query_parts.append(f'firstreleaseyear:{year}')
    query = " AND ".join(query_parts)
    url = "https://musicbrainz.org/ws/2/release-group"
    params = {"query": query, "fmt": "json", "limit": 5}
    res = await client.get(url, params=params, headers={"User-Agent": "MusicMapApp/1.0 (contact@example.com)"})
    res.raise_for_status()
    return res.json().get("release-groups", [])


async def mb_cover_exists(client: httpx.AsyncClient, rg_id: str) -> bool:
    url = f"https://coverartarchive.org/release-group/{rg_id}/front-500"
    res = await client.head(url)
    return res.status_code == 200


def pick_mb_candidate(artist: str, title: str, year: int | None, candidates: list[dict]) -> dict | None:
    norm_artist = normalize_text(artist)
    norm_title = normalize_text(title)
    best = None
    best_score = 0.0
    for c in candidates:
        c_title = c.get("title", "")
        c_artist_credits = c.get("artist-credit") or []
        c_artist = c_artist_credits[0].get("name") if c_artist_credits else ""
        c_year = None
        if c.get("first-release-date"):
            try:
                c_year = int(str(c.get("first-release-date"))[:4])
            except Exception:
                c_year = None
        title_sim = similarity(norm_title, normalize_text(c_title))
        artist_sim = similarity(norm_artist, normalize_text(c_artist))
        year_bonus = 0.0
        if year and c_year and abs(year - c_year) <= 1:
            year_bonus = 0.05
        mb_score = float(c.get("score", 0)) / 100.0
        combined = (0.45 * title_sim) + (0.45 * artist_sim) + (0.10 * mb_score) + year_bonus
        if combined > best_score:
            best_score = combined
            best = c
    if best_score >= 0.90:
        return best
    return None


async def discogs_search(client: httpx.AsyncClient, artist: str, title: str, year: int | None):
    if not DISCOGS_TOKEN:
        return []
    params = {
        "type": "release",
        "artist": artist,
        "release_title": title,
        "token": DISCOGS_TOKEN,
        "per_page": 5,
    }
    if year:
        params["year"] = year
    res = await client.get("https://api.discogs.com/database/search", params=params)
    res.raise_for_status()
    return res.json().get("results", [])


def pick_discogs_candidate(artist: str, title: str, year: int | None, results: list[dict]) -> dict | None:
    norm_artist = normalize_text(artist)
    norm_title = normalize_text(title)
    best = None
    best_score = 0.0
    for r in results:
        r_title = r.get("title", "")
        # Discogs title often "Artist - Album"
        if " - " in r_title:
            r_artist, r_album = r_title.split(" - ", 1)
        else:
            r_artist, r_album = "", r_title
        title_sim = similarity(norm_title, normalize_text(r_album))
        artist_sim = similarity(norm_artist, normalize_text(r_artist))
        year_bonus = 0.0
        r_year = r.get("year")
        if year and r_year and abs(year - int(r_year)) <= 1:
            year_bonus = 0.05
        combined = (0.5 * title_sim) + (0.45 * artist_sim) + year_bonus
        if combined > best_score:
            best_score = combined
            best = r
    if best_score >= 0.90:
        return best
    return None


async def main():
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    mb_cache = load_cache(MB_CACHE_FILE)
    discogs_cache = load_cache(DISCOGS_CACHE_FILE)

    async with async_session() as session:
        stmt = select(AlbumGroup).where(
            AlbumGroup.album_group_id.like("spotify:album:%"),
            (AlbumGroup.cover_url == None) | (AlbumGroup.cover_url == "")
        )
        result = await session.execute(stmt)
        albums = result.scalars().all()

        if COVER_LIMIT > 0:
            albums = albums[:COVER_LIMIT]

        print(f"🖼️  Missing Spotify covers: {len(albums)} (limit={COVER_LIMIT or 'all'})")

        updated = 0
        async with httpx.AsyncClient(timeout=30) as client:
            for idx, album in enumerate(albums, start=1):
                album_id = album.album_group_id
                title = album.title or ""
                artist = album.primary_artist_display or ""
                year = album.original_year

                cache_key = f"{album_id}"
                if cache_key in mb_cache and mb_cache[cache_key].get("cover_url"):
                    cover_url = mb_cache[cache_key]["cover_url"]
                    if not DRY_RUN:
                        album.cover_url = cover_url
                    updated += 1
                    continue

                cover_url = None

                # 1) MusicBrainz
                try:
                    candidates = await mb_search_release_group(client, artist, title, year)
                    mb_best = pick_mb_candidate(artist, title, year, candidates)
                    if mb_best:
                        rg_id = mb_best.get("id")
                        if rg_id and await mb_cover_exists(client, rg_id):
                            cover_url = f"https://coverartarchive.org/release-group/{rg_id}/front-500"
                except Exception:
                    cover_url = None

                await asyncio.sleep(MB_RATE_LIMIT_SEC)

                # 2) Discogs fallback
                if not cover_url and DISCOGS_TOKEN:
                    cached_discogs = discogs_cache.get(cache_key)
                    if cached_discogs:
                        if cached_discogs.get("cover_url"):
                            cover_url = cached_discogs["cover_url"]
                        elif cached_discogs.get("notFound"):
                            cover_url = None
                        if cover_url:
                            if not DRY_RUN:
                                album.cover_url = cover_url
                            updated += 1
                            continue
                    try:
                        results = await discogs_search(client, artist, title, year)
                        discogs_best = pick_discogs_candidate(artist, title, year, results)
                        if discogs_best:
                            cover_url = discogs_best.get("cover_image")
                    except Exception:
                        cover_url = None
                    await asyncio.sleep(DISCOGS_RATE_LIMIT_SEC)

                mb_cache[cache_key] = {
                    "cover_url": cover_url,
                    "source": "musicbrainz" if cover_url and "coverartarchive.org" in cover_url else "discogs" if cover_url else None,
                }
                discogs_cache[cache_key] = {
                    "cover_url": cover_url if cover_url and "coverartarchive.org" not in cover_url else None,
                    "notFound": cover_url is None,
                }
                save_cache(MB_CACHE_FILE, mb_cache)
                save_cache(DISCOGS_CACHE_FILE, discogs_cache)

                if cover_url:
                    if not DRY_RUN:
                        album.cover_url = cover_url
                    updated += 1

                if idx % 50 == 0:
                    print(f"Processed {idx}/{len(albums)} | Updated: {updated}")

            if not DRY_RUN:
                await session.commit()

    await engine.dispose()
    print(f"✅ Done. Updated covers: {updated}")


if __name__ == "__main__":
    asyncio.run(main())
