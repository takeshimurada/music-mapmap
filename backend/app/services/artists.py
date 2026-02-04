from sqlalchemy.ext.asyncio import AsyncSession

from ..schemas import ArtistProfileResponse, ArtistLinkResponse, ArtistAlbumResponse, ArtistRelationResponse
from ..repositories import albums as album_repo


async def get_artist_profile(db: AsyncSession, name: str):
    if not name:
        return None

    normalized = name.strip()
    if not normalized:
        return None

    row = await album_repo.get_artist_profile_exact(db, normalized)

    creator = None
    profile = None
    if row:
        creator, profile = row
    else:
        row = await album_repo.get_artist_profile_fuzzy(db, normalized)
        if row:
            creator, profile = row

    display_name = creator.display_name if creator else normalized
    creator_id = creator.creator_id if creator else None
    bio = creator.bio if creator else None
    image_url = creator.image_url if creator else None
    genres = profile.genres if profile and profile.genres else []
    spotify_url = profile.spotify_url if profile else None

    links = []
    if creator_id:
        creator_links = await album_repo.get_creator_links(db, creator_id)
        links = [
            ArtistLinkResponse(
                provider=l.provider,
                url=l.url,
                external_id=l.external_id,
                is_primary=l.is_primary
            )
            for l in creator_links
        ]

    discography_res = await album_repo.get_discography(db, display_name)
    discography = [
        ArtistAlbumResponse(
            id=a.album_group_id,
            title=a.title,
            year=a.original_year,
            cover_url=a.cover_url
        )
        for a in discography_res
    ]

    relations = []
    if creator_id:
        forward = await album_repo.get_creator_relations_forward(db, creator_id)
        for rel, other in forward:
            relations.append(ArtistRelationResponse(
                relation_type=rel.relation_type,
                creator_id=other.creator_id,
                display_name=other.display_name
            ))

        reverse = await album_repo.get_creator_relations_reverse(db, creator_id)
        for rel, other in reverse:
            relations.append(ArtistRelationResponse(
                relation_type=rel.relation_type,
                creator_id=other.creator_id,
                display_name=other.display_name
            ))

    return ArtistProfileResponse(
        creator_id=creator_id,
        display_name=display_name,
        bio=bio,
        image_url=image_url,
        genres=genres,
        spotify_url=spotify_url,
        links=links,
        discography=discography,
        relations=relations
    )
