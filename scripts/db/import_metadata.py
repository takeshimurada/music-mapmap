"""
메타데이터 임포트 스크립트

아티스트, 협업 관계, 크레딧 정보를 DB에 임포트

Usage:
  docker exec sonic_backend python scripts/db/import_metadata.py
"""

import json
import sys
import asyncio
import uuid
from pathlib import Path

# Docker 컨테이너 내부에서는 /app이 루트
sys.path.insert(0, "/app")

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from app.database import Base, DATABASE_URL
from app.models import (
    CreatorIdMap,
    Creator,
    CreatorSpotifyProfile,
    AlbumGroup,
    AlbumCredit,
    Role,
)

# JSON 파일 경로
ARTISTS_FILE = "/out/artists_spotify.json"
COLLABORATIONS_FILE = "/out/album_collaborations.json"
CREDITS_FILE = "/out/album_credits.json"

# DB 엔진 생성
engine = create_async_engine(DATABASE_URL, echo=False)
async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


def to_creator_id(raw_spotify_artist_id: str) -> str:
    return f"spotify:artist:{raw_spotify_artist_id}"

async def ensure_role(session: AsyncSession, role_name: str, role_group: str = "other") -> str:
    stmt = select(Role).where(Role.role_name == role_name)
    result = await session.execute(stmt)
    role = result.scalars().first()
    if role:
        return role.role_id
    role_id = f"local:role:{uuid.uuid4()}"
    role = Role(role_id=role_id, role_name=role_name, role_group=role_group)
    session.add(role)
    await session.commit()
    return role_id

