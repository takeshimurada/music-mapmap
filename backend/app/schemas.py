from pydantic import BaseModel
from typing import List, Optional, Any, Literal
from datetime import datetime, date
from uuid import UUID

class AlbumBase(BaseModel):
    id: str
    title: str
    artist_name: str
    year: int
    genre: str
    genre_vibe: float
    region_bucket: str
    country: Optional[str] = None
    cover_url: Optional[str] = None

class AlbumResponse(AlbumBase):
    popularity: float
    created_at: datetime
    
    class Config:
        from_attributes = True

class MapPoint(BaseModel):
    # Minimized for map view
    id: Optional[str] = None
    x: float # year
    y: float # vibe
    r: float = 1.0 # radius/popularity/count
    color: Optional[str] = None # region hex or bucket
    is_cluster: bool = False
    count: int = 1
    label: Optional[str] = None

class ResearchRequest(BaseModel):
    album_id: str
    lang: str = 'en'

class ResearchResponse(BaseModel):
    summary_md: str
    sources: List[Any]
    confidence: float

class RatingCreate(BaseModel):
    album_id: str
    rating: int
    note: Optional[str] = None
    listened_at: Optional[date] = None

class UserResponse(BaseModel):
    id: int
    email: str
    name: str

class APIResponse(BaseModel):
    data: Any
    meta: Optional[dict] = None

# ========================================
# Step 1: 개발용 유저 Like & 이벤트 로그 스키마
# ========================================

class DevUserCreateResponse(BaseModel):
    user_id: UUID

class LikeRequest(BaseModel):
    entity_type: Literal["album", "artist"]
    entity_id: UUID

class LikeResponse(BaseModel):
    status: Literal["liked", "unliked"]

class LikeItem(BaseModel):
    entity_type: str
    entity_id: UUID
    liked_at: datetime

class LikesListResponse(BaseModel):
    items: List[LikeItem]

class EventRequest(BaseModel):
    event_type: Literal["view_album", "view_artist", "search", "open_on_platform", "recommendation_click", "playlist_create"]
    entity_type: Optional[Literal["album", "artist"]] = None
    entity_id: Optional[UUID] = None
    payload: Optional[dict] = None

class EventResponse(BaseModel):
    status: str
    event_id: int
