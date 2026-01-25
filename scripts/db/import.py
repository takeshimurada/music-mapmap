"""
Step 4: v3 데이터를 PostgreSQL DB에 임포트하는 스크립트

Usage:
  cd backend
  python scripts/import_albums_v3.py
"""

import json
import sys
import asyncio
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from app.database import Base, DATABASE_URL
from app.models import AlbumGroup, MapNode, Release
import uuid

# Country to region mapping
COUNTRY_TO_REGION = {
    # North America
    'United States': 'North America', 'USA': 'North America', 'US': 'North America',
    'Canada': 'North America', 'Mexico': 'North America',
    
    # Europe
    'United Kingdom': 'Europe', 'UK': 'Europe', 'England': 'Europe', 'Scotland': 'Europe', 'Wales': 'Europe',
    'Germany': 'Europe', 'France': 'Europe', 'Italy': 'Europe', 'Spain': 'Europe',
    'Netherlands': 'Europe', 'Belgium': 'Europe', 'Switzerland': 'Europe', 'Austria': 'Europe',
    'Sweden': 'Europe', 'Norway': 'Europe', 'Denmark': 'Europe', 'Finland': 'Europe',
    'Poland': 'Europe', 'Portugal': 'Europe', 'Ireland': 'Europe', 'Greece': 'Europe',
    'Iceland': 'Europe', 'Russia': 'Europe', 'Soviet Union': 'Europe', 'Turkey': 'Europe',
    'Czech Republic': 'Europe', 'Hungary': 'Europe', 'Romania': 'Europe', 'Bulgaria': 'Europe',
    
    # Asia
    'South Korea': 'Asia', 'Korea': 'Asia', 'Japan': 'Asia', 'China': 'Asia', 'Taiwan': 'Asia',
    'Hong Kong': 'Asia', 'Singapore': 'Asia', 'Thailand': 'Asia', 'Malaysia': 'Asia',
    'Indonesia': 'Asia', 'Philippines': 'Asia', 'India': 'Asia', 'Vietnam': 'Asia',
    'Pakistan': 'Asia',
    
    # South America
    'Brazil': 'South America', 'Argentina': 'South America', 'Chile': 'South America',
    'Colombia': 'South America', 'Peru': 'South America', 'Venezuela': 'South America',
    'Ecuador': 'South America', 'Uruguay': 'South America', 'Paraguay': 'South America',
    
    # Caribbean
    'Cuba': 'Caribbean', 'Jamaica': 'Caribbean', 'Dominican Republic': 'Caribbean',
    'Puerto Rico': 'Caribbean', 'Trinidad and Tobago': 'Caribbean',
    
    # Oceania
    'Australia': 'Oceania', 'New Zealand': 'Oceania',
    
    # Africa
    'South Africa': 'Africa', 'Nigeria': 'Africa', 'Kenya': 'Africa', 'Egypt': 'Africa',
    'Morocco': 'Africa', 'Ghana': 'Africa', 'Senegal': 'Africa',
}

def get_region_from_country(country: str | None, fallback_region: str = 'North America') -> str:
    """Country를 region으로 변환"""
    if not country:
        return fallback_region
    return COUNTRY_TO_REGION.get(country, fallback_region)

# Genre family to vibe mapping (0.0 = calm, 1.0 = energetic)
GENRE_VIBE_MAP = {
    # Energetic genres (0.7-1.0)
    'Rock': 0.85,
    'Metal': 0.95,
    'Punk': 0.90,
    'EDM': 0.90,
    'Electronic': 0.75,
    'Hip Hop': 0.80,
    'Rap': 0.85,
    'Dance': 0.85,
    
    # Mid-energy genres (0.4-0.7)
    'Pop': 0.60,
    'K-pop/Asia Pop': 0.65,
    'Alternative/Indie': 0.55,
    'R&B': 0.45,
    'Soul': 0.50,
    'Folk': 0.40,
    'Country': 0.45,
    
    # Calm genres (0.2-0.4)
    'Jazz': 0.35,
    'Blues': 0.40,
    'Classical': 0.25,
    'Ambient': 0.20,
    
    # World/Latin (0.5-0.7)
    'Latin': 0.70,
    'World': 0.55,
    'Reggae': 0.60,
    
    # Default
    'Unknown': 0.50,
    'Other': 0.50,
}

