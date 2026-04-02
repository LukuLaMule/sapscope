"""
/api/v1/admin  — client, token and user management.
All endpoints require an authenticated admin user (is_admin=True).
"""

import secrets

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user, hash_password
from ..database import get_db
from ..models import AgentToken, Client, User, UserClient
from ..schemas import AdminToggle, ClientOut, PasswordReset, TokenCreated, TokenOut, UserCreate, UserOut
from ..settings import settings

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


def _require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return user


# ── Clients ───────────────────────────────────────────────────────────────────

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


@router.delete("/clients/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client(
    client_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_admin),
):
    row = await db.execute(select(Client).where(Client.id == client_id))
    client = row.scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=404, detail="Client not found")
    await db.delete(client)
    await db.commit()


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


@router.get("/clients/{client_id}/tokens", response_model=list[TokenOut])
async def list_tokens(
    client_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_admin),
):
    row = await db.execute(select(Client).where(Client.id == client_id))
    if not row.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Client not found")

    rows = await db.execute(
        select(AgentToken)
        .where(AgentToken.client_id == client_id)
        .order_by(AgentToken.created_at.desc())
    )
    return [
        TokenOut(id=t.id, label=t.label, is_revoked=t.is_revoked, created_at=t.created_at)
        for t in rows.scalars()
    ]


@router.delete("/clients/{client_id}/tokens/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_token(
    client_id: str,
    token_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_admin),
):
    row = await db.execute(
        select(AgentToken).where(
            AgentToken.id == token_id,
            AgentToken.client_id == client_id,
        )
    )
    token = row.scalar_one_or_none()
    if token is None:
        raise HTTPException(status_code=404, detail="Token not found")
    token.is_revoked = True
    await db.commit()


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=list[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_admin),
    limit: int = Query(default=200, ge=1, le=500),
):
    rows = await db.execute(
        select(User)
        .options(selectinload(User.client_links))
        .order_by(User.email)
        .limit(limit)
    )
    return [
        UserOut(
            id=u.id,
            email=u.email,
            is_admin=u.is_admin,
            created_at=u.created_at,
            client_ids=[link.client_id for link in u.client_links],
        )
        for u in rows.scalars()
    ]


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_admin),
):
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already in use")

    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        is_admin=body.is_admin,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserOut(id=user.id, email=user.email, is_admin=user.is_admin, created_at=user.created_at)


@router.patch("/users/{user_id}/password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_user_password(
    user_id: str,
    body: PasswordReset,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(_require_admin),
):
    row = await db.execute(select(User).where(User.id == user_id))
    user = row.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Use your profile to change your own password")
    user.password_hash = hash_password(body.password)
    await db.commit()


@router.patch("/users/{user_id}/admin", status_code=status.HTTP_204_NO_CONTENT)
async def set_admin(
    user_id: str,
    body: AdminToggle,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(_require_admin),
):
    row = await db.execute(select(User).where(User.id == user_id))
    user = row.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot change your own admin status")
    if not body.is_admin:
        count = await db.execute(
            select(func.count()).select_from(User).where(User.is_admin == True, User.id != user_id)
        )
        if count.scalar() == 0:
            raise HTTPException(status_code=400, detail="Cannot demote the last admin")
    user.is_admin = body.is_admin
    await db.commit()


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(_require_admin),
):
    row = await db.execute(select(User).where(User.id == user_id))
    user = row.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    if user.is_admin:
        count = await db.execute(
            select(func.count()).select_from(User).where(User.is_admin == True, User.id != user_id)
        )
        if count.scalar() == 0:
            raise HTTPException(status_code=400, detail="Cannot delete the last admin")
    await db.delete(user)
    await db.commit()


@router.post(
    "/users/{user_id}/clients/{client_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def assign_client(
    user_id: str,
    client_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_admin),
):
    user_row = await db.execute(select(User).where(User.id == user_id))
    if not user_row.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")
    client_row = await db.execute(select(Client).where(Client.id == client_id))
    if not client_row.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Client not found")

    existing = await db.execute(
        select(UserClient).where(UserClient.user_id == user_id, UserClient.client_id == client_id)
    )
    if not existing.scalar_one_or_none():
        db.add(UserClient(user_id=user_id, client_id=client_id))
        await db.commit()


@router.delete(
    "/users/{user_id}/clients/{client_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def unassign_client(
    user_id: str,
    client_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_admin),
):
    row = await db.execute(
        select(UserClient).where(UserClient.user_id == user_id, UserClient.client_id == client_id)
    )
    link = row.scalar_one_or_none()
    if link:
        await db.delete(link)
        await db.commit()
