from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import get_current_user
from ..models import DevUser
from ..schemas import (
    APIResponse, DevUserCreateResponse, LikeRequest, LikeResponse, LikesListResponse, LikeItem,
    EventRequest, EventResponse, RatingCreate
)
from ..services import likes as like_service
from ..services import events as event_service
from ..repositories import users as user_repo

router = APIRouter()


@router.post("/dev/users", response_model=DevUserCreateResponse)
async def create_dev_user(db: AsyncSession = Depends(get_db)):
    new_user = await user_repo.create_dev_user(db)
    return DevUserCreateResponse(user_id=new_user.id)


@router.post("/me/likes", response_model=LikeResponse)
async def create_like(
    like: LikeRequest,
    current_user: DevUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    status = await like_service.create_like(db, current_user.id, like.entity_type, like.entity_id)
    return LikeResponse(status=status)


@router.delete("/me/likes", response_model=LikeResponse)
async def delete_like(
    like: LikeRequest,
    current_user: DevUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    status = await like_service.delete_like(db, current_user.id, like.entity_type, like.entity_id)
    return LikeResponse(status=status)


@router.get("/me/likes", response_model=LikesListResponse)
async def get_likes(
    entity_type: str | None = None,
    current_user: DevUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    likes = await like_service.list_likes(db, current_user.id, entity_type)
    items = [
        LikeItem(
            entity_type=like.entity_type,
            entity_id=like.entity_id,
            liked_at=like.liked_at
        )
        for like in likes
    ]
    return LikesListResponse(items=items)


@router.post("/events", response_model=EventResponse)
async def create_event(
    event: EventRequest,
    current_user: DevUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    new_event = await event_service.create_event(
        db,
        current_user.id,
        event.event_type,
        event.entity_type,
        event.entity_id,
        event.payload
    )
    return EventResponse(status="ok", event_id=new_event.id)


@router.get("/me")
async def get_me():
    # In real app, verify JWT from header
    return {"id": 1, "name": "Demo User", "email": "demo@example.com"}


@router.post("/me/ratings")
async def rate_album(rating: RatingCreate, db: AsyncSession = Depends(get_db)):
    # Deprecated endpoint: kept for backward compatibility
    return {"status": "saved"}
