"""
발매일자 보완 스크립트

Spotify에서 발매일이 없는 앨범에 대해 MusicBrainz와 Discogs에서 발매일을 가져옴

Usage:
  docker exec sonic_backend python scripts/db/enrich_release_dates.py
"""

import asyncio
import sys
import aiohttp
import json
from datetime import datetime, date
from pathlib import Path
from typing import Optional

sys.path.insert(0, "/app")

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, update
from app.database import DATABASE_URL
from app.models import AlbumGroup, Release

# 캐시 파일 경로
CACHE_DIR = Path("/out")
MB_CACHE_FILE = CACHE_DIR / "mb_release_cache.json"
DISCOGS_CACHE_FILE = CACHE_DIR / "discogs_release_cache.json"

# API 설정
MUSICBRAINZ_API = "https://musicbrainz.org/ws/2"
DISCOGS_API = "https://api.discogs.com"
USER_AGENT = "SonicChronos/1.0 (https://github.com/yourusername/sonic-chronos)"

# Rate limiting
REQUEST_DELAY = 1.0  # MusicBrainz: 1 req/sec, Discogs: 60 req/min


def load_cache(cache_file: Path) -> dict:
    """캐시 파일 로드"""
    if cache_file.exists():
        with open(cache_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}


def save_cache(cache_file: Path, cache: dict):
    """캐시 파일 저장"""
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    with open(cache_file, 'w', encoding='utf-8') as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


async def search_musicbrainz(session: aiohttp.ClientSession, artist: str, title: str) -> Optional[date]:
    """MusicBrainz에서 앨범 발매일 검색"""
    try:
        # Release 검색
        params = {
            'query': f'artist:"{artist}" AND release:"{title}"',
            'fmt': 'json',
            'limit': 1
        }
        
        url = f"{MUSICBRAINZ_API}/release"
        headers = {'User-Agent': USER_AGENT}
        
        async with session.get(url, params=params, headers=headers) as response:
            if response.status != 200:
                return None
            
            data = await response.json()
            releases = data.get('releases', [])
            
            if not releases:
                return None
            
            # 첫 번째 결과의 날짜 가져오기
            release = releases[0]
            date_str = release.get('date')
            
            if date_str:
                # YYYY, YYYY-MM, YYYY-MM-DD 형식 지원
                try:
                    if len(date_str) == 4:  # YYYY
                        return date(int(date_str), 1, 1)
                    elif len(date_str) == 7:  # YYYY-MM
                        parts = date_str.split('-')
                        return date(int(parts[0]), int(parts[1]), 1)
                    else:  # YYYY-MM-DD
                        return datetime.fromisoformat(date_str).date()
                except (ValueError, AttributeError):
                    pass
        
        await asyncio.sleep(REQUEST_DELAY)
        return None
    
    except Exception as e:
        print(f"⚠️  MusicBrainz error for {artist} - {title}: {e}")
        return None


async def search_discogs(session: aiohttp.ClientSession, artist: str, title: str, discogs_token: Optional[str]) -> Optional[date]:
    """Discogs에서 앨범 발매일 검색"""
    if not discogs_token:
        return None
    
    try:
        params = {
            'q': f'{artist} {title}',
            'type': 'release',
            'token': discogs_token
        }
        
        url = f"{DISCOGS_API}/database/search"
        
        async with session.get(url, params=params) as response:
            if response.status != 200:
                return None
            
            data = await response.json()
            results = data.get('results', [])
            
            if not results:
                return None
            
            # 첫 번째 결과의 날짜 가져오기
            result = results[0]
            year_str = result.get('year')
            
            if year_str:
                try:
                    return date(int(year_str), 1, 1)
                except (ValueError, AttributeError):
                    pass
        
        await asyncio.sleep(REQUEST_DELAY)
        return None
    
    except Exception as e:
        print(f"⚠️  Discogs error for {artist} - {title}: {e}")
        return None


async def enrich_release_dates():
    """발매일 없는 앨범들의 날짜를 보완"""
    print("\n" + "="*70)
    print("📅 발매일자 보완 시작")
    print("="*70 + "\n")
    
    # DB 연결
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    # 캐시 로드
    mb_cache = load_cache(MB_CACHE_FILE)
    discogs_cache = load_cache(DISCOGS_CACHE_FILE)
    
    # Discogs 토큰 (환경변수에서)
    import os
    discogs_token = os.getenv('DISCOGS_TOKEN')
    
    if not discogs_token:
        print("⚠️  DISCOGS_TOKEN 환경변수가 없습니다. Discogs 검색을 건너뜁니다.")
    
    # 발매일이 없는 앨범 조회
    async with async_session() as session:
        stmt = (
            select(AlbumGroup, Release)
            .join(Release, AlbumGroup.album_group_id == Release.album_group_id)
            .where(Release.release_date.is_(None))
            .limit(1000)  # 한 번에 1000개씩
        )
        result = await session.execute(stmt)
        albums_without_dates = result.all()
    
    print(f"📊 발매일 없는 앨범: {len(albums_without_dates)}개")
    
    if not albums_without_dates:
        print("✅ 모든 앨범에 발매일이 있습니다!")
        return
    
    # HTTP 세션 생성
    async with aiohttp.ClientSession() as http_session:
        enriched = 0
        failed = 0
        
        for i, (album, release) in enumerate(albums_without_dates):
            if i % 10 == 0:
                print(f"진행중: {i}/{len(albums_without_dates)}...")
            
            cache_key = f"{album.primary_artist_display}|||{album.title}"
            
            # 캐시 확인
            if cache_key in mb_cache:
                release_date = mb_cache[cache_key]
                if release_date:
                    try:
                        release_date = datetime.fromisoformat(release_date).date()
                    except:
                        release_date = None
            else:
                # MusicBrainz 검색
                release_date = await search_musicbrainz(
                    http_session,
                    album.primary_artist_display,
                    album.title
                )
                
                # 없으면 Discogs 검색
                if not release_date and discogs_token:
                    release_date = await search_discogs(
                        http_session,
                        album.primary_artist_display,
                        album.title,
                        discogs_token
                    )
                
                # 캐시 저장
                mb_cache[cache_key] = release_date.isoformat() if release_date else None
            
            # DB 업데이트
            if release_date:
                async with async_session() as session:
                    # Release 업데이트
                    stmt = (
                        update(Release)
                        .where(Release.release_id == release.release_id)
                        .values(release_date=release_date)
                    )
                    await session.execute(stmt)
                    
                    # AlbumGroup의 earliest_release_date도 업데이트
                    stmt = (
                        update(AlbumGroup)
                        .where(AlbumGroup.album_group_id == album.album_group_id)
                        .values(earliest_release_date=release_date)
                    )
                    await session.execute(stmt)
                    
                    await session.commit()
                
                enriched += 1
                print(f"✅ {album.primary_artist_display} - {album.title}: {release_date}")
            else:
                failed += 1
    
    # 캐시 저장
    save_cache(MB_CACHE_FILE, mb_cache)
    save_cache(DISCOGS_CACHE_FILE, discogs_cache)
    
    print("\n" + "="*70)
    print("✅ 발매일자 보완 완료")
    print("="*70)
    print(f"\n📈 결과:")
    print(f"   • 보완 성공: {enriched}개")
    print(f"   • 실패: {failed}개")
    print()


if __name__ == "__main__":
    asyncio.run(enrich_release_dates())
