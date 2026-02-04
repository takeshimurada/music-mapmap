"""API smoke test script."""
import asyncio
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, func
from app.database import AsyncSessionLocal
from app.models import AlbumGroup, MapNode
from app.services.common import country_to_region, genre_to_vibe


async def run_api_checks():
    """Basic API data checks against the database."""
    async with AsyncSessionLocal() as session:
        # Total album groups
        result = await session.execute(select(func.count(AlbumGroup.album_group_id)))
        total = result.scalar()
        print(f"Total album groups: {total}")

        # Latest 10 albums by year
        stmt = select(AlbumGroup).order_by(AlbumGroup.original_year.desc()).limit(10)
        result = await session.execute(stmt)
        albums = result.scalars().all()

        print("\nLatest 10 albums:")
        for album in albums:
            print(f"  - {album.original_year}: {album.primary_artist_display} - {album.title} ({album.primary_genre})")

        # Year distribution sample
        stmt = (
            select(AlbumGroup.original_year, func.count(AlbumGroup.album_group_id))
            .group_by(AlbumGroup.original_year)
            .order_by(AlbumGroup.original_year)
        )
        result = await session.execute(stmt)
        year_dist = result.all()

        print("\nYear distribution (sample):")
        for year, count in year_dist[:10]:
            print(f"  {year}: {count}")

        # Genre distribution top 10
        stmt = (
            select(AlbumGroup.primary_genre, func.count(AlbumGroup.album_group_id))
            .group_by(AlbumGroup.primary_genre)
            .order_by(func.count(AlbumGroup.album_group_id).desc())
            .limit(10)
        )
        result = await session.execute(stmt)
        genre_dist = result.all()

        print("\nTop 10 genres:")
        for genre, count in genre_dist:
            print(f"  {genre}: {count}")

        # Region distribution (by country mapping)
        stmt = select(AlbumGroup.country_code, func.count(AlbumGroup.album_group_id)).group_by(AlbumGroup.country_code)
        result = await session.execute(stmt)
        region_counts = {}
        for country, count in result.all():
            region = country_to_region(country)
            region_counts[region] = region_counts.get(region, 0) + count

        print("\nRegion distribution:")
        for region, count in sorted(region_counts.items(), key=lambda x: x[1], reverse=True):
            print(f"  {region}: {count}")

        # Map sample (join MapNode if available)
        stmt = (
            select(AlbumGroup, MapNode)
            .join(MapNode, AlbumGroup.album_group_id == MapNode.album_group_id, isouter=True)
            .where(AlbumGroup.original_year >= 1960, AlbumGroup.original_year <= 2024)
            .limit(5)
        )
        result = await session.execute(stmt)
        samples = result.all()

        print("\nMap sample (5 rows):")
        for album, node in samples:
            vibe = genre_to_vibe(album.primary_genre)
            y = node.y if node else None
            size = node.size if node else None
            print(f"  - x:{album.original_year}, y:{y}, r:{size}, color:{country_to_region(album.country_code)}")
            print(f"    {album.primary_artist_display} - {album.title} (vibe {vibe:.2f})")


def test_api():
    asyncio.run(run_api_checks())


if __name__ == "__main__":
    asyncio.run(run_api_checks())