async def import_creators():
    """Phase 1: 아티스트 기본 정보 임포트 -> creators + creator_spotify_profile"""
    print("\n" + "="*70)
    print("🎤 Phase 1: 아티스트 정보 임포트")
    print("="*70 + "\n")

    # JSON 로드
    try:
        with open(ARTISTS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            artists_data = data.get('artists', {})
    except FileNotFoundError:
        print(f"⚠️  {ARTISTS_FILE} 파일이 없습니다. 스킵합니다.")
        return 0
    
    print(f"📥 아티스트 데이터 로드: {len(artists_data)}개")

    # 기존 아티스트 ID 체크
    async with async_session() as session:
        stmt = select(Creator.creator_id)
        result = await session.execute(stmt)
        existing_ids = set(result.scalars().all())
        print(f"📋 기존 DB creators: {len(existing_ids)}개\n")

    # 새 아티스트 필터링
    new_creators = []
    new_profiles = []
    skipped = 0

    for artist_id, artist_data in artists_data.items():
        creator_id = to_creator_id(artist_id)
        if creator_id in existing_ids:
            skipped += 1
            continue

        new_creators.append(Creator(
            creator_id=creator_id,
            display_name=artist_data['name'],
            bio=None,
            image_url=artist_data.get('image_url'),
            kind='person',
            primary_role_tag='artist',
            country_code=artist_data.get('country_code')  # 🌍 MusicBrainz에서 수집한 국가 코드
        ))
        new_profiles.append(CreatorSpotifyProfile(
            creator_id=creator_id,
            genres=artist_data.get('genres', []),
            popularity=artist_data.get('popularity'),
            followers=artist_data.get('followers'),
            spotify_url=artist_data.get('spotify_url')
        ))

    # 국가 정보 통계
    country_count = sum(1 for c in new_creators if c.country_code)
    country_percentage = (country_count / len(new_creators) * 100) if len(new_creators) > 0 else 0
    
    print(f"📊 임포트 분석:")
    print(f"   • 전체: {len(artists_data)}개")
    print(f"   • 이미 존재: {skipped}개")
    print(f"   • 새로 추가: {len(new_creators)}개")
    print(f"   • 국가 정보: {country_count}/{len(new_creators)} ({country_percentage:.1f}%)\n")

    if len(new_creators) == 0:
        print("✅ 추가할 creator가 없습니다.")
        return 0

    # 배치 임포트
    async with async_session() as session:
        batch_size = 500
        for i in range(0, len(new_creators), batch_size):
            batch = new_creators[i:i+batch_size]
            session.add_all(batch)
            await session.commit()
            print(f"💾 Inserted {min(i+batch_size, len(new_creators))}/{len(new_creators)} creators...")

        for i in range(0, len(new_profiles), batch_size):
            batch = new_profiles[i:i+batch_size]
            session.add_all(batch)
            await session.commit()
            print(f"💾 Inserted {min(i+batch_size, len(new_profiles))}/{len(new_profiles)} spotify profiles...")

    print(f"\n✅ creators 임포트 완료: {len(new_creators)}개")
    return len(new_creators)


async def import_collaborations():
    """Phase 2: 앨범-아티스트 관계 -> album_credits(Primary/Featured Artist)"""
    print("\n" + "="*70)
    print("🤝 Phase 2: 협업 관계 임포트")
    print("="*70 + "\n")

    # JSON 로드
    try:
        with open(COLLABORATIONS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            collab_data = data.get('albums', {})
    except FileNotFoundError:
        print(f"⚠️  {COLLABORATIONS_FILE} 파일이 없습니다. 스킵합니다.")
        return 0
    
    print(f"📥 협업 데이터 로드: {len(collab_data)}개 앨범")

    async with async_session() as session:
        # 기존 관계/크리에이터 체크
        stmt = select(AlbumCredit.album_group_id, AlbumCredit.creator_id, AlbumCredit.role_id)
        result = await session.execute(stmt)
        existing_triples = set((r[0], r[1], r[2]) for r in result.all())
        print(f"📋 기존 DB album_credits: {len(existing_triples)}개\n")

        stmt = select(Creator.creator_id)
        result = await session.execute(stmt)
        existing_creator_ids = set(result.scalars().all())

        # 역할 보장 (한 번만)
        primary_role_id = await ensure_role(session, "Primary Artist", "artist")
        featured_role_id = await ensure_role(session, "Featured Artist", "artist")

        # 새 크리에이터/관계 생성
        new_creators = {}
        new_credits = []
        skipped = 0

        for album_id, album_data in collab_data.items():
            # 메인 아티스트
            for idx, artist in enumerate(album_data.get('main_artists', [])):
                creator_id = to_creator_id(artist['id'])
                if creator_id not in existing_creator_ids:
                    new_creators[creator_id] = artist.get('name') or "Unknown"
                triple = (album_data['album_id'], creator_id, primary_role_id)
                if triple not in existing_triples:
                    new_credits.append(AlbumCredit(
                        album_group_id=album_data['album_id'],
                        creator_id=creator_id,
                        role_id=primary_role_id,
                        credit_order=idx
                    ))
                else:
                    skipped += 1

            # 피처링 아티스트
            for idx, artist in enumerate(album_data.get('featured_artists', [])):
                creator_id = to_creator_id(artist['id'])
                if creator_id not in existing_creator_ids:
                    new_creators[creator_id] = artist.get('name') or "Unknown"
                triple = (album_data['album_id'], creator_id, featured_role_id)
                if triple not in existing_triples:
                    new_credits.append(AlbumCredit(
                        album_group_id=album_data['album_id'],
                        creator_id=creator_id,
                        role_id=featured_role_id,
                        credit_order=idx
                    ))
                else:
                    skipped += 1

    print(f"📊 임포트 분석:")
    print(f"   • 이미 존재: {skipped}개")
    print(f"   • 새로 추가: {len(new_credits)}개\n")

    if len(new_credits) == 0 and len(new_creators) == 0:
        print("✅ 추가할 협업 크레딧이 없습니다.")
        return 0

    # 배치 임포트 (creators 먼저)
    async with async_session() as session:
        if new_creators:
            creator_rows = [
                Creator(
                    creator_id=creator_id,
                    display_name=name,
                    kind='person',
                    primary_role_tag='artist'
                )
                for creator_id, name in new_creators.items()
                if creator_id not in existing_creator_ids
            ]
            batch_size = 500
            for i in range(0, len(creator_rows), batch_size):
                batch = creator_rows[i:i+batch_size]
                session.add_all(batch)
                await session.commit()
                print(f"💾 Inserted {min(i+batch_size, len(creator_rows))}/{len(creator_rows)} creators...")

        if new_credits:
            batch_size = 1000
            for i in range(0, len(new_credits), batch_size):
                batch = new_credits[i:i+batch_size]
                session.add_all(batch)
                await session.commit()
                print(f"💾 Inserted {min(i+batch_size, len(new_credits))}/{len(new_credits)} credits...")

    print(f"\n✅ 협업 크레딧 임포트 완료: {len(new_credits)}개")
    return len(new_credits)


async def import_credits():
    """Phase 3: 앨범 크레딧 임포트"""
    print("\n" + "="*70)
    print("🎼 Phase 3: 크레딧 정보 임포트")
    print("="*70 + "\n")

    # JSON 로드
    try:
        with open(CREDITS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            credits_data = data.get('albums', {})
    except FileNotFoundError:
        print(f"⚠️  {CREDITS_FILE} 파일이 없습니다. 스킵합니다.")
        return 0
    
    print(f"📥 크레딧 데이터 로드: {len(credits_data)}개 앨범")

    # 기존 크레딧 체크
    async with async_session() as session:
        stmt = select(AlbumCredit.album_group_id, AlbumCredit.creator_id, AlbumCredit.role_id)
        result = await session.execute(stmt)
        existing_triples = set((r[0], r[1], r[2]) for r in result.all())
        print(f"📋 기존 DB 크레딧: {len(existing_triples)}개\n")

    # 새 크레딧 생성
    new_credits = []
    skipped = 0

    for album_id, album_data in credits_data.items():
        if not album_data.get('found'):
            continue

        for credit in album_data.get('credits', []):
            creator_name = credit['person_name']
            role_name = credit['role']

            async with async_session() as session:
                # ensure role
                role_id = await ensure_role(session, role_name, "other")

                # ensure creator
                stmt = select(Creator).where(Creator.display_name == creator_name)
                result = await session.execute(stmt)
                creator = result.scalars().first()
                if not creator:
                    creator_id = f"local:creator:{uuid.uuid4()}"
                    creator = Creator(
                        creator_id=creator_id,
                        display_name=creator_name,
                        kind='person',
                        primary_role_tag=role_name
                    )
                    session.add(creator)
                    await session.commit()
                else:
                    creator_id = creator.creator_id

            triple = (album_data['album_id'], creator_id, role_id)
            if triple not in existing_triples:
                new_credits.append(AlbumCredit(
                    album_group_id=album_data['album_id'],
                    creator_id=creator_id,
                    role_id=role_id,
                    source_confidence=50
                ))
            else:
                skipped += 1

    print(f"📊 임포트 분석:")
    print(f"   • 이미 존재: {skipped}개")
    print(f"   • 새로 추가: {len(new_credits)}개\n")

    if len(new_credits) == 0:
        print("✅ 추가할 크레딧이 없습니다.")
        return 0

    # 배치 임포트
    async with async_session() as session:
        batch_size = 1000
        for i in range(0, len(new_credits), batch_size):
            batch = new_credits[i:i+batch_size]
            session.add_all(batch)
            await session.commit()
            print(f"💾 Inserted {min(i+batch_size, len(new_credits))}/{len(new_credits)} 크레딧...")

    print(f"\n✅ 크레딧 임포트 완료: {len(new_credits)}개")
    return len(new_credits)


async def show_statistics():
    """DB 통계 출력"""
    print("\n" + "="*70)
    print("📊 최종 DB 통계")
    print("="*70 + "\n")

    async with async_session() as session:
        # 아티스트 수
        stmt = select(Creator)
        result = await session.execute(stmt)
        creators = result.scalars().all()
        print(f"🎤 creators: {len(creators)}개")

        # 앨범-아티스트 관계
        stmt = select(AlbumCredit)
        result = await session.execute(stmt)
        credits = result.scalars().all()
        print(f"🎼 album_credits: {len(credits)}개")

        # 크레딧 역할별 분포
        role_counts = {}
        for credit in credits:
            role_counts[credit.role_id] = role_counts.get(credit.role_id, 0) + 1
        
        if role_counts:
            print("\n   역할별 분포:")
            for role, count in sorted(role_counts.items(), key=lambda x: x[1], reverse=True)[:10]:
                print(f"   • {role}: {count}개")


async def main():
    print("\n" + "="*70)
    print("🗄️  메타데이터 DB 임포트 시작")
    print("="*70)

    # 테이블 생성 (없으면)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Phase 1: 아티스트
    artists_count = await import_creators()

    # Phase 2: 협업 관계
    collab_count = await import_collaborations()

    # Phase 3: 크레딧
    credits_count = await import_credits()

    # 최종 통계
    await show_statistics()

    print("\n" + "="*70)
    print("✅ 메타데이터 임포트 완료!")
    print("="*70)
    print(f"\n📈 임포트 요약:")
    print(f"   • 아티스트: {artists_count}개")
    print(f"   • 협업 관계: {collab_count}개")
    print(f"   • 크레딧: {credits_count}개")
    print()


if __name__ == "__main__":
    asyncio.run(main())
