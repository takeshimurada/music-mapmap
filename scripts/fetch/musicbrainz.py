"""
MusicBrainz에서 유명 앨범 데이터 수집 및 DB 삽입
- 다양한 연도 (1960-2020)
- 다양한 국가
- 다양한 장르
- 유명한 앨범 위주
"""
import asyncio
import aiohttp
import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
import sys
import time
from collections import Counter

sys.path.append("/app")
from app.models import Album

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://sonic:0416@db:5432/sonic_db")

# MusicBrainz API 설정
MB_BASE_URL = "https://musicbrainz.org/ws/2"
RATE_LIMIT_DELAY = 1.0  # MusicBrainz: 1 request per second
USER_AGENT = "MusicMapApp/1.0 (music-map@example.com)"

# 다양한 장르 키워드
GENRE_KEYWORDS = [
    "rock", "pop", "jazz", "soul", "funk", "disco", "punk", 
    "reggae", "blues", "folk", "country", "metal", "hip hop",
    "electronic", "classical", "r&b", "alternative", "indie",
    "dance", "latin", "world", "new wave", "progressive"
]

# 연도 범위
YEAR_RANGES = [
    (1960, 1969),
    (1970, 1979),
    (1980, 1989),
    (1990, 1999),
    (2000, 2009),
    (2010, 2020),
]

# 목표 앨범 수
TARGET_ALBUMS = 500


def get_region_from_country(country):
    """Country를 기반으로 region_bucket 결정"""
    if not country:
        return "Unknown"
    
    country_lower = country.lower()
    
    # North America
    if any(c in country_lower for c in ["united states", "us", "usa", "canada", "mexico"]):
        return "North America"
    
    # Europe
    if any(c in country_lower for c in [
        "united kingdom", "uk", "england", "france", "germany", "italy", "spain",
        "netherlands", "belgium", "sweden", "norway", "denmark", "finland",
        "ireland", "portugal", "austria", "switzerland", "poland", "russia",
        "greece", "iceland", "czech"
    ]):
        return "Europe"
    
    # Asia
    if any(c in country_lower for c in [
        "japan", "china", "korea", "south korea", "india", "thailand", "indonesia",
        "vietnam", "philippines", "malaysia", "singapore", "taiwan", "hong kong"
    ]):
        return "Asia"
    
    # South America
    if any(c in country_lower for c in [
        "brazil", "argentina", "colombia", "chile", "peru", "venezuela", "uruguay"
    ]):
        return "South America"
    
    # Oceania
    if any(c in country_lower for c in ["australia", "new zealand"]):
        return "Oceania"
    
    # Africa
    if any(c in country_lower for c in [
        "south africa", "nigeria", "kenya", "egypt", "ethiopia", "ghana", "senegal"
    ]):
        return "Africa"
    
    # Caribbean (북미로 분류)
    if any(c in country_lower for c in ["jamaica", "cuba", "trinidad", "haiti"]):
        return "North America"
    
    return "Unknown"


def map_genre_to_family(genre_tags):
    """장르 태그를 genreFamily로 매핑"""
    if not genre_tags:
        return "Unknown"
    
    genre_str = " ".join(genre_tags).lower()
    
    # Electronic/Dance
    if any(g in genre_str for g in ["electronic", "techno", "house", "edm", "trance", "ambient", "electro"]):
        return "Electronic"
    
    # Hip Hop
    if any(g in genre_str for g in ["hip hop", "rap", "hip-hop"]):
        return "Hip Hop"
    
    # Rock (broad category)
    if any(g in genre_str for g in ["rock", "metal", "punk", "grunge", "alternative"]):
        return "Rock"
    
    # Pop
    if any(g in genre_str for g in ["pop", "dance-pop", "synth-pop"]):
        return "Pop"
    
    # Jazz
    if any(g in genre_str for g in ["jazz", "bebop", "swing", "fusion"]):
        return "Jazz"
    
    # Soul/R&B/Funk
    if any(g in genre_str for g in ["soul", "r&b", "r & b", "funk", "motown"]):
        return "Soul"
    
    # Reggae
    if "reggae" in genre_str or "ska" in genre_str:
        return "Reggae"
    
    # Country/Folk
    if any(g in genre_str for g in ["country", "folk", "bluegrass", "americana"]):
        return "Folk"
    
    # Classical
    if any(g in genre_str for g in ["classical", "opera", "symphony", "baroque"]):
        return "Classical"
    
    # Blues
    if "blues" in genre_str:
        return "Blues"
    
    # Latin
    if any(g in genre_str for g in ["latin", "salsa", "bossa", "samba", "tango"]):
        return "Latin"
    
    # World
    if any(g in genre_str for g in ["world", "afro", "ethnic"]):
        return "World"
    
    return "Other"


