from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..schemas import APIResponse
from ..services import artists as artist_service

router = APIRouter()


@router.get("/artists/lookup", response_model=APIResponse)
async def get_artist_profile(name: str, db: AsyncSession = Depends(get_db)):
    profile = await artist_service.get_artist_profile(db, name)
    if not profile:
        raise HTTPException(status_code=400, detail="name is required")
    return APIResponse(data=profile)
