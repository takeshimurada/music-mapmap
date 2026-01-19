from fastapi import FastAPI, Depends, HTTPException, Query, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, delete
from typing import List, Optional
from uuid import UUID
import uuid

from .database import engine, Base, get_db
from .models import Album, AlbumDetail, UserRating, DevUser, UserLike, UserEvent
from .schemas import (
    AlbumResponse, MapPoint, ResearchRequest, APIResponse, RatingCreate,
    DevUserCreateResponse, LikeRequest, LikeResponse, LikeItem, LikesListResponse,
    EventRequest, EventResponse
)
from .service_gemini import get_ai_research

app = FastAPI(title="Sonic Topography API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    # Simple table creation for MVP
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

# ========================================
# Step 1: 개발용 인증 Dependency
# ========================================

async def get_current_user(
    x_user_id: str = Header(..., alias="X-User-Id"),
    db: AsyncSession = Depends(get_db)
) -> DevUser:
    """개발용 인증: X-User-Id 헤더로 유저 확인"""
    try:
        user_uuid = UUID(x_user_id)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=401, detail="Invalid X-User-Id format")
    
    stmt = select(DevUser).where(DevUser.id == user_uuid)
    result = await db.execute(stmt)
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    return user

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/map/points", response_model=APIResponse)
async def get_map_points(
    yearFrom: int = 1960,
    yearTo: int = 2024,
    zoom: float = 1.0,
    db: AsyncSession = Depends(get_db)
):
    """
    LOD (Level of Detail) Implementation:
    - Low Zoom (< 2): Return Grid Aggregates
    - High Zoom (>= 2): Return Individual Points
    """
    
    if zoom < 2.0:
        # Grid Aggregation (SQL Group By)
        # Bucketing: Year (X) by 5 years, Vibe (Y) by 0.1
        # Note: Math logic depends on DB data distribution
        stmt = text("""
            SELECT 
                avg(year) as x, 
                avg(genre_vibe) as y, 
                count(*) as count,
                mode() WITHIN GROUP (ORDER BY region_bucket) as color
            FROM albums
            WHERE year BETWEEN :y1 AND :y2
            GROUP BY floor(year / 5), floor(genre_vibe * 10)
        """)
        result = await db.execute(stmt, {"y1": yearFrom, "y2": yearTo})
        points = []
        for row in result:
            points.append(MapPoint(
                x=row.x,
                y=row.y,
                r=min(row.count * 0.5 + 2, 20), # scale radius
                count=row.count,
                color=row.color, # simplified region color mapping
                is_cluster=True
            ))
        return APIResponse(data=points)
    
    else:
        # Individual Points
        stmt = select(Album).where(Album.year >= yearFrom, Album.year <= yearTo).limit(2000)
        result = await db.execute(stmt)
        albums = result.scalars().all()
        points = []
        for a in albums:
            points.append(MapPoint(
                id=a.id,
                x=a.year,
                y=a.genre_vibe,
                r=(a.popularity * 10) + 2,
                color=a.region_bucket,
                is_cluster=False,
                label=a.title
            ))
        return APIResponse(data=points)

@app.get("/albums", response_model=APIResponse)
async def get_all_albums(
    limit: int = 2000,
    offset: int = 0,
    db: AsyncSession = Depends(get_db)
):
    """모든 앨범 조회 (페이지네이션 지원)"""
    stmt = select(Album).offset(offset).limit(limit)
    result = await db.execute(stmt)
    albums = result.scalars().all()
    return APIResponse(data=[AlbumResponse.model_validate(a) for a in albums])

@app.get("/search", response_model=APIResponse)
async def search_albums(q: str, db: AsyncSession = Depends(get_db)):
    stmt = select(Album).where(
        (Album.title.ilike(f"%{q}%")) | (Album.artist_name.ilike(f"%{q}%"))
    ).limit(20)
    result = await db.execute(stmt)
    albums = result.scalars().all()
    return APIResponse(data=[AlbumResponse.model_validate(a) for a in albums])

