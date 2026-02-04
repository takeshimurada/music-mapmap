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
    release_date: Optional[date] = None  # ???由대━?ㅼ쓽 諛쒕ℓ??
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
# New Detail Schemas (Target Schema)
# ========================================

class RoleResponse(BaseModel):
    role_id: str
    role_name: str
    role_group: str

class CreatorResponse(BaseModel):
    creator_id: str
    display_name: str
    image_url: Optional[str] = None

class AlbumCreditResponse(BaseModel):
    creator: CreatorResponse
    role: RoleResponse
    credit_detail: Optional[str] = None
    credit_order: Optional[int] = None

class TrackCreditResponse(BaseModel):
    creator: CreatorResponse
    role: RoleResponse
    credit_detail: Optional[str] = None
    credit_order: Optional[int] = None

class ReleaseResponse(BaseModel):
    release_id: str
    release_title: Optional[str] = None
    release_date: Optional[date] = None
    country_code: Optional[str] = None
    edition: Optional[str] = None
    cover_url: Optional[str] = None

class TrackResponse(BaseModel):
    track_id: str
    disc_no: int
    track_no: int
    title: str
    duration_ms: Optional[int] = None
    isrc: Optional[str] = None

class AssetResponse(BaseModel):
    asset_id: str
    asset_type: str
    title: str
    url: str
    summary: Optional[str] = None
    published_at: Optional[datetime] = None

class AlbumLinkResponse(BaseModel):
    provider: str
    url: str
    external_id: Optional[str] = None
    is_primary: bool

class AlbumAwardResponse(BaseModel):
    award_name: str
    award_kind: str
    award_year: Optional[int] = None
    award_result: Optional[str] = None
    award_category: Optional[str] = None
    source_url: Optional[str] = None
    sources: Optional[List[str]] = None
    region: Optional[str] = None
    country: Optional[str] = None
    genre_tags: Optional[List[str]] = None

class AlbumGroupDetailResponse(BaseModel):
    album: AlbumResponse
    releases: List[ReleaseResponse]
    tracks: List[TrackResponse]
    album_credits: List[AlbumCreditResponse]
    track_credits: List[TrackCreditResponse]
    assets: List[AssetResponse]
    album_links: List[AlbumLinkResponse]
    album_awards: List[AlbumAwardResponse]

# ========================================
# Artist Profile Schemas
# ========================================

class ArtistLinkResponse(BaseModel):
    provider: str
    url: str
    external_id: Optional[str] = None
    is_primary: bool

class ArtistAlbumResponse(BaseModel):
    id: str
    title: str
    year: Optional[int] = None
    cover_url: Optional[str] = None

class ArtistRelationResponse(BaseModel):
    relation_type: str
    creator_id: str
    display_name: str

class ArtistProfileResponse(BaseModel):
    creator_id: Optional[str] = None
    display_name: str
    bio: Optional[str] = None
    image_url: Optional[str] = None
    genres: List[str] = []
    spotify_url: Optional[str] = None
    links: List[ArtistLinkResponse] = []
    discography: List[ArtistAlbumResponse] = []
    relations: List[ArtistRelationResponse] = []

# ========================================
# Step 1: 媛쒕컻???좎? Like & ?대깽??濡쒓렇 ?ㅽ궎留?
# ========================================

class DevUserCreateResponse(BaseModel):
    user_id: UUID

class LikeRequest(BaseModel):
    entity_type: Literal["album", "artist"]
    entity_id: str

class LikeResponse(BaseModel):
    status: Literal["liked", "unliked"]

class LikeItem(BaseModel):
    entity_type: str
    entity_id: str
    liked_at: datetime

class LikesListResponse(BaseModel):
    items: List[LikeItem]

class EventRequest(BaseModel):
    event_type: Literal["view_album", "view_artist", "search", "open_on_platform", "recommendation_click", "playlist_create"]
    entity_type: Optional[Literal["album", "artist"]] = None
    entity_id: Optional[str] = None
    payload: Optional[dict] = None

class EventResponse(BaseModel):
    status: str
    event_id: int

