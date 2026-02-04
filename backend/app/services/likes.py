from sqlalchemy.ext.asyncio import AsyncSession

from ..repositories import users as user_repo


async def create_like(db: AsyncSession, user_id, entity_type: str, entity_id: str):
    if entity_type == "artist" and ":" not in entity_id:
        entity_id = f"spotify:artist:{entity_id}"

    existing = await user_repo.get_user_like(db, user_id, entity_type, entity_id)
    if existing:
        return "liked"

    await user_repo.create_like(db, user_id, entity_type, entity_id)
    return "liked"


async def delete_like(db: AsyncSession, user_id, entity_type: str, entity_id: str):
    if entity_type == "artist" and ":" not in entity_id:
        entity_id = f"spotify:artist:{entity_id}"
    await user_repo.delete_like(db, user_id, entity_type, entity_id)
    return "unliked"


async def list_likes(db: AsyncSession, user_id, entity_type: str | None):
    return await user_repo.list_likes(db, user_id, entity_type)
