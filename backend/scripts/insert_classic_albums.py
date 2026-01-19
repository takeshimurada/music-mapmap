"""
Grammy Awards / Rock and Roll Hall of Fame 클래식 명반 하드코딩 삽입
"""
import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
import sys
sys.path.append("/app")

from app.models import Album

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://sonic:sonic_password@db:5432/sonic_db")

# 🎸 1970-1985년 클래식 명반 데이터
CLASSIC_ALBUMS = [
    # 1970년대 - Rock/Progressive
    {
        "id": "classic:pink-floyd:dark-side",
        "title": "The Dark Side of the Moon",
        "artist_name": "Pink Floyd",
        "year": 1973,
        "genre": "Progressive Rock",
        "genre_vibe": 0.35,
        "country": "United Kingdom",
        "popularity": 95.0,
        "cover_url": "https://i.scdn.co/image/ab67616d0000b273ea7caaff71dea1051d49b2fe"
    },
    {
        "id": "classic:led-zeppelin:iv",
        "title": "Led Zeppelin IV",
        "artist_name": "Led Zeppelin",
        "year": 1971,
        "genre": "Hard Rock",
        "genre_vibe": 0.25,
        "country": "United Kingdom",
        "popularity": 92.0,
        "cover_url": "https://i.scdn.co/image/ab67616d0000b2736f2f499c1df1f210c9b34b32"
    },
    {
        "id": "classic:fleetwood-mac:rumours",
        "title": "Rumours",
        "artist_name": "Fleetwood Mac",
        "year": 1977,
        "genre": "Rock",
        "genre_vibe": 0.45,
        "country": "United Kingdom",
        "popularity": 94.0,
        "cover_url": "https://i.scdn.co/image/ab67616d0000b273e52a59a28efa4773dd2bfe1b"
    },
    {
        "id": "classic:eagles:hotel-california",
        "title": "Hotel California",
        "artist_name": "Eagles",
        "year": 1976,
        "genre": "Rock",
        "genre_vibe": 0.40,
        "country": "United States",
        "popularity": 93.0,
        "cover_url": "https://i.scdn.co/image/ab67616d0000b273705079df98662a701db975dd"
    },
    {
        "id": "classic:bob-marley:exodus",
        "title": "Exodus",
        "artist_name": "Bob Marley & The Wailers",
        "year": 1977,
        "genre": "Reggae",
        "genre_vibe": 0.55,
        "country": "Jamaica",
        "popularity": 89.0,
        "cover_url": "https://i.scdn.co/image/ab67616d0000b273f8e7f64d1dcfe2d54fb37bdc"
    },
    {
        "id": "classic:david-bowie:ziggy",
        "title": "The Rise and Fall of Ziggy Stardust",
        "artist_name": "David Bowie",
        "year": 1972,
        "genre": "Glam Rock",
        "genre_vibe": 0.50,
        "country": "United Kingdom",
        "popularity": 91.0,
        "cover_url": "https://i.scdn.co/image/ab67616d0000b2739a1d644a3e9067f28d1ecf65"
    },
    {
        "id": "classic:marvin-gaye:whats-going-on",
        "title": "What's Going On",
        "artist_name": "Marvin Gaye",
        "year": 1971,
        "genre": "Soul",
        "genre_vibe": 0.52,
        "country": "United States",
        "popularity": 87.0,
        "cover_url": "https://i.scdn.co/image/ab67616d0000b2732b69a6532ad093a329a5ac63"
    },
    {
        "id": "classic:stevie-wonder:innervisions",
        "title": "Innervisions",
        "artist_name": "Stevie Wonder",
        "year": 1973,
        "genre": "Soul",
        "genre_vibe": 0.58,
        "country": "United States",
        "popularity": 86.0,
        "cover_url": "https://i.scdn.co/image/ab67616d0000b273f89d2ad8c3f213c4cf60d1c4"
    },
    {
        "id": "classic:beatles:abbey-road",
        "title": "Abbey Road",
        "artist_name": "The Beatles",
        "year": 1969,
        "genre": "Rock",
        "genre_vibe": 0.48,
        "country": "United Kingdom",
        "popularity": 96.0,
        "cover_url": "https://i.scdn.co/image/ab67616d0000b273dc30583ba717007b00cceb25"
    },
    {
        "id": "classic:rolling-stones:exile",
        "title": "Exile on Main St.",
        "artist_name": "The Rolling Stones",
        "year": 1972,
        "genre": "Rock",
        "genre_vibe": 0.38,
        "country": "United Kingdom",
        "popularity": 88.0,
        "cover_url": "https://i.scdn.co/image/ab67616d0000b273a3b32d1c52455e4f1ba58675"
    },
    
    # 1980년대 - Pop/Funk/Rock
    {
        "id": "classic:michael-jackson:thriller",
        "title": "Thriller",
        "artist_name": "Michael Jackson",
        "year": 1982,
        "genre": "Pop",
        "genre_vibe": 0.68,
        "country": "United States",
        "popularity": 98.0,
        "cover_url": "https://i.scdn.co/image/ab67616d0000b2734121faee8df82c526cbab2be"
    },
    {
        "id": "classic:prince:purple-rain",
        "title": "Purple Rain",
        "artist_name": "Prince & The Revolution",
        "year": 1984,
        "genre": "Funk Rock",
        "genre_vibe": 0.62,
        "country": "United States",
        "popularity": 92.0,
        "cover_url": "https://i.scdn.co/image/ab67616d0000b2737601a37293dc89cfc9c2a5e3"
    },
    {
        "id": "classic:bruce-springsteen:born-usa",
        "title": "Born in the U.S.A.",
        "artist_name": "Bruce Springsteen",
        "year": 1984,
        "genre": "Rock",
        "genre_vibe": 0.42,
        "country": "United States",
        "popularity": 90.0,
        "cover_url": "https://i.scdn.co/image/ab67616d0000b273c58dd612e802c8c75a9e7cec"
    },
    {
        "id": "classic:madonna:like-virgin",
        "title": "Like a Virgin",
        "artist_name": "Madonna",
        "year": 1984,
        "genre": "Pop",
        "genre_vibe": 0.72,
        "country": "United States",
        "popularity": 89.0,
        "cover_url": "https://i.scdn.co/image/ab67616d0000b27340b5e33c5b5e90e3bfff7050"
    },
    {
        "id": "classic:the-police:synchronicity",
        "title": "Synchronicity",
        "artist_name": "The Police",
        "year": 1983,
        "genre": "New Wave",
        "genre_vibe": 0.56,
        "country": "United Kingdom",
        "popularity": 87.0,
        "cover_url": "https://i.scdn.co/image/ab67616d0000b2738b32b139981e79f2eca68e23"
    },
    {
        "id": "classic:ac-dc:back-in-black",
        "title": "Back in Black",
        "artist_name": "AC/DC",
        "year": 1980,
        "genre": "Hard Rock",
        "genre_vibe": 0.22,
        "country": "Australia",
        "popularity": 93.0,
        "cover_url": "https://i.scdn.co/image/ab67616d0000b27351c02a77d09dfcd53c8676d0"
    },
    {
        "id": "classic:dire-straits:brothers-arms",
        "title": "Brothers in Arms",
        "artist_name": "Dire Straits",
        "year": 1985,
        "genre": "Rock",
        "genre_vibe": 0.44,
        "country": "United Kingdom",
        "popularity": 88.0,
        "cover_url": "https://i.scdn.co/image/ab67616d0000b273e13de7b8662b085b0885ffb2"
    },
    {
        "id": "classic:talking-heads:remain-light",
        "title": "Remain in Light",
        "artist_name": "Talking Heads",
        "year": 1980,
        "genre": "New Wave",
        "genre_vibe": 0.60,
        "country": "United States",
        "popularity": 84.0,
        "cover_url": "https://i.scdn.co/image/ab67616d0000b27340341e8e87c01db5e1c0ae80"
    },
    {
        "id": "classic:kate-bush:hounds-love",
        "title": "Hounds of Love",
        "artist_name": "Kate Bush",
        "year": 1985,
        "genre": "Art Pop",
        "genre_vibe": 0.66,
        "country": "United Kingdom",
        "popularity": 83.0,
        "cover_url": "https://i.scdn.co/image/ab67616d0000b27365fd9d2d79d4c5b5f76f2be9"
    },
    {
        "id": "classic:the-clash:london-calling",
        "title": "London Calling",
        "artist_name": "The Clash",
        "year": 1979,
        "genre": "Punk Rock",
        "genre_vibe": 0.34,
        "country": "United Kingdom",
        "popularity": 86.0,
        "cover_url": "https://i.scdn.co/image/ab67616d0000b273b0f2f9c3eb4a3f9948e5ec5e"
    },
    
    # 추가 다양성 - Jazz, Soul, Latin
    {
        "id": "classic:miles-davis:kind-blue",
        "title": "Kind of Blue",
        "artist_name": "Miles Davis",
        "year": 1959,
        "genre": "Jazz",
        "genre_vibe": 0.75,
        "country": "United States",
        "popularity": 90.0,
        "cover_url": "https://i.scdn.co/image/ab67616d0000b273e5a25ed08d1e7e0fbb440fef"
    },
    {
        "id": "classic:aretha-franklin:never-loved",
        "title": "I Never Loved a Man the Way I Love You",
        "artist_name": "Aretha Franklin",
        "year": 1967,
        "genre": "Soul",
        "genre_vibe": 0.54,
        "country": "United States",
        "popularity": 85.0,
        "cover_url": "https://i.scdn.co/image/ab67616d0000b273c02d97f59bee3e5544a9c5b6"
    },
    {
        "id": "classic:simon-garfunkel:bridge",
        "title": "Bridge over Troubled Water",
        "artist_name": "Simon & Garfunkel",
        "year": 1970,
        "genre": "Folk Rock",
        "genre_vibe": 0.46,
        "country": "United States",
        "popularity": 88.0,
        "cover_url": "https://i.scdn.co/image/ab67616d0000b273ec1fb1baeea3e8b2da4aa074"
    },
    {
        "id": "classic:carole-king:tapestry",
        "title": "Tapestry",
        "artist_name": "Carole King",
        "year": 1971,
        "genre": "Singer-Songwriter",
        "genre_vibe": 0.50,
        "country": "United States",
        "popularity": 84.0,
        "cover_url": "https://i.scdn.co/image/ab67616d0000b2737f6f8eee9f1d0759b2a1c39f"
    },
    {
        "id": "classic:santana:abraxas",
        "title": "Abraxas",
        "artist_name": "Santana",
        "year": 1970,
        "genre": "Latin Rock",
        "genre_vibe": 0.58,
        "country": "Mexico",
        "popularity": 82.0,
        "cover_url": "https://i.scdn.co/image/ab67616d0000b273a8dd13d5783e1cf48da9f1cb"
    },
]


