"""
Spotify 발매일자 보완 스크립트

album_groups 테이블에서 earliest_release_date가 NULL인 앨범들을 찾아서
Spotify API로 발매일을 가져와서 업데이트합니다.

Usage:
  docker exec sonic_backend python scripts/db/enrich_spotify_dates.py
"""

import asyncio
import sys
import aiohttp
import json
import os
from datetime import datetime, date
from pathlib import Path
from typing import Optional
from base64 import b64encode

sys.path.insert(0, "/app")

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, update
from app.database import DATABASE_URL
from app.models import AlbumGroup, Release

# Spotify API 설정
SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")

if not SPOTIFY_CLIENT_ID or not SPOTIFY_CLIENT_SECRET:
    print("❌ SPOTIFY_CLIENT_ID와 SPOTIFY_CLIENT_SECRET 환경 변수가 필요합니다.")
    sys.exit(1)

# 캐시 설정
CACHE_DIR = Path("/out")
CACHE_FILE = CACHE_DIR / "spotify_release_cache.json"

# Rate limiting: Spotify는 초당 여러 요청 가능하지만 안전하게
REQUEST_DELAY = 0.1  # 100ms per request = 초당 10개


class SpotifyClient:
    """Spotify API 클라이언트"""
    
    def __init__(self):
        self.access_token: Optional[str] = None
        self.token_expires_at: Optional[datetime] = None
        
    async def get_access_token(self, session: aiohttp.ClientSession) -> str:
        """Spotify API Access Token 획득"""
        if self.access_token and self.token_expires_at and datetime.now().timestamp() < self.token_expires_at:
            return self.access_token
            
        auth_str = f"{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}"
        auth_b64 = b64encode(auth_str.encode()).decode()
        
        headers = {
            "Authorization": f"Basic {auth_b64}",
            "Content-Type": "application/x-www-form-urlencoded"
        }
        
        data = {"grant_type": "client_credentials"}
        
        async with session.post(
            "https://accounts.spotify.com/api/token",
            headers=headers,
            data=data
        ) as response:
            if response.status != 200:
                text = await response.text()
                raise Exception(f"Failed to get Spotify token: {response.status} - {text}")
            
            result = await response.json()
            self.access_token = result["access_token"]
            expires_in = result["expires_in"]  # seconds
            self.token_expires_at = datetime.now().timestamp() + expires_in - 60  # 1분 여유
            
            print(f"✅ Spotify access token 획득 완료 (만료: {expires_in}초 후)")
            return self.access_token
    
    async def get_album_release_date(
        self,
        session: aiohttp.ClientSession,
        album_id: str
    ) -> Optional[date]:
        """Spotify에서 앨범의 발매일 가져오기"""
        
        token = await self.get_access_token(session)
        headers = {"Authorization": f"Bearer {token}"}
        
        try:
            async with session.get(
                f"https://api.spotify.com/v1/albums/{album_id}",
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=10)
            ) as response:
                if response.status == 429:
                    # Rate limit
                    retry_after = int(response.headers.get("Retry-After", "60"))
                    print(f"⏳ Rate limit - {retry_after}초 대기 중...")
                    await asyncio.sleep(retry_after)
                    return await self.get_album_release_date(session, album_id)
                
                if response.status == 404:
                    print(f"⚠️  앨범을 찾을 수 없음: {album_id}")
                    return None
                    
                if response.status != 200:
                    text = await response.text()
                    print(f"⚠️  Spotify API 오류 ({response.status}): {text[:100]}")
                    return None
                
                data = await response.json()
                release_date_str = data.get("release_date")
                
                if not release_date_str:
                    return None
                
                # Parse release date (YYYY, YYYY-MM, YYYY-MM-DD)
                try:
                    if len(release_date_str) == 4:  # YYYY
                        return date(int(release_date_str), 1, 1)
                    elif len(release_date_str) == 7:  # YYYY-MM
                        return datetime.strptime(release_date_str, "%Y-%m").date()
                    else:  # YYYY-MM-DD
                        return datetime.strptime(release_date_str, "%Y-%m-%d").date()
                except (ValueError, AttributeError) as e:
                    print(f"⚠️  날짜 파싱 실패: {release_date_str} - {e}")
                    return None
                    
        except asyncio.TimeoutError:
            print(f"⏱️  타임아웃: {album_id}")
            return None
        except Exception as e:
            print(f"❌ 오류 발생: {album_id} - {e}")
            return None


