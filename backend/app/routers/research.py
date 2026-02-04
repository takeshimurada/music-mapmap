from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..schemas import APIResponse, ResearchRequest
from ..services import research as research_service

router = APIRouter()


@router.post("/research", response_model=APIResponse)
async def create_research(req: ResearchRequest, db: AsyncSession = Depends(get_db)):
    data = await research_service.create_research(db, req.album_id, req.lang)
    return APIResponse(data=data)
