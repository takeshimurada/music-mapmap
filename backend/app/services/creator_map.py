from sqlalchemy.ext.asyncio import AsyncSession

from ..schemas import ArtistMapNodeResponse, ArtistMapEdgeResponse
from ..repositories import creator_map as creator_map_repo


async def get_creator_nodes(db: AsyncSession, limit: int, offset: int):
    rows = await creator_map_repo.get_creator_nodes(db, limit, offset)
    nodes = []
    for node, creator, profile, album_count in rows:
        genres = profile.genres if profile and profile.genres else []
        nodes.append(
            ArtistMapNodeResponse(
                creator_id=creator.creator_id,
                display_name=creator.display_name,
                x=node.x,
                y=node.y,
                size=node.size,
                genres=genres,
                country_code=creator.country_code,
                popularity=profile.popularity if profile else None,
                album_count=album_count,
                image_url=creator.image_url,
            )
        )
    return nodes


async def get_creator_edges(db: AsyncSession, min_weight: float, limit: int, offset: int):
    rows = await creator_map_repo.get_creator_edges(db, min_weight, limit, offset)
    return [
        ArtistMapEdgeResponse(
            source_creator_id=row.source_creator_id,
            target_creator_id=row.target_creator_id,
            weight=row.weight,
            components=row.components,
        )
        for row in rows
    ]