def get_genre_vibe(genre_family, primary_genre=None):
    """장르 기반 vibe 값 계산 (0.0-1.0)"""
    vibe_map = {
        "Rock": 0.3,
        "Metal": 0.2,
        "Punk": 0.25,
        "Blues": 0.35,
        "Folk": 0.45,
        "Pop": 0.65,
        "Soul": 0.55,
        "Funk": 0.6,
        "Jazz": 0.7,
        "Electronic": 0.8,
        "Hip Hop": 0.5,
        "Reggae": 0.58,
        "Latin": 0.62,
        "Classical": 0.75,
        "World": 0.68,
        "Other": 0.5,
        "Unknown": 0.5,
    }
    return vibe_map.get(genre_family, 0.5)


async def fetch_json(session, url, params=None):
    """MusicBrainz API 호출"""
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    
    try:
        async with session.get(url, params=params, headers=headers) as response:
            if response.status == 503:
                # Rate limited
                print(f"⏳ Rate limited, waiting 2 seconds...")
                await asyncio.sleep(2)
                return await fetch_json(session, url, params)
            
            if response.status != 200:
                print(f"⚠️ HTTP {response.status}: {url}")
                return None
            
            return await response.json()
    except Exception as e:
        print(f"⚠️ Error fetching {url}: {e}")
        return None


async def search_albums(session, genre, year_start, year_end, limit=100):
    """특정 장르와 연도 범위로 앨범 검색"""
    url = f"{MB_BASE_URL}/release-group"
    
    # Query: tag:rock AND date:[1970 TO 1979]
    query = f'tag:"{genre}" AND date:[{year_start} TO {year_end}]'
    
    params = {
        "query": query,
        "limit": limit,
        "offset": 0,
        "fmt": "json"
    }
    
    await asyncio.sleep(RATE_LIMIT_DELAY)
    return await fetch_json(session, url, params)


async def get_artist_info(session, artist_id):
    """아티스트 상세 정보 (출신 국가 등)"""
    url = f"{MB_BASE_URL}/artist/{artist_id}"
    params = {"inc": "tags", "fmt": "json"}
    
    await asyncio.sleep(RATE_LIMIT_DELAY)
    return await fetch_json(session, url, params)


async def get_release_group_details(session, rg_id):
    """Release Group 상세 정보 (장르 태그 등)"""
    url = f"{MB_BASE_URL}/release-group/{rg_id}"
    params = {"inc": "tags+artist-credits", "fmt": "json"}
    
    await asyncio.sleep(RATE_LIMIT_DELAY)
    return await fetch_json(session, url, params)


