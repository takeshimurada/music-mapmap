from fastapi import FastAPI, Depends, HTTPException, Query, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, delete
from typing import List, Optional
from uuid import UUID
import uuid

from .database import engine, Base, get_db
from .models import (
    AlbumGroup,
    MapNode,
    Release,
    Track,
    AlbumCredit,
    TrackCredit,
    Role,
    Creator,
    CulturalAsset,
    AssetLink,
    AlbumLink,
    DevUser,
    UserLike,
    UserEvent,
)
from .schemas import (
    AlbumResponse, MapPoint, ResearchRequest, APIResponse, RatingCreate,
    DevUserCreateResponse, LikeRequest, LikeResponse, LikeItem, LikesListResponse,
    EventRequest, EventResponse, AlbumGroupDetailResponse, ReleaseResponse, TrackResponse,
    AlbumCreditResponse, TrackCreditResponse, CreatorResponse, RoleResponse,
    AssetResponse, AlbumLinkResponse
)
from .service_gemini import get_ai_research

app = FastAPI(title="Sonic Topography API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
        "https://music-mapmap.pages.dev",
    ],
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
# Helpers
# ========================================

COUNTRY_TO_REGION = {
    'United States': 'North America', 'USA': 'North America', 'US': 'North America',
    'Canada': 'North America', 'Mexico': 'North America',
    'UK': 'Europe', 'United Kingdom': 'Europe', 'England': 'Europe', 'Scotland': 'Europe', 'Wales': 'Europe',
    'Germany': 'Europe', 'France': 'Europe', 'Italy': 'Europe', 'Spain': 'Europe',
    'Netherlands': 'Europe', 'Belgium': 'Europe', 'Switzerland': 'Europe', 'Austria': 'Europe',
    'Sweden': 'Europe', 'Norway': 'Europe', 'Denmark': 'Europe', 'Finland': 'Europe',
    'Poland': 'Europe', 'Portugal': 'Europe', 'Ireland': 'Europe', 'Greece': 'Europe',
    'Iceland': 'Europe', 'Russia': 'Europe', 'Soviet Union': 'Europe', 'Turkey': 'Europe',
    'Czech Republic': 'Europe', 'Hungary': 'Europe', 'Romania': 'Europe', 'Bulgaria': 'Europe',
    'South Korea': 'Asia', 'Korea': 'Asia', 'Japan': 'Asia', 'China': 'Asia', 'Taiwan': 'Asia',
    'Hong Kong': 'Asia', 'Singapore': 'Asia', 'Thailand': 'Asia', 'Malaysia': 'Asia',
    'Indonesia': 'Asia', 'Philippines': 'Asia', 'India': 'Asia', 'Vietnam': 'Asia',
    'Pakistan': 'Asia',
    'Brazil': 'South America', 'Argentina': 'South America', 'Chile': 'South America',
    'Colombia': 'South America', 'Peru': 'South America', 'Venezuela': 'South America',
    'Ecuador': 'South America', 'Uruguay': 'South America', 'Paraguay': 'South America',
    'Cuba': 'Caribbean', 'Jamaica': 'Caribbean', 'Dominican Republic': 'Caribbean',
    'Puerto Rico': 'Caribbean', 'Trinidad and Tobago': 'Caribbean',
    'Australia': 'Oceania', 'New Zealand': 'Oceania',
    'South Africa': 'Africa', 'Nigeria': 'Africa', 'Kenya': 'Africa', 'Egypt': 'Africa',
    'Morocco': 'Africa', 'Ghana': 'Africa', 'Senegal': 'Africa',
}

GENRE_VIBE_MAP = {
    'Rock': 0.85,
    'Metal': 0.95,
    'Punk': 0.90,
    'EDM': 0.90,
    'Electronic': 0.75,
    'Hip Hop': 0.80,
    'Rap': 0.85,
    'Dance': 0.85,
    'Pop': 0.60,
    'K-pop/Asia Pop': 0.65,
    'Alternative/Indie': 0.55,
    'R&B': 0.45,
    'Soul': 0.50,
    'Folk': 0.40,
    'Country': 0.45,
    'Jazz': 0.35,
    'Blues': 0.40,
    'Classical': 0.25,
    'Ambient': 0.20,
    'Latin': 0.70,
    'World': 0.55,
    'Reggae': 0.60,
    'Unknown': 0.50,
}

def country_to_region(country: Optional[str]) -> str:
    if not country:
        return 'Unknown'
    return COUNTRY_TO_REGION.get(country, 'Unknown')

def genre_to_vibe(genre: Optional[str]) -> float:
    if not genre:
        return 0.5
    return GENRE_VIBE_MAP.get(genre, 0.5)

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
        stmt = text("""
            SELECT 
                avg(ag.original_year) as x, 
                avg(mn.y) as y, 
                count(*) as count,
                mode() WITHIN GROUP (ORDER BY ag.country_code) as country_code
            FROM album_groups ag
            JOIN map_nodes mn ON ag.album_group_id = mn.album_group_id
            WHERE ag.original_year BETWEEN :y1 AND :y2
            GROUP BY floor(ag.original_year / 5), floor(mn.y * 10)
        """)
        result = await db.execute(stmt, {"y1": yearFrom, "y2": yearTo})
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
        return APIResponse(data=points)

    stmt = (
        select(AlbumGroup, MapNode)
        .join(MapNode, AlbumGroup.album_group_id == MapNode.album_group_id)
        .where(AlbumGroup.original_year >= yearFrom, AlbumGroup.original_year <= yearTo)
        .order_by(AlbumGroup.created_at.desc())
        .limit(50000)
    )
    result = await db.execute(stmt)
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
    return APIResponse(data=points)

