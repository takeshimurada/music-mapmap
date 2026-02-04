from sqlalchemy.ext.asyncio import AsyncSession

from ..repositories import users as user_repo


async def create_event(db: AsyncSession, user_id, event_type: str, entity_type: str | None, entity_id: str | None, payload):
    return await user_repo.create_event(db, user_id, event_type, entity_type, entity_id, payload)
