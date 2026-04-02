"""
/api/v1/auth  — login, self-registration, password reset.
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import create_jwt, get_current_user, hash_password, verify_password
from ..database import get_db
from ..limiter import limiter
from ..mailer import send_reset_email
from ..models import PasswordResetToken, User
from ..settings import settings

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12)


class LoginResponse(BaseModel):
    token: str
    user_id: str
    email: str
    is_admin: bool


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=12)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=12)


@router.post("/login", response_model=LoginResponse)
@limiter.limit("10/minute")
async def login(request: Request, body: LoginRequest, db: AsyncSession = Depends(get_db)):
    row = await db.execute(select(User).where(User.email == body.email))
    user = row.scalar_one_or_none()

    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    return LoginResponse(
        token=create_jwt(user.id),
        user_id=user.id,
        email=user.email,
        is_admin=user.is_admin,
    )


@router.post("/register", response_model=LoginResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(request: Request, body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    if not settings.registration_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Self-registration is disabled on this instance",
        )

    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already in use")

    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        is_admin=False,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return LoginResponse(
        token=create_jwt(user.id),
        user_id=user.id,
        email=user.email,
        is_admin=False,
    )


@router.patch("/me/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_own_password(
    body: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect")
    current_user.password_hash = hash_password(body.new_password)
    await db.commit()


@router.post("/forgot-password")
@limiter.limit("5/hour")
async def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """Envoie un lien de reset par email. Retourne toujours 200 pour ne pas exposer
    si un email est inscrit ou non."""
    row = await db.execute(select(User).where(User.email == body.email))
    user = row.scalar_one_or_none()

    if user:
        # Supprimer tout token existant pour cet utilisateur avant d'en créer un nouveau
        await db.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id))

        plaintext = secrets.token_urlsafe(32)
        db.add(PasswordResetToken(
            user_id=user.id,
            token_hash=hashlib.sha256(plaintext.encode()).hexdigest(),
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        ))
        await db.commit()

        reset_url = f"{settings.app_url}/app?reset_token={plaintext}"
        await send_reset_email(user.email, reset_url)

    return {"message": "Si cet email est enregistré, vous recevrez un lien dans quelques minutes."}


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/hour")
async def reset_password(
    request: Request,
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """Valide le token et met à jour le mot de passe. Token supprimé après usage."""
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()

    row = await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
    )
    prt = row.scalar_one_or_none()

    if not prt or prt.expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Lien invalide ou expiré",
        )

    user_row = await db.execute(select(User).where(User.id == prt.user_id))
    user = user_row.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Lien invalide ou expiré")

    user.password_hash = hash_password(body.new_password)
    await db.delete(prt)
    await db.commit()
