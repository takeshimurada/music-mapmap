from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import AlbumCredit, Creator, CreatorNode, CreatorEdge, CreatorSpotifyProfile, Role


async def get_creator_nodes(db: AsyncSession, limit: int, offset: int):
    primary_credit_sq = (
        select(AlbumCredit.creator_id.label("creator_id"), AlbumCredit.album_group_id.label("album_group_id"))
        .join(Role, Role.role_id == AlbumCredit.role_id)
        .where(Role.role_name == "Primary Artist")
        .subquery()
    )

    album_count_sq = (
        select(
            primary_credit_sq.c.creator_id.label("creator_id"),
            func.count(func.distinct(primary_credit_sq.c.album_group_id)).label("album_count"),
        )
        .group_by(primary_credit_sq.c.creator_id)
        .subquery()
    )

    stmt = (
        select(
            CreatorNode,
            Creator,
            CreatorSpotifyProfile,
            func.coalesce(album_count_sq.c.album_count, 0).label("album_count"),
        )
        .join(Creator, Creator.creator_id == CreatorNode.creator_id)
        .join(CreatorSpotifyProfile, Creator.creator_id == CreatorSpotifyProfile.creator_id, isouter=True)
        .join(album_count_sq, album_count_sq.c.creator_id == Creator.creator_id, isouter=True)
        .where(album_count_sq.c.album_count.isnot(None))
        .order_by(CreatorNode.size.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    return result.all()


async def get_creator_edges(db: AsyncSession, min_weight: float, limit: int, offset: int):
    primary_creator_sq = (
        select(AlbumCredit.creator_id.label("creator_id"))
        .join(Role, Role.role_id == AlbumCredit.role_id)
        .where(Role.role_name == "Primary Artist")
        .group_by(AlbumCredit.creator_id)
        .subquery()
    )

    stmt = (
        select(CreatorEdge)
        .where(CreatorEdge.weight >= min_weight)
        .where(CreatorEdge.source_creator_id.in_(select(primary_creator_sq.c.creator_id)))
        .where(CreatorEdge.target_creator_id.in_(select(primary_creator_sq.c.creator_id)))
        .order_by(CreatorEdge.weight.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    return result.scalars().all()
