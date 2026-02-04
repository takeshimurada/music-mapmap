from fastapi import Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from .database import get_db
from .models import DevUser
from sqlalchemy import select


async def get_current_user(
    x_user_id: str = Header(..., alias="X-User-Id"),
    db: AsyncSession = Depends(get_db)
) -> DevUser:
    """개발용 인증: X-User-Id 헤더로 유저 확인"""
    try:
        user_uuid = UUID(x_user_id)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=401, detail="Invalid X-User-Id format")

    stmt = select(DevUser).where(DevUser.id == user_uuid)
    result = await db.execute(stmt)
    user = result.scalars().first()

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user
