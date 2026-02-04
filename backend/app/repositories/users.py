from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import DevUser, UserLike, UserEvent


async def create_dev_user(db: AsyncSession) -> DevUser:
    new_user = DevUser()
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user


async def get_user_like(db: AsyncSession, user_id, entity_type: str, entity_id: str):
    stmt = select(UserLike).where(
        UserLike.user_id == user_id,
        UserLike.entity_type == entity_type,
        UserLike.entity_id == entity_id
    )
    result = await db.execute(stmt)
    return result.scalars().first()


async def create_like(db: AsyncSession, user_id, entity_type: str, entity_id: str):
    new_like = UserLike(
        user_id=user_id,
        entity_type=entity_type,
        entity_id=entity_id
    )
    db.add(new_like)
    await db.commit()
    return new_like


async def delete_like(db: AsyncSession, user_id, entity_type: str, entity_id: str):
    stmt = delete(UserLike).where(
        UserLike.user_id == user_id,
        UserLike.entity_type == entity_type,
        UserLike.entity_id == entity_id
    )
    await db.execute(stmt)
    await db.commit()


async def list_likes(db: AsyncSession, user_id, entity_type: str | None):
    stmt = select(UserLike).where(UserLike.user_id == user_id)
    if entity_type:
        stmt = stmt.where(UserLike.entity_type == entity_type)
    stmt = stmt.order_by(UserLike.liked_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


async def create_event(db: AsyncSession, user_id, event_type: str, entity_type: str | None, entity_id: str | None, payload):
    new_event = UserEvent(
        user_id=user_id,
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        payload=payload
    )
    db.add(new_event)
    await db.commit()
    await db.refresh(new_event)
    return new_event
