"""
/api/v1/admin  — client, token and user management.
All endpoints require an authenticated admin user (is_admin=True).
"""

import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user, hash_password
from ..database import get_db
from ..models import AgentHeartbeat, AgentToken, Client, Snapshot, SystemDecommission, User, UserClient
from ..schemas import AdminToggle, ClientOut, LogoUpdateRequest, PasswordReset, TokenCreated, TokenOut, UserCreate, UserOut
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
    return ClientOut(id=client.id, name=client.name, logo_b64=client.logo_b64, created_at=client.created_at)


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
    return [ClientOut(id=c.id, name=c.name, logo_b64=c.logo_b64, created_at=c.created_at) for c in rows.scalars()]


@router.patch("/clients/{client_id}/logo", status_code=status.HTTP_204_NO_CONTENT)
async def update_client_logo(
    client_id: str,
    body: LogoUpdateRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_admin),
):
    row = await db.execute(select(Client).where(Client.id == client_id))
    client = row.scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=404, detail="Client not found")
    # Limit logo size: base64 string max ~680KB (≈ 500KB image)
    if body.logo_b64 is not None and len(body.logo_b64) > 680_000:
        raise HTTPException(status_code=413, detail="Logo too large (max 500 KB)")
    client.logo_b64 = body.logo_b64
    await db.commit()


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


# ── Agent health & décommission ──────────────────────────────────────────────

@router.get("/agent-health")
async def agent_health(
    _: User = Depends(_require_admin),
    db: AsyncSession = Depends(get_db),
):
    heartbeats = (await db.execute(select(AgentHeartbeat))).scalars().all()
    now = datetime.now(timezone.utc)
    result = []
    for hb in heartbeats:
        interval = timedelta(minutes=hb.collection_interval_minutes)
        age = now - hb.last_seen_at
        if age <= interval * 2:
            hb_status = "ok"
        elif age <= interval * 4:
            hb_status = "warning"
        else:
            hb_status = "down"
        result.append({
            "client_id": hb.client_id,
            "last_seen_at": hb.last_seen_at.isoformat(),
            "agent_version": hb.agent_version,
            "monitored_sids": hb.monitored_sids,
            "collection_interval_minutes": hb.collection_interval_minutes,
            "status": hb_status,
            "age_minutes": int(age.total_seconds() / 60),
        })
    return result


@router.get("/decommission-candidates")
async def decommission_candidates(
    _: User = Depends(_require_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(SystemDecommission)
        .where(SystemDecommission.status == "candidate")
        .order_by(SystemDecommission.detected_at.desc())
    )).scalars().all()
    return [
        {
            "id": r.id,
            "client_id": r.client_id,
            "system_sid": r.system_sid,
            "reason": r.reason,
            "detected_at": r.detected_at.isoformat(),
        }
        for r in rows
    ]


@router.post("/systems/{client_id}/{sid}/decommission", status_code=status.HTTP_204_NO_CONTENT)
async def confirm_decommission(
    client_id: str,
    sid: str,
    _: User = Depends(_require_admin),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(SystemDecommission)
        .where(SystemDecommission.client_id == client_id, SystemDecommission.system_sid == sid)
        .values(status="confirmed", confirmed_at=datetime.now(timezone.utc))
    )
    await db.execute(
        delete(Snapshot).where(Snapshot.client_id == client_id, Snapshot.system_sid == sid)
    )
    await db.commit()


@router.post("/systems/{client_id}/{sid}/restore", status_code=status.HTTP_204_NO_CONTENT)
async def restore_system(
    client_id: str,
    sid: str,
    _: User = Depends(_require_admin),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(SystemDecommission)
        .where(SystemDecommission.client_id == client_id, SystemDecommission.system_sid == sid)
        .values(status="restored", restored_at=datetime.now(timezone.utc))
    )
    await db.commit()
