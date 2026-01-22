"""
Import v3 album data into album_groups + map_nodes + releases.

Usage:
  docker exec sonic_backend python scripts/db/import_album_groups.py
"""

import json
import asyncio
import uuid
import sys
from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select

# Docker 컨테이너 내부에서는 /app이 루트
sys.path.insert(0, "/app")

from app.database import DATABASE_URL, Base
from app.models import AlbumGroup, MapNode, Release

JSON_PATH = Path("/out/albums_spotify_v3.json")

def to_release_id():
    return f"local:release:{uuid.uuid4()}"

async def main():
    if not JSON_PATH.exists():
        print(f"❌ File not found: {JSON_PATH}")
        return

    with open(JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    albums = data.get("albums", [])
    print(f"📊 Total albums in JSON: {len(albums)}")

    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # existing ids
    async with async_session() as session:
        stmt = select(AlbumGroup.album_group_id)
        result = await session.execute(stmt)
        existing_ids = set(result.scalars().all())
        print(f"📋 Existing album_groups in DB: {len(existing_ids)}")

    new_groups = []
    new_nodes = []
    new_releases = []
    skipped = 0

    for album in albums:
        album_id = album.get("albumId")
        if not album_id:
            continue
        if album_id in existing_ids:
            skipped += 1
            continue

        title = album.get("title", "Unknown Title")
        artist = album.get("artistName", "Unknown Artist")
        year = album.get("year")
        release_date_str = album.get("releaseDate")  # "YYYY-MM-DD" 형식
        country = album.get("country")
        primary_genre = album.get("genreFamily", album.get("primaryGenre"))
        popularity = album.get("popularity", 0) / 100.0
        cover_url = album.get("artworkUrl")
        genre_vibe = album.get("genreVibe", 0.5)
        
        # release_date를 Date 객체로 변환 (있으면)
        release_date = None
        if release_date_str:
            try:
                from datetime import datetime
                release_date = datetime.fromisoformat(release_date_str).date()
            except (ValueError, AttributeError):
                # 파싱 실패 시 None으로 유지
                pass

        new_groups.append(AlbumGroup(
            album_group_id=album_id,
            title=title,
            primary_artist_display=artist,
            original_year=year,
            earliest_release_date=release_date,  # 최초 릴리스 날짜 저장
            country_code=country,
            primary_genre=primary_genre,
            popularity=popularity,
            cover_url=cover_url
        ))

        new_nodes.append(MapNode(
            album_group_id=album_id,
            x=year or 0,
            y=genre_vibe,
            size=(popularity * 10) + 2
        ))

        new_releases.append(Release(
            release_id=to_release_id(),
            album_group_id=album_id,
            release_title=title,
            release_date=release_date  # 릴리스 날짜 저장
        ))

    print(f"📊 To insert: {len(new_groups)} album_groups, {len(new_nodes)} map_nodes, {len(new_releases)} releases")

    async with async_session() as session:
        session.add_all(new_groups)
        session.add_all(new_nodes)
        session.add_all(new_releases)
        await session.commit()

    print(f"✅ Import complete. Skipped: {skipped}")

if __name__ == "__main__":
    asyncio.run(main())
