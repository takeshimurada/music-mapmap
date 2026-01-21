from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    ForeignKey,
    JSON,
    DateTime,
    Date,
    Text,
    UniqueConstraint,
    BigInteger,
    Index,
    CheckConstraint,
    Boolean,
    Enum as SAEnum,
    SmallInteger,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base
import uuid

# ========================================
# Migration Helper (temporary)
# ========================================

class CreatorIdMap(Base):
    """Migration helper: map old Spotify raw IDs to namespaced IDs."""
    __tablename__ = "creator_id_map"

    old_id = Column(String, primary_key=True)  # raw spotify artist id
    new_id = Column(String, unique=True, nullable=False)  # spotify:artist:<id>

# ========================================
# Core Entities
# ========================================

CreatorKind = SAEnum("person", "group", "label", name="creator_kind")
RoleGroup = SAEnum("artist", "writing", "production", "engineering", "performance", "visual", "other", name="role_group")
RelationType = SAEnum(
    "member_of",
    "has_member",
    "founded",
    "founded_by",
    "signed_to",
    "alias_of",
    "same_as",
    "associated_with",
    name="relation_type",
)
AssetType = SAEnum("interview", "video", "article", "podcast", "liner_note", "press_release", "other", name="asset_type")
LinkProvider = SAEnum("spotify", "musicbrainz", "discogs", "wikipedia", "wikidata", "official", "other", name="link_provider")
AssetLinkType = SAEnum("about", "mentions", "source_of_fact", name="asset_link_type")

class Creator(Base):
    __tablename__ = "creators"

    creator_id = Column(String, primary_key=True)
    display_name = Column(String, nullable=False, index=True)
    bio = Column(Text, nullable=True)
    image_url = Column(String, nullable=True)
    kind = Column(CreatorKind, nullable=False, server_default="person")
    primary_role_tag = Column(String, nullable=True)
    country_code = Column(String, nullable=True)  # 🌍 아티스트 출신 국가 (ISO 2-letter code)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    spotify_profile = relationship("CreatorSpotifyProfile", back_populates="creator", uselist=False)
    album_credits = relationship("AlbumCredit", back_populates="creator")
    track_credits = relationship("TrackCredit", back_populates="creator")

class CreatorSpotifyProfile(Base):
    __tablename__ = "creator_spotify_profile"

    creator_id = Column(String, ForeignKey("creators.creator_id"), primary_key=True)
    genres = Column(JSON, default=[])
    popularity = Column(Integer, nullable=True)
    followers = Column(BigInteger, nullable=True)
    spotify_url = Column(Text, nullable=True)
    monthly_listeners = Column(BigInteger, nullable=True)
    verified = Column(Boolean, nullable=True)
    top_tracks = Column(JSON, nullable=True)
    last_synced = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    creator = relationship("Creator", back_populates="spotify_profile")

class AlbumGroup(Base):
    __tablename__ = "album_groups"

    album_group_id = Column(String, primary_key=True)
    title = Column(String, nullable=False, index=True)
    primary_artist_display = Column(String, nullable=False, index=True)
    original_year = Column(Integer, index=True)
    country_code = Column(String, nullable=True)
    primary_genre = Column(String, nullable=True)
    popularity = Column(Float, default=0.0)
    cover_url = Column(String, nullable=True)
    is_anchor = Column(Boolean, nullable=False, server_default="false")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    releases = relationship("Release", back_populates="album_group")
    album_credits = relationship("AlbumCredit", back_populates="album_group")
    album_links = relationship("AlbumLink", back_populates="album_group")
    map_node = relationship("MapNode", back_populates="album_group", uselist=False)

class Label(Base):
    __tablename__ = "labels"

    label_id = Column(String, primary_key=True)
    creator_id = Column(String, ForeignKey("creators.creator_id"), unique=True, nullable=False)
    legal_name = Column(String, nullable=True)
    founded_year = Column(Integer, nullable=True)
    country_code = Column(String, nullable=True)
    website_url = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class Release(Base):
    __tablename__ = "releases"

    release_id = Column(String, primary_key=True)
    album_group_id = Column(String, ForeignKey("album_groups.album_group_id"), nullable=False)
    label_id = Column(String, ForeignKey("labels.label_id"), nullable=True)
    release_title = Column(String, nullable=True)
    release_date = Column(Date, nullable=True)
    country_code = Column(String, nullable=True)
    edition = Column(String, nullable=True)
    cover_url = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    album_group = relationship("AlbumGroup", back_populates="releases")
    tracks = relationship("Track", back_populates="release")

