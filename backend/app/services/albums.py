from typing import List
from sqlalchemy.ext.asyncio import AsyncSession

from ..schemas import (
    AlbumResponse, MapPoint, AlbumGroupDetailResponse, ReleaseResponse, TrackResponse,
    AlbumCreditResponse, TrackCreditResponse, CreatorResponse, RoleResponse,
    AssetResponse, AlbumLinkResponse, AlbumAwardResponse
)
from ..repositories import albums as album_repo
from .common import country_to_region, genre_to_vibe


async def get_map_points(db: AsyncSession, year_from: int, year_to: int, zoom: float):
    if zoom < 2.0:
        result = await album_repo.get_map_points_grid(db, year_from, year_to)
        points = []
        for row in result:
            region = country_to_region(row.country_code)
            points.append(MapPoint(
                x=row.x,
                y=row.y,
                r=min(row.count * 0.5 + 2, 20),
                count=row.count,
                color=region,
                is_cluster=True
            ))
        return points

    result = await album_repo.get_album_groups_with_nodes(db, year_from, year_to, 50000)
    points = []
    for ag, mn in result.all():
        region = country_to_region(ag.country_code)
        points.append(MapPoint(
            id=ag.album_group_id,
            x=ag.original_year or 0,
            y=mn.y,
            r=mn.size,
            color=region,
            is_cluster=False,
            label=ag.title
        ))
    return points


async def list_albums(db: AsyncSession, limit: int, offset: int):
    result = await album_repo.get_all_albums(db, limit, offset)
    albums = []
    for ag, mn in result.all():
        albums.append(AlbumResponse(
            id=ag.album_group_id,
            title=ag.title,
            artist_name=ag.primary_artist_display,
            year=ag.original_year or 0,
            genre=ag.primary_genre or "Unknown",
            genre_vibe=genre_to_vibe(ag.primary_genre),
            region_bucket=country_to_region(ag.country_code),
            country=ag.country_code,
            cover_url=ag.cover_url,
            popularity=ag.popularity or 0.0,
            release_date=ag.earliest_release_date,
            created_at=ag.created_at
        ))
    return albums


async def search_albums(db: AsyncSession, q: str):
    result = await album_repo.search_albums(db, q)
    albums = []
    for ag, mn in result.all():
        albums.append(AlbumResponse(
            id=ag.album_group_id,
            title=ag.title,
            artist_name=ag.primary_artist_display,
            year=ag.original_year or 0,
            genre=ag.primary_genre or "Unknown",
            genre_vibe=genre_to_vibe(ag.primary_genre),
            region_bucket=country_to_region(ag.country_code),
            country=ag.country_code,
            cover_url=ag.cover_url,
            popularity=ag.popularity or 0.0,
            release_date=ag.earliest_release_date,
            created_at=ag.created_at
        ))
    return albums


async def get_album_summary(db: AsyncSession, album_id: str):
    row = await album_repo.get_album_group(db, album_id)
    if not row:
        return None
    ag, mn = row
    return AlbumResponse(
        id=ag.album_group_id,
        title=ag.title,
        artist_name=ag.primary_artist_display,
        year=ag.original_year or 0,
        genre=ag.primary_genre or "Unknown",
        genre_vibe=genre_to_vibe(ag.primary_genre),
        region_bucket=country_to_region(ag.country_code),
        country=ag.country_code,
        cover_url=ag.cover_url,
        popularity=ag.popularity or 0.0,
        release_date=ag.earliest_release_date,
        created_at=ag.created_at
    )


async def get_album_group_detail(db: AsyncSession, album_id: str):
    row = await album_repo.get_album_group(db, album_id)
    if not row:
        return None
    ag, mn = row

    album = AlbumResponse(
        id=ag.album_group_id,
        title=ag.title,
        artist_name=ag.primary_artist_display,
        year=ag.original_year or 0,
        genre=ag.primary_genre or "Unknown",
        genre_vibe=genre_to_vibe(ag.primary_genre),
        region_bucket=country_to_region(ag.country_code),
        country=ag.country_code,
        cover_url=ag.cover_url,
        popularity=ag.popularity or 0.0,
        release_date=ag.earliest_release_date,
        created_at=ag.created_at
    )

    releases = await album_repo.get_releases_for_album(db, album_id)
    releases_resp = [
        ReleaseResponse(
            release_id=r.release_id,
            release_title=r.release_title,
            release_date=r.release_date,
            country_code=r.country_code,
            edition=r.edition,
            cover_url=r.cover_url
        )
        for r in releases
    ]

    tracks_resp: List[TrackResponse] = []
    if releases_resp:
        release_ids = [r.release_id for r in releases_resp]
        tracks = await album_repo.get_tracks_for_releases(db, release_ids)
        tracks_resp = [
            TrackResponse(
                track_id=t.track_id,
                disc_no=t.disc_no,
                track_no=t.track_no,
                title=t.title,
                duration_ms=t.duration_ms,
                isrc=t.isrc
            )
            for t in tracks
        ]

    album_credits = await album_repo.get_album_credits(db, album_id)
    album_credits_resp = [
        AlbumCreditResponse(
            creator=CreatorResponse(
                creator_id=creator.creator_id,
                display_name=creator.display_name,
                image_url=creator.image_url
            ),
            role=RoleResponse(
                role_id=role.role_id,
                role_name=role.role_name,
                role_group=role.role_group
            ),
            credit_detail=credit.credit_detail,
            credit_order=credit.credit_order
        )
        for credit, creator, role in album_credits
    ]

    track_credits_resp: List[TrackCreditResponse] = []
    if tracks_resp:
        track_ids = [t.track_id for t in tracks_resp]
        track_credits = await album_repo.get_track_credits(db, track_ids)
        track_credits_resp = [
            TrackCreditResponse(
                creator=CreatorResponse(
                    creator_id=creator.creator_id,
                    display_name=creator.display_name,
                    image_url=creator.image_url
                ),
                role=RoleResponse(
                    role_id=role.role_id,
                    role_name=role.role_name,
                    role_group=role.role_group
                ),
                credit_detail=credit.credit_detail,
                credit_order=credit.credit_order
            )
            for credit, creator, role in track_credits
        ]

    assets = await album_repo.get_assets_for_album(db, album_id)
    assets_resp = [
        AssetResponse(
            asset_id=a.asset_id,
            asset_type=a.asset_type,
            title=a.title,
            url=a.url,
            summary=a.summary,
            published_at=a.published_at
        )
        for a in assets
    ]

    album_links = await album_repo.get_album_links(db, album_id)
    album_links_resp = [
        AlbumLinkResponse(
            provider=l.provider,
            url=l.url,
            external_id=l.external_id,
            is_primary=l.is_primary
        )
        for l in album_links
    ]

    album_awards = await album_repo.get_album_awards(db, album_id)
    album_awards_resp = [
        AlbumAwardResponse(
            award_name=a.award_name,
            award_kind=a.award_kind,
            award_year=a.award_year,
            award_result=a.award_result,
            award_category=a.award_category,
            source_url=a.source_url,
            sources=a.sources,
            region=a.region,
            country=a.country,
            genre_tags=a.genre_tags
        )
        for a in album_awards
    ]

    return AlbumGroupDetailResponse(
        album=album,
        releases=releases_resp,
        tracks=tracks_resp,
        album_credits=album_credits_resp,
        track_credits=track_credits_resp,
        assets=assets_resp,
        album_links=album_links_resp,
        album_awards=album_awards_resp
    )
