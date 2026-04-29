"""
Serveur de licences SAPscope — endpoints pour la validation et l'activation
des licences des instances self-hosted, ainsi que la gestion admin des licences.

Ce router est inclus dans main.py uniquement si IS_LICENSE_SERVER=true.
"""

import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_db
from ..models import License, User

router = APIRouter(tags=["license-server"])


# ── Helpers ───────────────────────────────────────────────────────────────────

_MAX_USERS_BY_PLAN: dict[str, int] = {
    "trial":      2,
    "solo":       1,
    "team":       5,
    "enterprise": 999,
}


def _require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return user


def _license_response(
    license: License | None,
    reason: str | None = None,
) -> dict:
    """Construit la réponse standard de validation/activation."""
    if license is None or reason:
        return {
            "valid": False,
            "plan": None,
            "expires_at": None,
            "max_users": 0,
            "reason": reason or "invalid_key",
        }
    return {
        "valid": True,
        "plan": license.plan,
        "expires_at": license.expires_at.isoformat(),
        "max_users": _MAX_USERS_BY_PLAN.get(license.plan, 1),
        "reason": None,
    }


# ── Schemas ───────────────────────────────────────────────────────────────────

class LicenseValidateRequest(BaseModel):
    key: str = Field(..., description="UUID de la licence")
    instance_id: str = Field(..., description="UUID de l'instance self-hosted")


class LicenseActivateRequest(BaseModel):
    key: str = Field(..., description="UUID de la licence")
    instance_id: str = Field(..., description="UUID de l'instance self-hosted")


class LicenseCreateRequest(BaseModel):
    email: str | None = Field(None, description="Email du client")
    plan: Literal["trial", "solo", "team", "enterprise"] = Field(..., description="Plan de la licence")
    expires_at: datetime = Field(..., description="Date d'expiration (ISO 8601)")
    note: str | None = Field(None, description="Note interne optionnelle")


# ── Public endpoints ───────────────────────────────────────────────────────────

@router.post("/api/license/validate")
async def validate_license(
    body: LicenseValidateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Valide une licence sans l'activer. Appelé par les instances self-hosted."""
    row = await db.execute(select(License).where(License.key == body.key))
    lic = row.scalar_one_or_none()

    if lic is None:
        return _license_response(None, reason="invalid_key")

    if not lic.active:
        return _license_response(None, reason="inactive")

    now = datetime.now(timezone.utc)
    if lic.expires_at.replace(tzinfo=timezone.utc) < now:
        return _license_response(None, reason="expired")

    return _license_response(lic)


@router.post("/api/license/activate")
async def activate_license(
    body: LicenseActivateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Active une licence pour une instance donnée. Appelé une seule fois par instance."""
    row = await db.execute(select(License).where(License.key == body.key))
    lic = row.scalar_one_or_none()

    if lic is None:
        return _license_response(None, reason="invalid_key")

    if not lic.active:
        return _license_response(None, reason="inactive")

    now = datetime.now(timezone.utc)
    if lic.expires_at.replace(tzinfo=timezone.utc) < now:
        return _license_response(None, reason="expired")

    # Déjà activée sur une autre instance
    if lic.instance_id and lic.instance_id != body.instance_id:
        return _license_response(None, reason="already_activated")

    # Première activation
    if not lic.instance_id:
        lic.instance_id = body.instance_id
        lic.activated_at = now
        await db.commit()
        await db.refresh(lic)

    return _license_response(lic)


# ── Admin endpoints ────────────────────────────────────────────────────────────

@router.post("/api/admin/licenses", status_code=status.HTTP_201_CREATED)
async def create_license(
    body: LicenseCreateRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_admin),
):
    """Crée une nouvelle licence. Réservé aux administrateurs."""
    new_key = str(uuid.uuid4())

    lic = License(
        key=new_key,
        email=body.email,
        plan=body.plan,
        expires_at=body.expires_at,
        active=True,
    )
    db.add(lic)
    await db.commit()
    await db.refresh(lic)

    return {
        "key": lic.key,
        "email": lic.email,
        "plan": lic.plan,
        "expires_at": lic.expires_at.isoformat(),
    }


@router.get("/api/admin/licenses")
async def list_licenses(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_admin),
):
    """Liste toutes les licences. Réservé aux administrateurs."""
    rows = await db.execute(
        select(License).order_by(License.created_at.desc())
    )
    licenses = rows.scalars().all()
    return [
        {
            "id": lic.id,
            "key": lic.key,
            "email": lic.email,
            "plan": lic.plan,
            "expires_at": lic.expires_at.isoformat(),
            "activated_at": lic.activated_at.isoformat() if lic.activated_at else None,
            "instance_id": lic.instance_id,
            "active": lic.active,
            "created_at": lic.created_at.isoformat(),
        }
        for lic in licenses
    ]
