"""
Last.fm에서 유명 앨범 데이터 수집 및 DB 삽입
- 장르별 Top Albums
- 다양한 연도
- 다양한 국가
"""
import asyncio
import aiohttp
import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
import sys
from collections import Counter

sys.path.append("/app")
from app.models import Album

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://sonic:sonic_password@db:5432/sonic_db")

# Last.fm API 설정
LASTFM_API_KEY = os.getenv("LASTFM_API_KEY", "")  # .env에 추가 필요
LASTFM_BASE_URL = "https://ws.audioscrobbler.com/2.0/"
RATE_LIMIT_DELAY = 0.2  # Last.fm: 5 requests per second

# 다양한 장르/태그
GENRE_TAGS = [
    "rock", "pop", "jazz", "soul", "funk", "disco", "punk rock",
    "reggae", "blues", "folk", "country", "metal", "hip hop", "rap",
    "electronic", "techno", "house", "ambient", "classical", "r&b",
    "alternative", "indie", "indie rock", "progressive rock",
    "hard rock", "psychedelic", "new wave", "post-punk",
    "latin", "world music", "afrobeat", "bossa nova", "salsa",
    "grunge", "britpop", "shoegaze", "dream pop"
]

TARGET_ALBUMS = 500


def get_region_from_country(country):
    """Country를 기반으로 region_bucket 결정"""
    if not country:
        return "Unknown"
    
    country_lower = country.lower()
    
    if any(c in country_lower for c in ["united states", "us", "usa", "america"]):
        return "North America"
    if "canada" in country_lower or "mexico" in country_lower:
        return "North America"
    
    if any(c in country_lower for c in [
        "united kingdom", "uk", "england", "britain", "france", "germany", "italy", "spain",
        "netherlands", "belgium", "sweden", "norway", "denmark", "finland",
        "ireland", "portugal", "austria", "switzerland", "poland", "russia"
    ]):
        return "Europe"
    
    if any(c in country_lower for c in ["japan", "china", "korea", "india", "thailand", "indonesia"]):
        return "Asia"
    
    if any(c in country_lower for c in ["brazil", "argentina", "colombia", "chile"]):
        return "South America"
    
    if "australia" in country_lower or "new zealand" in country_lower:
        return "Oceania"
    
    if "jamaica" in country_lower:
        return "North America"
    
    return "Unknown"


def map_genre_to_family(tags):
    """장르 태그를 genreFamily로 매핑"""
    if not tags:
        return "Unknown"
    
    tags_str = " ".join(tags).lower()
    
    if any(g in tags_str for g in ["electronic", "techno", "house", "edm", "trance", "ambient", "electro", "idm"]):
        return "Electronic"
    
    if any(g in tags_str for g in ["hip hop", "rap", "hip-hop"]):
        return "Hip Hop"
    
    if any(g in tags_str for g in ["rock", "metal", "punk", "grunge", "alternative", "indie rock"]):
        return "Rock"
    
    if any(g in tags_str for g in ["pop", "dance-pop", "synth-pop", "britpop"]):
        return "Pop"
    
    if any(g in tags_str for g in ["jazz", "bebop", "swing"]):
        return "Jazz"
    
    if any(g in tags_str for g in ["soul", "r&b", "r & b", "funk", "motown"]):
        return "Soul"
    
    if "reggae" in tags_str or "ska" in tags_str:
        return "Reggae"
    
    if any(g in tags_str for g in ["country", "folk", "bluegrass", "americana", "singer-songwriter"]):
        return "Folk"
    
    if "classical" in tags_str:
        return "Classical"
    
    if "blues" in tags_str:
        return "Blues"
    
    if any(g in tags_str for g in ["latin", "salsa", "bossa", "samba", "tango", "afrobeat"]):
        return "Latin"
    
    if "world" in tags_str:
        return "World"
    
    return "Other"


def get_genre_vibe(genre_family):
    """장르 기반 vibe 값 계산 (0.0-1.0)"""
    vibe_map = {
        "Rock": 0.3, "Metal": 0.2, "Punk": 0.25, "Blues": 0.35,
        "Folk": 0.45, "Pop": 0.65, "Soul": 0.55, "Funk": 0.6,
        "Jazz": 0.7, "Electronic": 0.8, "Hip Hop": 0.5,
        "Reggae": 0.58, "Latin": 0.62, "Classical": 0.75,
        "World": 0.68, "Other": 0.5, "Unknown": 0.5,
    }
    return vibe_map.get(genre_family, 0.5)


async def fetch_json(session, method, params):
    """Last.fm API 호출"""
    params["api_key"] = LASTFM_API_KEY
    params["format"] = "json"
    params["method"] = method
    
    try:
        async with session.get(LASTFM_BASE_URL, params=params) as response:
            if response.status != 200:
                print(f"⚠️ HTTP {response.status}")
                return None
            return await response.json()
    except Exception as e:
        print(f"⚠️ Error: {e}")
        return None


async def get_top_albums_by_tag(session, tag, limit=50):
    """특정 태그(장르)의 Top Albums"""
    params = {"tag": tag, "limit": limit}
    await asyncio.sleep(RATE_LIMIT_DELAY)
    return await fetch_json(session, "tag.getTopAlbums", params)


async def get_album_info(session, artist, album):
    """앨범 상세 정보"""
    params = {"artist": artist, "album": album, "autocorrect": 1}
    await asyncio.sleep(RATE_LIMIT_DELAY)
    return await fetch_json(session, "album.getInfo", params)


async def get_artist_info(session, artist):
    """아티스트 상세 정보 (국가 등)"""
    params = {"artist": artist, "autocorrect": 1}
    await asyncio.sleep(RATE_LIMIT_DELAY)
    return await fetch_json(session, "artist.getInfo", params)


