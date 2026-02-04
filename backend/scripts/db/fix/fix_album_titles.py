import asyncio
import base64
import os
from typing import List, Dict

import aiohttp
import asyncpg


SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_ALBUMS_URL = "https://api.spotify.com/v1/albums"


def chunk(items: List[str], size: int) -> List[List[str]]:
    return [items[i:i + size] for i in range(0, len(items), size)]


def is_broken(text: str) -> bool:
    if not text:
        return True
    if "�" in text or "占" in text:
        return True
    if text.count("?") >= 2:
        return True
    return False


async def get_spotify_token(session: aiohttp.ClientSession) -> str:
    client_id = os.getenv("SPOTIFY_CLIENT_ID")
    client_secret = os.getenv("SPOTIFY_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise RuntimeError("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET")

    auth = base64.b64encode(f"{client_id}:{client_secret}".encode("utf-8")).decode("ascii")
    data = {"grant_type": "client_credentials"}
    headers = {"Authorization": f"Basic {auth}"}

    async with session.post(SPOTIFY_TOKEN_URL, data=data, headers=headers) as res:
        if res.status != 200:
            text = await res.text()
            raise RuntimeError(f"Token request failed: {res.status} {text}")
        payload = await res.json()
        return payload["access_token"]


async def fetch_spotify_albums(
    session: aiohttp.ClientSession,
    token: str,
    ids: List[str],
) -> List[Dict]:
    params = {"ids": ",".join(ids)}
    headers = {"Authorization": f"Bearer {token}"}

    for attempt in range(6):
        async with session.get(SPOTIFY_ALBUMS_URL, params=params, headers=headers) as res:
            if res.status == 429:
                retry_after = int(res.headers.get("Retry-After", "1"))
                await asyncio.sleep(retry_after + 0.2)
                continue
            if res.status >= 500 and attempt < 5:
                await asyncio.sleep(0.5 * (attempt + 1))
                continue
            if res.status != 200:
                text = await res.text()
                raise RuntimeError(f"Albums request failed: {res.status} {text}")
            payload = await res.json()
            return payload.get("albums", [])
    return []


async def main() -> None:
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("Missing DATABASE_URL")
    if db_url.startswith("postgresql+asyncpg://"):
        db_url = db_url.replace("postgresql+asyncpg://", "postgresql://", 1)

    async with asyncpg.create_pool(dsn=db_url, min_size=1, max_size=4) as pool:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT album_group_id
                FROM album_groups
                WHERE title ~ '\\?{2,}'
                   OR title LIKE '%�%'
                   OR title LIKE '%占%'
                   OR primary_artist_display ~ '\\?{2,}'
                   OR primary_artist_display LIKE '%�%'
                   OR primary_artist_display LIKE '%占%'
                """
            )
            album_ids = [r["album_group_id"] for r in rows if r["album_group_id"].startswith("spotify:album:")]

    if not album_ids:
        print("No album_group titles to fix.")
        return

    spotify_ids = [a.replace("spotify:album:", "") for a in album_ids]
    fixed = 0
    skipped = 0

    async with aiohttp.ClientSession() as session:
        token = await get_spotify_token(session)

        async with asyncpg.create_pool(dsn=db_url, min_size=1, max_size=4) as pool:
            for batch in chunk(spotify_ids, 20):
                albums = await fetch_spotify_albums(session, token, batch)
                async with pool.acquire() as conn:
                    for album in albums:
                        if not album or not album.get("id"):
                            continue
                        title = album.get("name") or ""
                        artists = album.get("artists") or []
                        artist_display = ", ".join([a.get("name", "") for a in artists if a.get("name")])

                        if is_broken(title):
                            skipped += 1
                            continue

                        album_id = f"spotify:album:{album['id']}"
                        await conn.execute(
                            """
                            UPDATE album_groups
                            SET title = $1,
                                primary_artist_display = CASE
                                  WHEN primary_artist_display ~ '\\?{2,}'
                                    OR primary_artist_display LIKE '%�%'
                                    OR primary_artist_display LIKE '%占%'
                                  THEN $2
                                  ELSE primary_artist_display
                                END,
                                updated_at = NOW()
                            WHERE album_group_id = $3
                            """,
                            title,
                            artist_display,
                            album_id,
                        )
                        fixed += 1

                await asyncio.sleep(0.2)

    print(f"Fixed titles: {fixed}")
    print(f"Skipped titles (still invalid): {skipped}")


if __name__ == "__main__":
    asyncio.run(main())