class Track(Base):
    __tablename__ = "tracks"

    track_id = Column(String, primary_key=True)
    release_id = Column(String, ForeignKey("releases.release_id"), nullable=False)
    disc_no = Column(Integer, nullable=False, server_default="1")
    track_no = Column(Integer, nullable=False)
    title = Column(Text, nullable=False)
    duration_ms = Column(Integer, nullable=True)
    isrc = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    release = relationship("Release", back_populates="tracks")
    track_credits = relationship("TrackCredit", back_populates="track")

class Role(Base):
    __tablename__ = "roles"

    role_id = Column(String, primary_key=True)
    role_name = Column(String, unique=True, nullable=False)
    role_group = Column(RoleGroup, nullable=False)
    importance_rank = Column(Integer, nullable=False, server_default="100")

class AlbumCredit(Base):
    __tablename__ = "album_credits"

    album_group_id = Column(String, ForeignKey("album_groups.album_group_id"), primary_key=True)
    creator_id = Column(String, ForeignKey("creators.creator_id"), primary_key=True)
    role_id = Column(String, ForeignKey("roles.role_id"), primary_key=True)
    credit_detail = Column(Text, nullable=True)
    credit_order = Column(SmallInteger, nullable=True)
    source_confidence = Column(SmallInteger, nullable=False, server_default="50")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    album_group = relationship("AlbumGroup", back_populates="album_credits")
    creator = relationship("Creator", back_populates="album_credits")
    role = relationship("Role")

class TrackCredit(Base):
    __tablename__ = "track_credits"

    track_id = Column(String, ForeignKey("tracks.track_id"), primary_key=True)
    creator_id = Column(String, ForeignKey("creators.creator_id"), primary_key=True)
    role_id = Column(String, ForeignKey("roles.role_id"), primary_key=True)
    credit_detail = Column(Text, nullable=True)
    credit_order = Column(SmallInteger, nullable=True)
    source_confidence = Column(SmallInteger, nullable=False, server_default="50")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    track = relationship("Track", back_populates="track_credits")
    creator = relationship("Creator", back_populates="track_credits")
    role = relationship("Role")

