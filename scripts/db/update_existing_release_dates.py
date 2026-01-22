"""
기존 데이터의 발매일 업데이트

Spotify JSON 파일에서 releaseDate를 읽어서 기존 DB 레코드를 업데이트

Usage:
  docker exec sonic_backend python scripts/db/update_existing_release_dates.py
"""

import json
import asyncio
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, "/app")

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, update
from app.database import DATABASE_URL
from app.models import AlbumGroup, Release

JSON_PATH = Path("/out/albums_spotify_v3.json")


async def main():
    print("\n" + "="*70)
    print("📅 기존 데이터 발매일 업데이트")
    print("="*70 + "\n")
    
    if not JSON_PATH.exists():
        print(f"❌ File not found: {JSON_PATH}")
        return
    
    # JSON 로드
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    albums = data.get("albums", [])
    print(f"📊 JSON 앨범 수: {len(albums)}")
    
    # DB 연결
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    updated_releases = 0
    updated_groups = 0
    skipped = 0
    
    for album in albums:
        album_id = album.get("albumId")
        release_date_str = album.get("releaseDate")
        
        if not album_id or not release_date_str:
            skipped += 1
            continue
        
        # Date 객체로 변환
        try:
            release_date = datetime.fromisoformat(release_date_str).date()
        except (ValueError, AttributeError):
            skipped += 1
            continue
        
        # DB 업데이트
        async with async_session() as session:
            # 1. Release 업데이트
            stmt = (
                update(Release)
                .where(Release.album_group_id == album_id)
                .values(release_date=release_date)
            )
            result = await session.execute(stmt)
            if result.rowcount > 0:
                updated_releases += result.rowcount
            
            # 2. AlbumGroup의 earliest_release_date 업데이트
            stmt = (
                update(AlbumGroup)
                .where(AlbumGroup.album_group_id == album_id)
                .values(earliest_release_date=release_date)
            )
            result = await session.execute(stmt)
            if result.rowcount > 0:
                updated_groups += 1
            
            await session.commit()
        
        if (updated_releases + skipped) % 100 == 0:
            print(f"진행중: {updated_releases + skipped}/{len(albums)}...")
    
    # 통계 출력
    async with async_session() as session:
        stmt = select(AlbumGroup).where(AlbumGroup.earliest_release_date.isnot(None))
        result = await session.execute(stmt)
        total_with_dates = len(result.scalars().all())
        
        stmt = select(AlbumGroup)
        result = await session.execute(stmt)
        total = len(result.scalars().all())
    
    print("\n" + "="*70)
    print("✅ 발매일 업데이트 완료")
    print("="*70)
    print(f"\n📈 결과:")
    print(f"   • 업데이트된 releases: {updated_releases}개")
    print(f"   • 업데이트된 album_groups: {updated_groups}개")
    print(f"   • 스킵: {skipped}개")
    print(f"\n📊 전체 통계:")
    print(f"   • 발매일 있음: {total_with_dates}/{total} ({total_with_dates/total*100:.1f}%)")
    print()


if __name__ == "__main__":
    asyncio.run(main())