def load_cache() -> dict:
    """캐시 파일 로드"""
    if CACHE_FILE.exists():
        with open(CACHE_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}


def save_cache(cache: dict):
    """캐시 파일 저장"""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    with open(CACHE_FILE, 'w', encoding='utf-8') as f:
        json.dump(cache, f, indent=2, ensure_ascii=False)


async def enrich_spotify_dates():
    """Spotify로 발매일 보완"""
    
    print("\n🎵 Spotify 발매일자 보완 시작...")
    
    # DB 연결
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    # 캐시 로드
    cache = load_cache()
    print(f"📦 캐시 로드 완료: {len(cache)} 항목")
    
    # Spotify 클라이언트
    spotify = SpotifyClient()
    
    async with aiohttp.ClientSession() as http_session:
        async with async_session() as db:
            # earliest_release_date가 NULL인 앨범 조회
            stmt = select(AlbumGroup).where(AlbumGroup.earliest_release_date.is_(None))
            result = await db.execute(stmt)
            albums = result.scalars().all()
            
            total = len(albums)
            print(f"📊 발매일이 없는 앨범: {total}개\n")
            
            if total == 0:
                print("✅ 모든 앨범에 발매일이 있습니다!")
                return
            
            updated = 0
            failed = 0
            cached = 0
            
            for idx, album in enumerate(albums, 1):
                # album_group_id에서 Spotify ID만 추출 (spotify:album:xxxxx -> xxxxx)
                album_id = album.album_group_id.replace("spotify:album:", "")
                title = album.title
                artist = album.primary_artist_display
                
                # 캐시 확인
                if album_id in cache:
                    cached_date_str = cache[album_id]
                    if cached_date_str:
                        try:
                            release_date = datetime.fromisoformat(cached_date_str).date()
                            
                            # DB 업데이트
                            album.earliest_release_date = release_date
                            
                            # Release 테이블도 업데이트
                            release_stmt = (
                                update(Release)
                                .where(Release.album_group_id == album_id)
                                .values(release_date=release_date)
                            )
                            await db.execute(release_stmt)
                            
                            updated += 1
                            cached += 1
                            
                            if idx % 50 == 0:
                                await db.commit()
                                print(f"💾 진행률: {idx}/{total} ({idx/total*100:.1f}%) | 캐시 업데이트: {cached}, 신규: {updated-cached}, 실패: {failed}")
                            
                            continue
                        except Exception as e:
                            print(f"⚠️  캐시 데이터 처리 실패: {album_id} - {e}")
                
                # Spotify API 호출
                print(f"[{idx}/{total}] 🔍 {artist} - {title}")
                
                release_date = await spotify.get_album_release_date(http_session, album_id)
                
                if release_date:
                    # 캐시 저장
                    cache[album_id] = release_date.isoformat()
                    
                    # DB 업데이트
                    album.earliest_release_date = release_date
                    
                    # Release 테이블도 업데이트
                    release_stmt = (
                        update(Release)
                        .where(Release.album_group_id == album_id)
                        .values(release_date=release_date)
                    )
                    await db.execute(release_stmt)
                    
                    updated += 1
                    print(f"  ✅ 발매일: {release_date}")
                else:
                    cache[album_id] = None
                    failed += 1
                    print(f"  ❌ 발매일을 찾을 수 없음")
                
                # 주기적으로 커밋 & 캐시 저장
                if idx % 50 == 0:
                    await db.commit()
                    save_cache(cache)
                    print(f"💾 진행률: {idx}/{total} ({idx/total*100:.1f}%) | 업데이트: {updated}, 실패: {failed}\n")
                
                # Rate limiting
                await asyncio.sleep(REQUEST_DELAY)
            
            # 최종 커밋 & 캐시 저장
            await db.commit()
            save_cache(cache)
    
    print("\n" + "="*60)
    print(f"✅ 완료!")
    print(f"  - 총 앨범: {total}개")
    print(f"  - 업데이트: {updated}개 (캐시: {cached}개)")
    print(f"  - 실패: {failed}개")
    print("="*60)


if __name__ == "__main__":
    asyncio.run(enrich_spotify_dates())
