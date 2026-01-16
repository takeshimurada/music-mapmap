from sqlalchemy import Column, Integer, String, Float, ForeignKey, JSON, DateTime, Date, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base

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
