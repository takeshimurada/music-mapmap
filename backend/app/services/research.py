from sqlalchemy.ext.asyncio import AsyncSession

from ..service_gemini import get_ai_research


async def create_research(db: AsyncSession, album_id: str, lang: str):
    return await get_ai_research(db, album_id, lang)
