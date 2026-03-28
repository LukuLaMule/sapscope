"""
/api/v1/admin  — client and token management.
All endpoints require an authenticated admin user (is_admin=True).
"""

import secrets

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_db
from ..models import AgentToken, Client, User
from ..schemas import ClientOut, TokenCreated
from ..settings import settings

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


def _require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return user


@router.post("/clients", response_model=ClientOut, status_code=status.HTTP_201_CREATED)
async def create_client(
    name: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_admin),
):
    client = Client(name=name)
    db.add(client)
    await db.commit()
    await db.refresh(client)
    return ClientOut(id=client.id, name=client.name, created_at=client.created_at)


@router.get("/clients", response_model=list[ClientOut])
async def list_clients(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_admin),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    rows = await db.execute(
        select(Client).order_by(Client.name).limit(limit).offset(offset)
    )
    return [ClientOut(id=c.id, name=c.name, created_at=c.created_at) for c in rows.scalars()]


@router.post("/clients/{client_id}/tokens", response_model=TokenCreated, status_code=status.HTTP_201_CREATED)
async def issue_token(
    client_id: str,
    label: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_admin),
):
    row = await db.execute(select(Client).where(Client.id == client_id))
    client = row.scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=404, detail="Client not found")

    plaintext = secrets.token_urlsafe(settings.token_min_length)
    token = AgentToken(
        client_id=client.id,
        label=label,
        token_hash=AgentToken.hash(plaintext),
    )
    db.add(token)
    await db.commit()
    await db.refresh(token)

    return TokenCreated(id=token.id, label=token.label, token=plaintext, created_at=token.created_at)
