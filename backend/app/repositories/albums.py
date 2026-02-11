from typing import List, Tuple
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import AlbumGroup, MapNode, Release, Track, AlbumCredit, TrackCredit, Creator, Role, CulturalAsset, AssetLink, AlbumLink, AlbumAward, CreatorLink, CreatorRelation, CreatorSpotifyProfile


async def get_map_points_grid(db: AsyncSession, year_from: int, year_to: int):
    stmt = text("""
        SELECT 
            avg(ag.original_year) as x, 
            avg(mn.y) as y, 
            count(*) as count,
            mode() WITHIN GROUP (ORDER BY ag.country_code) as country_code
        FROM album_groups ag
        JOIN map_nodes mn ON ag.album_group_id = mn.album_group_id
        WHERE ag.original_year BETWEEN :y1 AND :y2
        GROUP BY floor(ag.original_year / 5), floor(mn.y * 10)
    """)
    result = await db.execute(stmt, {"y1": year_from, "y2": year_to})
    return result


async def get_album_groups_with_nodes(db: AsyncSession, year_from: int, year_to: int, limit: int):
    stmt = (
        select(AlbumGroup, MapNode)
        .join(MapNode, AlbumGroup.album_group_id == MapNode.album_group_id)
        .where(AlbumGroup.original_year >= year_from, AlbumGroup.original_year <= year_to)
        .order_by(AlbumGroup.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return result


async def get_all_albums(db: AsyncSession, limit: int, offset: int):
    stmt = (
        select(AlbumGroup, MapNode)
        .join(MapNode, AlbumGroup.album_group_id == MapNode.album_group_id)
        .order_by(AlbumGroup.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return result


async def search_albums(db: AsyncSession, q: str, limit: int = 20):
    stmt = (
        select(AlbumGroup, MapNode)
        .join(MapNode, AlbumGroup.album_group_id == MapNode.album_group_id)
        .where(
            (AlbumGroup.title.ilike(f"%{q}%")) |
            (AlbumGroup.primary_artist_display.ilike(f"%{q}%"))
        )
        .limit(limit)
    )
    result = await db.execute(stmt)
    return result


async def get_album_group(db: AsyncSession, album_id: str):
    stmt = (
        select(AlbumGroup, MapNode)
        .join(MapNode, AlbumGroup.album_group_id == MapNode.album_group_id, isouter=True)
        .where(AlbumGroup.album_group_id == album_id)
    )
    result = await db.execute(stmt)
    return result.first()


async def get_releases_for_album(db: AsyncSession, album_id: str):
    result = await db.execute(select(Release).where(Release.album_group_id == album_id))
    return result.scalars().all()


async def get_tracks_for_releases(db: AsyncSession, release_ids: List[str]):
    result = await db.execute(select(Track).where(Track.release_id.in_(release_ids)))
    return result.scalars().all()


async def get_album_credits(db: AsyncSession, album_id: str):
    result = await db.execute(
        select(AlbumCredit, Creator, Role)
        .join(Creator, AlbumCredit.creator_id == Creator.creator_id)
        .join(Role, AlbumCredit.role_id == Role.role_id)
        .where(AlbumCredit.album_group_id == album_id)
    )
    return result.all()


async def get_track_credits(db: AsyncSession, track_ids: List[str]):
    result = await db.execute(
        select(TrackCredit, Creator, Role)
        .join(Creator, TrackCredit.creator_id == Creator.creator_id)
        .join(Role, TrackCredit.role_id == Role.role_id)
        .where(TrackCredit.track_id.in_(track_ids))
    )
    return result.all()


async def get_assets_for_album(db: AsyncSession, album_id: str):
    result = await db.execute(
        select(CulturalAsset)
        .join(AssetLink, CulturalAsset.asset_id == AssetLink.asset_id)
        .where(AssetLink.entity_type == "album_group")
        .where(AssetLink.entity_id == album_id)
    )
    return result.scalars().all()


async def get_album_links(db: AsyncSession, album_id: str):
    result = await db.execute(select(AlbumLink).where(AlbumLink.album_group_id == album_id))
    return result.scalars().all()


async def get_album_awards(db: AsyncSession, album_id: str):
    result = await db.execute(select(AlbumAward).where(AlbumAward.album_group_id == album_id))
    return result.scalars().all()


async def get_artist_profile_exact(db: AsyncSession, name: str):
    stmt = (
        select(Creator, CreatorSpotifyProfile)
        .join(CreatorSpotifyProfile, Creator.creator_id == CreatorSpotifyProfile.creator_id, isouter=True)
        .where(Creator.display_name.ilike(name))
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.first()


async def get_artist_profile_fuzzy(db: AsyncSession, name: str):
    stmt = (
        select(Creator, CreatorSpotifyProfile)
        .join(CreatorSpotifyProfile, Creator.creator_id == CreatorSpotifyProfile.creator_id, isouter=True)
        .where(Creator.display_name.ilike(f"%{name}%"))
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.first()


async def get_creator_links(db: AsyncSession, creator_id: str):
    result = await db.execute(select(CreatorLink).where(CreatorLink.creator_id == creator_id))
    return result.scalars().all()


async def get_discography(db: AsyncSession, display_name: str):
    result = await db.execute(
        select(AlbumGroup)
        .where(AlbumGroup.primary_artist_display.ilike(display_name))
        .order_by(AlbumGroup.original_year.desc().nulls_last())
        .limit(200)
    )
    return result.scalars().all()


async def get_creator_relations_forward(db: AsyncSession, creator_id: str):
    result = await db.execute(
        select(CreatorRelation, Creator)
        .join(Creator, Creator.creator_id == CreatorRelation.target_creator_id)
        .where(CreatorRelation.source_creator_id == creator_id)
    )
    return result.all()


async def get_creator_relations_reverse(db: AsyncSession, creator_id: str):
    result = await db.execute(
        select(CreatorRelation, Creator)
        .join(Creator, Creator.creator_id == CreatorRelation.source_creator_id)
        .where(CreatorRelation.target_creator_id == creator_id)
    )
    return result.all()
