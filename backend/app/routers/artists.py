from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..schemas import APIResponse
from ..services import artists as artist_service
from ..services import creator_map as creator_map_service

router = APIRouter()


@router.get("/artists/lookup", response_model=APIResponse)
async def get_artist_profile(name: str, db: AsyncSession = Depends(get_db)):
    profile = await artist_service.get_artist_profile(db, name)
    if not profile:
        raise HTTPException(status_code=400, detail="name is required")
    return APIResponse(data=profile)


@router.get("/artists/map/nodes", response_model=APIResponse)
async def get_artist_map_nodes(
    limit: int = 50000,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    nodes = await creator_map_service.get_creator_nodes(db, limit, offset)
    return APIResponse(data=nodes)


@router.get("/artists/map/edges", response_model=APIResponse)
async def get_artist_map_edges(
    minWeight: float = 0.2,
    limit: int = 20000,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    edges = await creator_map_service.get_creator_edges(db, minWeight, limit, offset)
    return APIResponse(data=edges)
