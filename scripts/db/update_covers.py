"""
기존 DB 앨범들의 커버 이미지를 업데이트하는 스크립트

- MusicBrainz 앨범: Cover Art Archive에서 커버 가져오기
- Last.fm 앨범: Last.fm API로 커버 가져오기 (선택사항)
- 커버가 없거나 더미 이미지인 앨범들을 업데이트
"""

import asyncio
import os
import sys
import re
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, update

# Docker 컨테이너 내부에서는 /app이 루트
sys.path.insert(0, '/app')
from app.models import AlbumGroup

# DB 연결
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://sonic:0416@localhost:5432/sonic_db"
)

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def update_musicbrainz_covers():
    """MusicBrainz 앨범들의 커버 이미지 업데이트"""
    print("\n🎨 Updating MusicBrainz album covers...")
    
    async with async_session() as session:
        # MusicBrainz 앨범들 조회 (커버가 없는 것들)
        stmt = select(AlbumGroup).where(
            AlbumGroup.album_group_id.like('musicbrainz:release-group:%'),
            (AlbumGroup.cover_url == None) | (AlbumGroup.cover_url.like('%picsum.photos%'))
        )
        result = await session.execute(stmt)
        albums = result.scalars().all()
        
        print(f"📊 Found {len(albums)} MusicBrainz albums without covers")
        
        updated_count = 0
        for album in albums:
            # MusicBrainz Release Group ID 추출
            # 예: "musicbrainz:release-group:abc123" -> "abc123"
            match = re.match(r'musicbrainz:release-group:(.+)', album.album_group_id)
            if match:
                rg_id = match.group(1)
                cover_url = f"https://coverartarchive.org/release-group/{rg_id}/front-500"
                
                # 앨범 업데이트
                album.cover_url = cover_url
                updated_count += 1
                
                if updated_count % 50 == 0:
                    print(f"   ✅ Updated: {updated_count}/{len(albums)}")
        
        # DB에 커밋
        await session.commit()
        print(f"\n✅ Successfully updated {updated_count} MusicBrainz album covers!")
        return updated_count


async def update_lastfm_covers():
    """Last.fm 앨범들의 커버 이미지 업데이트 (선택사항)"""
    print("\n🎨 Checking Last.fm album covers...")
    
    async with async_session() as session:
        # Last.fm 앨범들 조회 (커버가 없는 것들)
        stmt = select(AlbumGroup).where(
            AlbumGroup.album_group_id.like('lastfm:%'),
            (AlbumGroup.cover_url == None) | (AlbumGroup.cover_url.like('%picsum.photos%'))
        )
        result = await session.execute(stmt)
        albums = result.scalars().all()
        
        print(f"📊 Found {len(albums)} Last.fm albums without covers")
        
        if len(albums) == 0:
            print("   ✅ All Last.fm albums already have covers!")
            return 0
        
        print("   ℹ️  Last.fm covers require API calls - skipping for now")
        print("   💡 Run scripts/fetch/lastfm.py to collect albums with covers")
        return 0


async def update_dummy_covers():
    """더미 이미지(picsum)를 사용하는 앨범들 통계"""
    print("\n📊 Checking for dummy covers (picsum.photos)...")
    
    async with async_session() as session:
        stmt = select(AlbumGroup).where(AlbumGroup.cover_url.like('%picsum.photos%'))
        result = await session.execute(stmt)
        albums = result.scalars().all()
        
        print(f"   Found {len(albums)} albums with dummy covers")
        
        if len(albums) > 0:
            print("\n   These are likely test/seed data. Consider:")
            print("   1. Delete them: DELETE FROM albums WHERE cover_url LIKE '%picsum.photos%';")
            print("   2. Or ignore them (they're just test data)")
        
        return len(albums)


async def show_cover_stats():
    """커버 이미지 통계 출력"""
    print("\n" + "=" * 60)
    print("📊 Album Cover Statistics")
    print("=" * 60)
    
    async with async_session() as session:
        # 전체 앨범 수
        stmt = select(AlbumGroup)
        result = await session.execute(stmt)
        total = len(result.scalars().all())
        
        # 커버가 있는 앨범
        stmt = select(AlbumGroup).where(AlbumGroup.cover_url != None, AlbumGroup.cover_url != '')
        result = await session.execute(stmt)
        with_covers = len(result.scalars().all())
        
        # 커버가 없는 앨범
        stmt = select(AlbumGroup).where((AlbumGroup.cover_url == None) | (AlbumGroup.cover_url == ''))
        result = await session.execute(stmt)
        without_covers = len(result.scalars().all())
        
        # 더미 이미지
        stmt = select(AlbumGroup).where(AlbumGroup.cover_url.like('%picsum.photos%'))
        result = await session.execute(stmt)
        dummy_covers = len(result.scalars().all())
        
        # MusicBrainz 커버
        stmt = select(AlbumGroup).where(
            AlbumGroup.album_group_id.like('musicbrainz:%'),
            AlbumGroup.cover_url.like('%coverartarchive.org%')
        )
        result = await session.execute(stmt)
        mb_covers = len(result.scalars().all())
        
        # Spotify 커버
        stmt = select(AlbumGroup).where(
            AlbumGroup.album_group_id.like('spotify:%'),
            AlbumGroup.cover_url != None
        )
        result = await session.execute(stmt)
        spotify_covers = len(result.scalars().all())
        
        print(f"\n📊 Total Albums: {total}")
        print(f"   ✅ With Covers: {with_covers} ({with_covers/total*100:.1f}%)")
        print(f"   ❌ Without Covers: {without_covers} ({without_covers/total*100:.1f}%)")
        print(f"   🎲 Dummy Covers (picsum): {dummy_covers}")
        print(f"\n🎨 By Source:")
        print(f"   🎵 MusicBrainz (Cover Art Archive): {mb_covers}")
        print(f"   🟢 Spotify: {spotify_covers}")
        print("=" * 60)


async def main():
    print("🖼️  Album Cover Update Script")
    print("=" * 60)
    
    # 업데이트 전 통계
    await show_cover_stats()
    
    # MusicBrainz 커버 업데이트
    mb_updated = await update_musicbrainz_covers()
    
    # Last.fm 커버 확인
    await update_lastfm_covers()
    
    # 더미 커버 확인
    await update_dummy_covers()
    
    # 업데이트 후 통계
    await show_cover_stats()
    
    print("\n✅ Cover update completed!")
    print(f"   Updated: {mb_updated} MusicBrainz albums")


if __name__ == "__main__":
    asyncio.run(main())
