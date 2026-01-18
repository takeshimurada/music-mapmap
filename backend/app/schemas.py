from pydantic import BaseModel
from typing import List, Optional, Any
from datetime import datetime, date

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
