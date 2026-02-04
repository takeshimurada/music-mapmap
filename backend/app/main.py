from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine, Base
from .routers import health, albums, artists, users, research

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

app.include_router(health.router)
app.include_router(albums.router)
app.include_router(artists.router)
app.include_router(users.router)
app.include_router(research.router)