def get_region_from_country(country):
    """Country를 기반으로 region_bucket 결정"""
    country_lower = (country or "").lower()
    
    # North America
    if any(c in country_lower for c in ["united states", "canada", "mexico"]):
        return "North America"
    
    # Europe
    if any(c in country_lower for c in [
        "united kingdom", "france", "germany", "italy", "spain",
        "netherlands", "belgium", "sweden", "norway", "denmark",
        "ireland", "portugal", "austria", "switzerland", "poland"
    ]):
        return "Europe"
    
    # Asia
    if any(c in country_lower for c in [
        "japan", "china", "korea", "india", "thailand", "indonesia",
        "vietnam", "philippines", "malaysia", "singapore", "taiwan"
    ]):
        return "Asia"
    
    # South America
    if any(c in country_lower for c in [
        "brazil", "argentina", "colombia", "chile", "peru", "venezuela"
    ]):
        return "South America"
    
    # Oceania
    if any(c in country_lower for c in ["australia", "new zealand"]):
        return "Oceania"
    
    # Africa
    if any(c in country_lower for c in [
        "south africa", "nigeria", "kenya", "egypt", "ethiopia"
    ]):
        return "Africa"
    
    # Caribbean
    if "jamaica" in country_lower:
        return "North America"  # 지리적으로 북미에 가까움
    
    return "Unknown"