def get_genre_vibe(genre_family: str | None, primary_genre: str | None = None, artist_genres: list | None = None) -> float:
    """
    Genre family와 세부 장르를 활용해서 vibe 값 계산 (0.0-1.0)
    
    Args:
        genre_family: 장르 패밀리 (예: "Alternative/Indie")
        primary_genre: 주요 장르 (예: "indie rock")
        artist_genres: 아티스트 장르 목록 (예: ["indie rock", "garage rock"])
    
    Returns:
        0.0-1.0 사이의 vibe 값
    """
    # 세부 장르별 vibe 조정 맵 (genreFamily에서 미세 조정)
    DETAILED_GENRE_VIBE_ADJUSTMENTS = {
        # Rock 계열 세부 조정
        'indie rock': -0.10,           # Alternative/Indie (0.55) + Rock (0.85) 혼합 → 0.65
        'garage rock': +0.05,
        'post-punk': +0.10,
        'alternative rock': +0.05,
        
        # Pop 계열
        'dance pop': +0.15,            # Pop (0.60) + Dance (0.85) → 0.75
        'synth-pop': +0.10,
        'electropop': +0.15,
        'indie pop': -0.10,
        
        # Hip Hop 계열
        'trap': +0.10,                 # Hip Hop (0.80) + 더 강렬 → 0.90
        'boom bap': -0.05,
        'conscious hip hop': -0.10,
        
        # Electronic 계열
        'house': +0.05,
        'techno': +0.10,
        'ambient': -0.30,              # Electronic (0.75) → Ambient (0.20)
        'downtempo': -0.20,
        'idm': -0.10,
        
        # Jazz 계열
        'fusion': +0.15,               # Jazz (0.35) + 에너지 → 0.50
        'bebop': +0.10,
        'smooth jazz': -0.05,
        
        # Metal 계열
        'black metal': +0.05,
        'death metal': +0.05,
        'doom metal': -0.10,
    }
    
    # 1. genreFamily 기본 vibe
    base_vibe = GENRE_VIBE_MAP.get(genre_family, 0.5) if genre_family else 0.5
    
    # 2. 세부 장르가 있으면 조정
    if primary_genre:
        primary_lower = primary_genre.lower()
        adjustment = 0.0
        
        # 세부 장르 키워드 매칭
        for detail_genre, adj in DETAILED_GENRE_VIBE_ADJUSTMENTS.items():
            if detail_genre in primary_lower or primary_lower in detail_genre:
                adjustment = adj
                break
        
        # 조정 적용 (0.0-1.0 범위 유지)
        final_vibe = max(0.0, min(1.0, base_vibe + adjustment))
        return final_vibe
    
    return base_vibe