@app.get("/albums/{album_id}", response_model=APIResponse)
async def get_album_detail(album_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(Album).where(Album.id == album_id)
    result = await db.execute(stmt)
    album = result.scalars().first()
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    
    # Lazy load details if needed, or join in query
    return APIResponse(data=AlbumResponse.model_validate(album))

@app.post("/research", response_model=APIResponse)
async def create_research(req: ResearchRequest, db: AsyncSession = Depends(get_db)):
    data = await get_ai_research(db, req.album_id, req.lang)
    return APIResponse(data=data)

# Auth Endpoints (Stub for MVP)
@app.get("/me")
async def get_me():
    # In real app, verify JWT from header
    return {"id": 1, "name": "Demo User", "email": "demo@example.com"}

@app.post("/me/ratings")
async def rate_album(rating: RatingCreate, db: AsyncSession = Depends(get_db)):
    # Upsert rating logic here
    return {"status": "saved"}

# ========================================
# Step 1: 개발용 유저 & Like & 이벤트 라우트
# ========================================

@app.post("/dev/users", response_model=DevUserCreateResponse)
async def create_dev_user(db: AsyncSession = Depends(get_db)):
    """개발용 유저 생성 (body 없음)"""
    new_user = DevUser()
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return DevUserCreateResponse(user_id=new_user.id)

@app.post("/me/likes", response_model=LikeResponse)
async def create_like(
    like: LikeRequest,
    current_user: DevUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """좋아요 추가 (멱등 처리)"""
    # 이미 있는지 확인
    stmt = select(UserLike).where(
        UserLike.user_id == current_user.id,
        UserLike.entity_type == like.entity_type,
        UserLike.entity_id == like.entity_id
    )
    result = await db.execute(stmt)
    existing = result.scalars().first()
    
    if existing:
        # 이미 있으면 그대로 반환
        return LikeResponse(status="liked")
    
    # 없으면 추가
    new_like = UserLike(
        user_id=current_user.id,
        entity_type=like.entity_type,
        entity_id=like.entity_id
    )
    db.add(new_like)
    await db.commit()
    return LikeResponse(status="liked")

@app.delete("/me/likes", response_model=LikeResponse)
async def delete_like(
    like: LikeRequest,
    current_user: DevUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """좋아요 삭제 (멱등 처리)"""
    stmt = delete(UserLike).where(
        UserLike.user_id == current_user.id,
        UserLike.entity_type == like.entity_type,
        UserLike.entity_id == like.entity_id
    )
    await db.execute(stmt)
    await db.commit()
    return LikeResponse(status="unliked")

@app.get("/me/likes", response_model=LikesListResponse)
async def get_likes(
    entity_type: Optional[str] = Query(None),
    current_user: DevUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """좋아요 목록 조회"""
    stmt = select(UserLike).where(UserLike.user_id == current_user.id)
    
    if entity_type:
        stmt = stmt.where(UserLike.entity_type == entity_type)
    
    stmt = stmt.order_by(UserLike.liked_at.desc())
    result = await db.execute(stmt)
    likes = result.scalars().all()
    
    items = [
        LikeItem(
            entity_type=like.entity_type,
            entity_id=like.entity_id,
            liked_at=like.liked_at
        )
        for like in likes
    ]
    
    return LikesListResponse(items=items)

@app.post("/events", response_model=EventResponse)
async def create_event(
    event: EventRequest,
    current_user: DevUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """이벤트 로그 생성"""
    new_event = UserEvent(
        user_id=current_user.id,
        event_type=event.event_type,
        entity_type=event.entity_type,
        entity_id=event.entity_id,
        payload=event.payload
    )
    db.add(new_event)
    await db.commit()
    await db.refresh(new_event)
    return EventResponse(status="ok", event_id=new_event.id)
