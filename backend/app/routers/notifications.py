"""
GET  /api/v1/notifications                    — liste des notifs accessibles
PATCH /api/v1/notifications/{id}/read         — marquer une notif lue
POST /api/v1/notifications/read-all           — marquer toutes comme lues
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_db
from ..models import Client, Notification, User, UserClient

router = APIRouter(tags=["notifications"])


class NotificationOut(BaseModel):
    id: str
    client_id: str
    client_name: str
    system_sid: str
    severity: str
    message: str
    created_at: datetime
    read_at: datetime | None = None


async def _accessible_client_ids(user: User, db: AsyncSession) -> list[str]:
    if user.is_admin:
        rows = await db.execute(select(Client.id))
        return list(rows.scalars())
    rows = await db.execute(
        select(UserClient.client_id).where(UserClient.user_id == user.id)
    )
    return list(rows.scalars())


@router.get("/api/v1/notifications", response_model=list[NotificationOut])
async def list_notifications(
    unread_only: bool = True,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    client_ids = await _accessible_client_ids(user, db)
    if not client_ids:
        return []

    q = (
        select(Notification, Client.name)
        .join(Client, Client.id == Notification.client_id)
        .where(Notification.client_id.in_(client_ids))
    )
    if unread_only:
        q = q.where(Notification.read_at.is_(None))
    q = q.order_by(Notification.created_at.desc()).limit(50)

    rows = await db.execute(q)
    result = []
    for notif, client_name in rows:
        result.append(NotificationOut(
            id=notif.id,
            client_id=notif.client_id,
            client_name=client_name,
            system_sid=notif.system_sid,
            severity=notif.severity,
            message=notif.message,
            created_at=notif.created_at,
            read_at=notif.read_at,
        ))
    return result


@router.patch("/api/v1/notifications/{notif_id}/read")
async def mark_notification_read(
    notif_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    client_ids = await _accessible_client_ids(user, db)
    row = await db.execute(
        select(Notification).where(
            Notification.id == notif_id,
            Notification.client_id.in_(client_ids),
        )
    )
    notif = row.scalar_one_or_none()
    if notif is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.read_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


@router.post("/api/v1/notifications/read-all")
async def mark_all_notifications_read(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    client_ids = await _accessible_client_ids(user, db)
    if client_ids:
        await db.execute(
            update(Notification)
            .where(
                Notification.client_id.in_(client_ids),
                Notification.read_at.is_(None),
            )
            .values(read_at=datetime.now(timezone.utc))
        )
        await db.commit()
    return {"ok": True}