async def collect_albums():
    """MusicBrainz에서 앨범 수집"""
    collected_albums = []
    seen_ids = set()
    
    async with aiohttp.ClientSession() as session:
        for year_start, year_end in YEAR_RANGES:
            for genre in GENRE_KEYWORDS:
                if len(collected_albums) >= TARGET_ALBUMS:
                    break
                
                print(f"\n🔍 Searching: {genre} ({year_start}-{year_end})")
                
                result = await search_albums(session, genre, year_start, year_end, limit=50)
                if not result or "release-groups" not in result:
                    print(f"   No results")
                    continue
                
                release_groups = result["release-groups"]
                print(f"   Found {len(release_groups)} release groups")
                
                for rg in release_groups:
                    if len(collected_albums) >= TARGET_ALBUMS:
                        break
                    
                    rg_id = rg.get("id")
                    if not rg_id or rg_id in seen_ids:
                        continue
                    
                    # 기본 정보
                    title = rg.get("title", "Unknown")
                    first_release = rg.get("first-release-date", "")
                    year = int(first_release[:4]) if first_release and len(first_release) >= 4 else None
                    
                    if not year or year < 1950 or year > 2025:
                        continue
                    
                    # Artist 정보
                    artist_credits = rg.get("artist-credit", [])
                    if not artist_credits:
                        continue
                    
                    artist_name = artist_credits[0].get("name", "Unknown Artist")
                    artist_id = artist_credits[0].get("artist", {}).get("id")
                    
                    if not artist_id:
                        continue
                    
                    # Artist 상세 정보 (country)
                    artist_info = await get_artist_info(session, artist_id)
                    
                    country = None
                    if artist_info:
                        country = artist_info.get("area", {}).get("name", None) if artist_info.get("area") else None
                        if not country and artist_info.get("begin-area"):
                            country = artist_info.get("begin-area", {}).get("name", None)
                        if not country:
                            country = artist_info.get("country", None)
                    
                    # Release group 상세 정보 (tags)
                    rg_details = await get_release_group_details(session, rg_id)
                    genre_tags = []
                    if rg_details and "tags" in rg_details:
                        genre_tags = [tag["name"] for tag in rg_details["tags"][:5]]
                    
                    # 데이터 변환
                    genre_family = map_genre_to_family(genre_tags)
                    region_bucket = get_region_from_country(country)
                    
                    # Cover Art Archive에서 커버 이미지 가져오기
                    # release-group ID를 사용 (더 빠르고 간단)
                    cover_url = f"https://coverartarchive.org/release-group/{rg_id}/front-500"
                    
                    album_data = {
                        "id": f"musicbrainz:rg:{rg_id}",
                        "title": title,
                        "artist_name": artist_name,
                        "year": year,
                        "genre": genre_family,
                        "genre_vibe": get_genre_vibe(genre_family, genre_tags[0] if genre_tags else None),
                        "region_bucket": region_bucket,
                        "country": country,
                        "popularity": 0.75,  # MusicBrainz 데이터는 일반적으로 유명함
                        "cover_url": cover_url,  # Cover Art Archive
                    }
                    
                    collected_albums.append(album_data)
                    seen_ids.add(rg_id)
                    
                    if len(collected_albums) % 20 == 0:
                        print(f"      ✅ Collected: {len(collected_albums)}")
                
                if len(collected_albums) >= TARGET_ALBUMS:
                    break
    
    return collected_albums


async def main():
    print("🎵 MusicBrainz Album Fetcher")
    print("=" * 60)
    print(f"Target: {TARGET_ALBUMS} albums")
    print(f"Year ranges: {len(YEAR_RANGES)}")
    print(f"Genre keywords: {len(GENRE_KEYWORDS)}")
    print("=" * 60)
    
    # 앨범 수집
    print("\n📡 Fetching albums from MusicBrainz...")
    albums = await collect_albums()
    
    print(f"\n✅ Collected {len(albums)} albums")
    
    if not albums:
        print("❌ No albums collected!")
        return
    
    # 통계
    print(f"\n📊 Statistics:")
    year_dist = Counter(a["year"] for a in albums if a["year"])
    region_dist = Counter(a["region_bucket"] for a in albums)
    genre_dist = Counter(a["genre"] for a in albums)
    
    print(f"\n📅 Year distribution (top 10):")
    for year, count in year_dist.most_common(10):
        print(f"   {year}: {count} albums")
    
    print(f"\n🌍 Region distribution:")
    for region, count in region_dist.most_common():
        print(f"   {region}: {count} albums")
    
    print(f"\n🎸 Genre distribution:")
    for genre, count in genre_dist.most_common():
        print(f"   {genre}: {count} albums")
    
    # DB 삽입
    print(f"\n💾 Inserting to database...")
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session_maker = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    
    async with async_session_maker() as session:
        # 기존 앨범 체크
        result = await session.execute(select(Album.id))
        existing_ids = set(result.scalars().all())
        
        new_albums = []
        skipped = 0
        
        for album_data in albums:
            if album_data["id"] in existing_ids:
                skipped += 1
                continue
            
            new_album = Album(**album_data)
            new_albums.append(new_album)
        
        print(f"\n📋 Import Analysis:")
        print(f"   • Total collected: {len(albums)}")
        print(f"   • Already in DB: {skipped}")
        print(f"   • New to add: {len(new_albums)}")
        
        if new_albums:
            session.add_all(new_albums)
            await session.commit()
            print(f"\n✅ Successfully inserted {len(new_albums)} albums!")
        else:
            print(f"\n✅ No new albums to add - database is up to date!")
        
        # 최종 통계
        result = await session.execute(select(Album))
        all_albums = result.scalars().all()
        print(f"\n📊 Final database count: {len(all_albums)} albums")
    
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
