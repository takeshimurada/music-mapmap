from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from typing import List, Optional

from .database import engine, Base, get_db
from .models import Album, AlbumDetail, UserRating
from .schemas import AlbumResponse, MapPoint, ResearchRequest, APIResponse, RatingCreate
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