async def collect_albums():
    """Last.fm에서 앨범 수집"""
    if not LASTFM_API_KEY:
        print("❌ LASTFM_API_KEY not found in environment!")
        print("   Get your free API key: https://www.last.fm/api/account/create")
        return []
    
    collected_albums = []
    seen_ids = set()
    
    async with aiohttp.ClientSession() as session:
        for tag in GENRE_TAGS:
            if len(collected_albums) >= TARGET_ALBUMS:
                break
            
            print(f"\n🔍 Tag: {tag}")
            
            result = await get_top_albums_by_tag(session, tag, limit=50)
            if not result or "albums" not in result or "album" not in result["albums"]:
                print(f"   No results")
                continue
            
            albums_list = result["albums"]["album"]
            print(f"   Found {len(albums_list)} albums")
            
            for album_data in albums_list:
                if len(collected_albums) >= TARGET_ALBUMS:
                    break
                
                artist_name = album_data.get("artist", {})
                if isinstance(artist_name, dict):
                    artist_name = artist_name.get("name", "Unknown")
                
                album_name = album_data.get("name", "Unknown")
                
                # 고유 ID 생성
                album_id = f"lastfm:{artist_name}:{album_name}".replace(" ", "_").lower()
                
                if album_id in seen_ids:
                    continue
                
                # 앨범 상세 정보
                album_info = await get_album_info(session, artist_name, album_name)
                if not album_info or "album" not in album_info:
                    continue
                
                album_detail = album_info["album"]
                
                # 연도 추출
                wiki = album_detail.get("wiki", {})
                published = wiki.get("published", "") if wiki else ""
                year = None
                if published and len(published) >= 4:
                    try:
                        year = int(published[:4])
                    except:
                        pass
                
                # 태그 추출
                tags_data = album_detail.get("tags", {}).get("tag", [])
                if isinstance(tags_data, dict):
                    tags_data = [tags_data]
                tags = [t.get("name", "") for t in tags_data if isinstance(t, dict)][:5]
                
                # 아티스트 정보 (국가)
                artist_info = await get_artist_info(session, artist_name)
                country = None
                if artist_info and "artist" in artist_info:
                    bio = artist_info["artist"].get("bio", {})
                    if bio:
                        # Last.fm bio에서 국가 추출 (간단한 휴리스틱)
                        content = bio.get("content", "").lower()
                        
                        # 국가명 키워드 매칭
                        country_keywords = {
                            "United States": ["american", "from the us", "from america", "based in the united states"],
                            "United Kingdom": ["british", "from the uk", "from england", "london-based"],
                            "Canada": ["canadian", "from canada"],
                            "Australia": ["australian", "from australia"],
                            "France": ["french", "from france"],
                            "Germany": ["german", "from germany"],
                            "Japan": ["japanese", "from japan"],
                            "Brazil": ["brazilian", "from brazil"],
                            "Jamaica": ["jamaican", "from jamaica"],
                        }
                        
                        for country_name, keywords in country_keywords.items():
                            if any(kw in content for kw in keywords):
                                country = country_name
                                break
                
                # 데이터 변환
                genre_family = map_genre_to_family(tags)
                region_bucket = get_region_from_country(country)
                
                # playcount 기반 인기도 (정규화)
                playcount = int(album_detail.get("playcount", 0))
                popularity = min(playcount / 10000000, 1.0)  # 1000만 재생 = 1.0
                
                # 이미지 URL
                images = album_detail.get("image", [])
                cover_url = None
                if images:
                    for img in images:
                        if img.get("#text"):
                            cover_url = img["#text"]
                            break
                
                album_obj = {
                    "id": album_id[:255],  # DB 제한
                    "title": album_name[:255],
                    "artist_name": artist_name[:255],
                    "year": year,
                    "genre": genre_family,
                    "genre_vibe": get_genre_vibe(genre_family),
                    "region_bucket": region_bucket,
                    "country": country,
                    "popularity": max(popularity, 0.6),  # Last.fm top albums는 최소 0.6
                    "cover_url": cover_url,
                }
                
                collected_albums.append(album_obj)
                seen_ids.add(album_id)
                
                if len(collected_albums) % 20 == 0:
                    print(f"      ✅ Collected: {len(collected_albums)}")
    
    return collected_albums


async def main():
    print("🎵 Last.fm Album Fetcher")
    print("=" * 60)
    print(f"Target: {TARGET_ALBUMS} albums")
    print(f"Genre tags: {len(GENRE_TAGS)}")
    print("=" * 60)
    
    # 앨범 수집
    print("\n📡 Fetching albums from Last.fm...")
    albums = await collect_albums()
    
    if not albums:
        print("❌ No albums collected!")
        return
    
    print(f"\n✅ Collected {len(albums)} albums")
    
    # 통계
    print(f"\n📊 Statistics:")
    year_dist = Counter(a["year"] for a in albums if a["year"])
    region_dist = Counter(a["region_bucket"] for a in albums)
    genre_dist = Counter(a["genre"] for a in albums)
    
    print(f"\n📅 Year distribution (top 15):")
    for year, count in sorted(year_dist.items(), reverse=True)[:15]:
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
            print(f"\n➕ Adding new albums (showing first 10):")
            for album in new_albums[:10]:
                print(f"   • {album.year if album.year else '????'} - {album.artist_name} - {album.title}")
            
            session.add_all(new_albums)
            await session.commit()
            print(f"\n✅ Successfully inserted {len(new_albums)} albums!")
        else:
            print(f"\n✅ No new albums to add - database is up to date!")
        
        result = await session.execute(select(Album))
        all_albums = result.scalars().all()
        print(f"\n📊 Final database count: {len(all_albums)} albums")
    
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