@app.get("/albums", response_model=APIResponse)
async def get_all_albums(
    limit: int = 50000,
    offset: int = 0,
    db: AsyncSession = Depends(get_db)
):
    """모든 앨범 조회 (페이지네이션 지원)"""
    stmt = (
        select(AlbumGroup, MapNode)
        .join(MapNode, AlbumGroup.album_group_id == MapNode.album_group_id)
        .order_by(AlbumGroup.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(stmt)
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
    return APIResponse(data=albums)

@app.get("/search", response_model=APIResponse)
async def search_albums(q: str, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(AlbumGroup, MapNode)
        .join(MapNode, AlbumGroup.album_group_id == MapNode.album_group_id)
        .where(
            (AlbumGroup.title.ilike(f"%{q}%")) |
            (AlbumGroup.primary_artist_display.ilike(f"%{q}%"))
        )
        .limit(20)
    )
    result = await db.execute(stmt)
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
    return APIResponse(data=albums)

@app.get("/albums/{album_id}", response_model=APIResponse)
async def get_album_detail(album_id: str, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(AlbumGroup, MapNode)
        .join(MapNode, AlbumGroup.album_group_id == MapNode.album_group_id)
        .where(AlbumGroup.album_group_id == album_id)
    )
    result = await db.execute(stmt)
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Album not found")
    ag, mn = row
    return APIResponse(data=AlbumResponse(
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

@app.get("/album-groups/{album_id}/detail", response_model=APIResponse)
async def get_album_group_detail(album_id: str, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(AlbumGroup, MapNode)
        .join(MapNode, AlbumGroup.album_group_id == MapNode.album_group_id)
        .where(AlbumGroup.album_group_id == album_id)
    )
    result = await db.execute(stmt)
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Album not found")
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

    releases_res = await db.execute(select(Release).where(Release.album_group_id == album_id))
    releases = [
        ReleaseResponse(
            release_id=r.release_id,
            release_title=r.release_title,
            release_date=r.release_date,
            country_code=r.country_code,
            edition=r.edition,
            cover_url=r.cover_url
        )
        for r in releases_res.scalars().all()
    ]

    tracks = []
    if releases:
        release_ids = [r.release_id for r in releases]
        tracks_res = await db.execute(select(Track).where(Track.release_id.in_(release_ids)))
        tracks = [
            TrackResponse(
                track_id=t.track_id,
                disc_no=t.disc_no,
                track_no=t.track_no,
                title=t.title,
                duration_ms=t.duration_ms,
                isrc=t.isrc
            )
            for t in tracks_res.scalars().all()
        ]

    album_credits_res = await db.execute(
        select(AlbumCredit, Creator, Role)
        .join(Creator, AlbumCredit.creator_id == Creator.creator_id)
        .join(Role, AlbumCredit.role_id == Role.role_id)
        .where(AlbumCredit.album_group_id == album_id)
    )
    album_credits = [
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
        for credit, creator, role in album_credits_res.all()
    ]

    track_credits = []
    if tracks:
        track_ids = [t.track_id for t in tracks]
        track_credits_res = await db.execute(
            select(TrackCredit, Creator, Role)
            .join(Creator, TrackCredit.creator_id == Creator.creator_id)
            .join(Role, TrackCredit.role_id == Role.role_id)
            .where(TrackCredit.track_id.in_(track_ids))
        )
        track_credits = [
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
            for credit, creator, role in track_credits_res.all()
        ]

    assets_res = await db.execute(
        select(CulturalAsset)
        .join(AssetLink, CulturalAsset.asset_id == AssetLink.asset_id)
        .where(AssetLink.entity_type == "album_group")
        .where(AssetLink.entity_id == album_id)
    )
    assets = [
        AssetResponse(
            asset_id=a.asset_id,
            asset_type=a.asset_type,
            title=a.title,
            url=a.url,
            summary=a.summary,
            published_at=a.published_at
        )
        for a in assets_res.scalars().all()
    ]

    links_res = await db.execute(select(AlbumLink).where(AlbumLink.album_group_id == album_id))
    album_links = [
        AlbumLinkResponse(
            provider=l.provider,
            url=l.url,
            external_id=l.external_id,
            is_primary=l.is_primary
        )
        for l in links_res.scalars().all()
    ]

    detail = AlbumGroupDetailResponse(
        album=album,
        releases=releases,
        tracks=tracks,
        album_credits=album_credits,
        track_credits=track_credits,
        assets=assets,
        album_links=album_links
    )
    return APIResponse(data=detail)

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
    # Deprecated endpoint: kept for backward compatibility
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
    entity_id = like.entity_id
    if like.entity_type == "artist" and ":" not in entity_id:
        entity_id = f"spotify:artist:{entity_id}"
    # 이미 있는지 확인
    stmt = select(UserLike).where(
        UserLike.user_id == current_user.id,
        UserLike.entity_type == like.entity_type,
        UserLike.entity_id == entity_id
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
        entity_id=entity_id
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
    entity_id = like.entity_id
    if like.entity_type == "artist" and ":" not in entity_id:
        entity_id = f"spotify:artist:{entity_id}"
    stmt = delete(UserLike).where(
        UserLike.user_id == current_user.id,
        UserLike.entity_type == like.entity_type,
        UserLike.entity_id == entity_id
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