class CreatorRelation(Base):
    __tablename__ = "creator_relations"

    source_creator_id = Column(String, ForeignKey("creators.creator_id"), primary_key=True)
    target_creator_id = Column(String, ForeignKey("creators.creator_id"), primary_key=True)
    relation_type = Column(RelationType, primary_key=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    confidence = Column(SmallInteger, nullable=False, server_default="50")
    source_asset_id = Column(String, ForeignKey("cultural_assets.asset_id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class CulturalAsset(Base):
    __tablename__ = "cultural_assets"

    asset_id = Column(String, primary_key=True)
    asset_type = Column(AssetType, nullable=False)
    title = Column(Text, nullable=False)
    publisher = Column(String, nullable=True)
    url = Column(Text, unique=True, nullable=False)
    thumbnail_url = Column(Text, nullable=True)
    published_at = Column(DateTime(timezone=True), nullable=True)
    language = Column(String, nullable=True)
    summary = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class AssetLink(Base):
    __tablename__ = "asset_links"

    asset_id = Column(String, ForeignKey("cultural_assets.asset_id"), primary_key=True)
    entity_type = Column(String, primary_key=True)
    entity_id = Column(Text, primary_key=True)
    link_type = Column(AssetLinkType, primary_key=True)
    relevance_score = Column(SmallInteger, nullable=False, server_default="50")

class AlbumLink(Base):
    __tablename__ = "album_links"

    album_group_id = Column(String, ForeignKey("album_groups.album_group_id"), primary_key=True)
    provider = Column(LinkProvider, primary_key=True)
    url = Column(Text, primary_key=True)
    external_id = Column(Text, nullable=True)
    is_primary = Column(Boolean, nullable=False, server_default="false")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    album_group = relationship("AlbumGroup", back_populates="album_links")

class CreatorLink(Base):
    __tablename__ = "creator_links"

    creator_id = Column(String, ForeignKey("creators.creator_id"), primary_key=True)
    provider = Column(LinkProvider, primary_key=True)
    url = Column(Text, primary_key=True)
    external_id = Column(Text, nullable=True)
    is_primary = Column(Boolean, nullable=False, server_default="false")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class MapNode(Base):
    __tablename__ = "map_nodes"

    album_group_id = Column(String, ForeignKey("album_groups.album_group_id"), primary_key=True)
    x = Column(Float, nullable=False)
    y = Column(Float, nullable=False)
    size = Column(Float, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    album_group = relationship("AlbumGroup", back_populates="map_node")

class AlbumDetailsCache(Base):
    __tablename__ = "album_details_cache"

    album_group_id = Column(String, ForeignKey("album_groups.album_group_id"), primary_key=True)
    cached_json = Column(JSON, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

# ========================================
# User Actions (replacing user_ratings)
# ========================================

AlbumActionStatus = SAEnum("liked", "disliked", "want", "listened", name="album_action_status")
CreatorActionStatus = SAEnum("liked", "disliked", "followed", name="creator_action_status")

class User(Base):
    __tablename__ = "users"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True)
    google_sub = Column(String, unique=True, index=True)
    email = Column(String, unique=True)
    name = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class UserAlbumAction(Base):
    __tablename__ = "user_album_actions"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    album_group_id = Column(String, ForeignKey("album_groups.album_group_id"), primary_key=True)
    status = Column(AlbumActionStatus, nullable=False)
    rating = Column(SmallInteger, nullable=True)
    acted_at = Column(DateTime(timezone=True), server_default=func.now())

class UserCreatorAction(Base):
    __tablename__ = "user_creator_actions"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    creator_id = Column(String, ForeignKey("creators.creator_id"), primary_key=True)
    status = Column(CreatorActionStatus, nullable=False)
    rating = Column(SmallInteger, nullable=True)
    acted_at = Column(DateTime(timezone=True), server_default=func.now())

class AlbumReview(Base):
    __tablename__ = "album_reviews"

    id = Column(Integer, primary_key=True, index=True)
    album_id = Column(String, ForeignKey("album_groups.album_group_id"))
    source_name = Column(String)
    url = Column(String)
    snippet = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class AiResearch(Base):
    __tablename__ = "ai_research"

    id = Column(Integer, primary_key=True, index=True)
    album_id = Column(String, ForeignKey("album_groups.album_group_id"))
    lang = Column(String) # 'en' or 'ko'
    summary_md = Column(Text)
    sources = Column(JSON)
    confidence = Column(Float)
    cache_key = Column(String, unique=True, index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())

# ========================================
# Step 1: 개발용 유저 Like & 이벤트 로그 시스템
# ========================================

class DevUser(Base):
    """개발용 유저 테이블 (Step 1 MVP)"""
    __tablename__ = "dev_users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    likes = relationship("UserLike", back_populates="user")
    events = relationship("UserEvent", back_populates="user")

class UserLike(Base):
    """유저 좋아요 테이블"""
    __tablename__ = "user_likes"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("dev_users.id"), nullable=False)
    entity_type = Column(String, nullable=False)
    entity_id = Column(String, nullable=False)
    liked_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("DevUser", back_populates="likes")

    __table_args__ = (
        UniqueConstraint('user_id', 'entity_type', 'entity_id', name='_user_entity_like_uc'),
        Index('idx_user_entity_type', 'user_id', 'entity_type'),
        CheckConstraint("entity_type IN ('album', 'artist')", name='check_entity_type'),
    )

class UserEvent(Base):
    """유저 이벤트 로그 테이블"""
    __tablename__ = "user_events"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("dev_users.id"), nullable=False)
    event_type = Column(String, nullable=False)
    entity_type = Column(String, nullable=True)
    entity_id = Column(String, nullable=True)
    payload = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("DevUser", back_populates="events")

    __table_args__ = (
        Index('idx_user_created_at', 'user_id', 'created_at'),
        Index('idx_event_type', 'event_type'),
    )

