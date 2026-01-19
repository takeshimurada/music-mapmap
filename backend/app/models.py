from sqlalchemy import Column, Integer, String, Float, ForeignKey, JSON, DateTime, Date, Text, UniqueConstraint, BigInteger, Index, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base
import uuid

class Album(Base):
    __tablename__ = "albums"

    id = Column(String, primary_key=True)
    title = Column(String, index=True)
    artist_name = Column(String, index=True)
    year = Column(Integer, index=True)
    genre = Column(String)
    genre_vibe = Column(Float, index=True) # 0.0 to 1.0
    region_bucket = Column(String, index=True) # 'North America', etc.
    country = Column(String, nullable=True)
    popularity = Column(Float, default=0.0)
    cover_url = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    details = relationship("AlbumDetail", back_populates="album", uselist=False)
    ratings = relationship("UserRating", back_populates="album")

class AlbumDetail(Base):
    __tablename__ = "album_details"

    album_id = Column(String, ForeignKey("albums.id"), primary_key=True)
    tracklist = Column(JSON, default=[])
    credits = Column(JSON, default=[])
    external_links = Column(JSON, default=[])
    
    album = relationship("Album", back_populates="details")

class AlbumReview(Base):
    __tablename__ = "album_reviews"

    id = Column(Integer, primary_key=True, index=True)
    album_id = Column(String, ForeignKey("albums.id"))
    source_name = Column(String)
    url = Column(String)
    snippet = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class AiResearch(Base):
    __tablename__ = "ai_research"

    id = Column(Integer, primary_key=True, index=True)
    album_id = Column(String, ForeignKey("albums.id"))
    lang = Column(String) # 'en' or 'ko'
    summary_md = Column(Text)
    sources = Column(JSON)
    confidence = Column(Float)
    cache_key = Column(String, unique=True, index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    google_sub = Column(String, unique=True, index=True)
    email = Column(String, unique=True)
    name = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    ratings = relationship("UserRating", back_populates="user")

class UserRating(Base):
    __tablename__ = "user_ratings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    album_id = Column(String, ForeignKey("albums.id"))
    rating = Column(Integer) # 1-5
    note = Column(Text, nullable=True)
    listened_at = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="ratings")
    album = relationship("Album", back_populates="ratings")

    __table_args__ = (UniqueConstraint('user_id', 'album_id', name='_user_album_uc'),)

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
    entity_id = Column(UUID(as_uuid=True), nullable=False)
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
    entity_id = Column(UUID(as_uuid=True), nullable=True)
    payload = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("DevUser", back_populates="events")

    __table_args__ = (
        Index('idx_user_created_at', 'user_id', 'created_at'),
        Index('idx_event_type', 'event_type'),
    )