async def import_albums():
    """v3 JSON 파일을 읽어서 DB에 임포트"""
    
    # 1. JSON 파일 읽기
    # Docker 환경: /out 폴더가 마운트됨
    json_path = Path('/out/albums_spotify_v3.json')
    print(f"📂 Reading: {json_path}")
    
    if not json_path.exists():
        print(f"❌ File not found: {json_path}")
        return
    
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    albums_data = data.get('albums', [])
    print(f"📊 Total albums in JSON: {len(albums_data)}")
    
    # 2. Database 연결
    print(f"🔌 Connecting to database...")
    print(f"   URL: {DATABASE_URL}")
    
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    # 3. 테이블 생성 (없으면)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print(f"✅ Database tables ready")
    
    # 4. 기존 앨범 ID 조회 (중복 방지)
    async with async_session() as session:
        stmt = select(AlbumGroup.album_group_id)
        result = await session.execute(stmt)
        existing_ids = set(result.scalars().all())
        print(f"📋 Existing albums in DB: {len(existing_ids)}")
    
    # 5. 앨범 데이터 변환 및 임포트
    new_albums = []
    new_nodes = []
    new_releases = []
    skipped = 0
    skipped_albums = []  # 스킵된 앨범 정보 저장
    
    for album_data in albums_data:
        album_id = album_data.get('albumId')
        
        # 이미 존재하면 스킵
        if album_id in existing_ids:
            skipped += 1
            skipped_albums.append({
                'id': album_id,
                'title': album_data.get('title'),
                'artist': album_data.get('artistName'),
                'year': album_data.get('year')
            })
            continue
        
        # 데이터 매핑
        genre_family = album_data.get('genreFamily', 'Unknown')
        primary_genre = album_data.get('primaryGenre')  # ⭐ 세부 장르 활용
        artist_genres = album_data.get('artistGenres', [])  # ⭐ 세부 장르 활용
        country = album_data.get('country')
        
        # "Unknown" country는 None으로 저장
        if country == "Unknown":
            country = None
        
        # ⭐ Country 기반 region_bucket 계산 (Step 3 enrichment 활용!)
        # v1의 market 기반 region은 무시하고, country 기반으로 재계산
        original_region = album_data.get('region_bucket', 'Unknown')
        region_bucket = get_region_from_country(country, fallback_region=original_region)
        
        genre_vibe = get_genre_vibe(genre_family, primary_genre, artist_genres)
        popularity = album_data.get('popularity', 0) / 100.0
        album = AlbumGroup(
            album_group_id=album_id,
            title=album_data.get('title', 'Unknown Title'),
            primary_artist_display=album_data.get('artistName', 'Unknown Artist'),
            original_year=album_data.get('year'),
            primary_genre=genre_family,
            country_code=country,
            popularity=popularity,
            cover_url=album_data.get('artworkUrl'),
        )
        node = MapNode(
            album_group_id=album_id,
            x=album_data.get('year') or 0,
            y=genre_vibe,
            size=(popularity * 10) + 2
        )
        release = Release(
            release_id=f"local:release:{uuid.uuid4()}",
            album_group_id=album_id,
            release_title=album_data.get('title', 'Unknown Title')
        )
        new_albums.append(album)
        new_nodes.append(node)
        new_releases.append(release)
    
    # 상세한 로깅
    print(f"\n{'='*70}")
    print(f"📊 Import Analysis:")
    print(f"   • Total in v3.json: {len(albums_data)}")
    print(f"   • Already in DB (skipped): {skipped}")
    print(f"   • New albums to add: {len(new_albums)}")
    print(f"{'='*70}\n")
    
    if skipped > 0 and len(skipped_albums) <= 10:
        print(f"⏭️  Skipped albums (already exist in DB):")
        for sa in skipped_albums[:10]:
            print(f"   • {sa['year']} - {sa['artist']} - {sa['title']}")
        if len(skipped_albums) > 10:
            print(f"   ... and {len(skipped_albums) - 10} more")
        print("")
    
    if len(new_albums) > 0:
        print(f"➕ New albums to be added:")
        for na in new_albums[:10]:
            print(f"   • {na.year} - {na.artist_name} - {na.title}")
        if len(new_albums) > 10:
            print(f"   ... and {len(new_albums) - 10} more")
        print("")
    
    # 6. Batch insert (1000개씩)
    batch_size = 1000
    total_inserted = 0
    
    async with async_session() as session:
        for i in range(0, len(new_albums), batch_size):
            batch = new_albums[i:i+batch_size]
            session.add_all(batch)
            await session.commit()
            total_inserted += len(batch)
            print(f"💾 Inserted {total_inserted}/{len(new_albums)} albums...")
        session.add_all(new_nodes)
        session.add_all(new_releases)
        await session.commit()
    
    print(f"✅ Import complete! Total inserted: {total_inserted}")
    
    # 7. 검증 (최종 카운트)
    async with async_session() as session:
        stmt = select(AlbumGroup)
        result = await session.execute(stmt)
        all_albums = result.scalars().all()
        
        print(f"\n📊 Database Statistics:")
        print(f"  - Total albums: {len(all_albums)}")
        
        # Country 분포 확인
        with_country = sum(1 for a in all_albums if a.country)
        print(f"  - Albums with country: {with_country}/{len(all_albums)} ({with_country/len(all_albums)*100:.1f}%)")
        
        # Region 분포
        from collections import Counter
        region_dist = Counter(a.region_bucket for a in all_albums)
        print(f"\n📍 Top 5 Regions:")
        for region, count in region_dist.most_common(5):
            print(f"    {region}: {count}")
        
        # Country 분포 (Top 10)
        country_dist = Counter(a.country for a in all_albums if a.country)
        print(f"\n🌍 Top 10 Countries:")
        for country, count in country_dist.most_common(10):
            print(f"    {country}: {count}")
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(import_albums())
