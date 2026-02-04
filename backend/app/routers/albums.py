from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..schemas import APIResponse
from ..services import albums as album_service

router = APIRouter()


@router.get("/map/points", response_model=APIResponse)
async def get_map_points(
    yearFrom: int = 1960,
    yearTo: int = 2024,
    zoom: float = 1.0,
    db: AsyncSession = Depends(get_db)
):
    points = await album_service.get_map_points(db, yearFrom, yearTo, zoom)
    return APIResponse(data=points)


@router.get("/albums", response_model=APIResponse)
async def get_all_albums(
    limit: int = 50000,
    offset: int = 0,
    db: AsyncSession = Depends(get_db)
):
    albums = await album_service.list_albums(db, limit, offset)
    return APIResponse(data=albums)


@router.get("/search", response_model=APIResponse)
async def search_albums(q: str, db: AsyncSession = Depends(get_db)):
    albums = await album_service.search_albums(db, q)
    return APIResponse(data=albums)


@router.get("/albums/{album_id}", response_model=APIResponse)
async def get_album_detail(album_id: str, db: AsyncSession = Depends(get_db)):
    album = await album_service.get_album_summary(db, album_id)
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    return APIResponse(data=album)


@router.get("/album-groups/{album_id}/detail", response_model=APIResponse)
async def get_album_group_detail(album_id: str, db: AsyncSession = Depends(get_db)):
    detail = await album_service.get_album_group_detail(db, album_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Album not found")
    return APIResponse(data=detail)