async def insert_classic_albums():
    print("🎸 Classic Albums Insertion Script")
    print("=" * 50)
    
    # DB 연결
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session_maker = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    
    async with async_session_maker() as session:
        # 기존 앨범 개수 확인
        result = await session.execute(select(Album))
        existing = result.scalars().all()
        print(f"📊 Current albums in DB: {len(existing)}")
        
        # 삽입할 앨범 준비
        inserted_count = 0
        skipped_count = 0
        
        for album_data in CLASSIC_ALBUMS:
            # 이미 존재하는지 확인
            result = await session.execute(
                select(Album).where(Album.id == album_data["id"])
            )
            existing_album = result.scalar_one_or_none()
            
            if existing_album:
                print(f"⏭️  Skip (exists): {album_data['artist_name']} - {album_data['title']}")
                skipped_count += 1
                continue
            
            # region_bucket 자동 계산
            album_data["region_bucket"] = get_region_from_country(album_data["country"])
            
            # 새 앨범 생성
            new_album = Album(**album_data)
            session.add(new_album)
            inserted_count += 1
            
            print(f"✅ Inserted: {album_data['year']} - {album_data['artist_name']} - {album_data['title']} ({album_data['country']})")
        
        # 커밋
        await session.commit()
        
        print("\n" + "=" * 50)
        print(f"🎉 Insertion Complete!")
        print(f"   ✅ Inserted: {inserted_count} albums")
        print(f"   ⏭️  Skipped: {skipped_count} albums")
        
        # 최종 통계
        result = await session.execute(select(Album))
        all_albums = result.scalars().all()
        print(f"   📊 Total albums in DB: {len(all_albums)}")
        
        # 연도별 분포
        from collections import Counter
        year_dist = Counter(a.year for a in all_albums if a.year)
        print(f"\n📅 Year distribution (1960-1985):")
        for year in sorted([y for y in year_dist.keys() if 1960 <= y <= 1985]):
            print(f"   {year}: {year_dist[year]} albums")
    
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(insert_classic_albums())
