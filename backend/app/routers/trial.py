"""
/api/v1/trial — Endpoint public pour demander un kit d'essai self-hosted.

Flow:
  1. POST /api/v1/trial/request  →  crée une License (plan=trial, 30j) + un TrialRequest
  2. Envoie le kit d'installation par email en tâche de fond
  3. Retourne 201 {"message": "Trial kit sent to your email"}
"""

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..limiter import limiter
from ..mailer import send_trial_kit_email
from ..models import License, TrialRequest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/trial", tags=["trial"])


class TrialRequestBody(BaseModel):
    email: EmailStr
    org: str = Field(..., min_length=2, max_length=255)
    name: str | None = Field(None, max_length=255)


@router.post("/request", status_code=status.HTTP_201_CREATED)
@limiter.limit("3/hour")
async def request_trial(
    request: Request,
    body: TrialRequestBody,
    db: AsyncSession = Depends(get_db),
):
    """Crée une licence d'essai 30 jours et envoie le kit de déploiement par email."""

    # 1. Vérifier que cet email n'a pas déjà demandé un essai
    existing = await db.execute(
        select(TrialRequest).where(TrialRequest.email == body.email)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A trial has already been requested for this email address.",
        )

    # 2. Créer la licence
    now        = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=30)
    license_key = str(uuid.uuid4())

    lic = License(
        key=license_key,
        email=body.email,
        plan="trial",
        expires_at=expires_at,
        active=True,
    )
    db.add(lic)
    await db.flush()  # génère l'id sans commiter

    # 3. Créer le TrialRequest
    trial_req = TrialRequest(
        email=body.email,
        org=body.org,
        name=body.name,
        license_key=license_key,
    )
    db.add(trial_req)
    await db.commit()

    # 4. Envoyer le kit par email en tâche de fond
    expires_at_str = expires_at.strftime("%B %d, %Y")
    asyncio.create_task(
        send_trial_kit_email(
            to_email=body.email,
            org=body.org,
            name=body.name,
            license_key=license_key,
            expires_at_str=expires_at_str,
        )
    )

    logger.info("Trial request created for %s (org=%s, key=%s)", body.email, body.org, license_key)
    return {"message": "Trial kit sent to your email"}
