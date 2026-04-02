"""Tests — forgot password + reset password."""

import hashlib
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PasswordResetToken, User
from app.auth import hash_password

from .conftest import login

pytestmark = pytest.mark.asyncio


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _insert_reset_token(
    db: AsyncSession,
    user: User,
    plaintext: str = "valid-reset-token-plaintext-32chars!!",
    expires_in: timedelta = timedelta(hours=1),
) -> PasswordResetToken:
    """Insère directement un token de reset en base pour les tests."""
    prt = PasswordResetToken(
        user_id=user.id,
        token_hash=hashlib.sha256(plaintext.encode()).hexdigest(),
        expires_at=datetime.now(timezone.utc) + expires_in,
    )
    db.add(prt)
    await db.commit()
    await db.refresh(prt)
    return prt


# ── forgot-password ────────────────────────────────────────────────────────────

async def test_forgot_password_known_email(client: AsyncClient, regular_user):
    # Email connu → 200, email envoyé (mailer mocké)
    with patch("app.routers.auth.send_reset_email", new_callable=AsyncMock) as mock_mail:
        resp = await client.post(
            "/api/v1/auth/forgot-password",
            json={"email": "consultant@example.com"},
        )
    assert resp.status_code == 200
    assert "message" in resp.json()
    mock_mail.assert_called_once()
    # Vérifier que l'URL envoyée contient bien le token
    _, reset_url = mock_mail.call_args[0]
    assert "reset_token=" in reset_url


async def test_forgot_password_unknown_email(client: AsyncClient):
    # Email inconnu → 200 quand même (pas de fuite d'info)
    with patch("app.routers.auth.send_reset_email", new_callable=AsyncMock) as mock_mail:
        resp = await client.post(
            "/api/v1/auth/forgot-password",
            json={"email": "nobody@nowhere.com"},
        )
    assert resp.status_code == 200
    mock_mail.assert_not_called()


async def test_forgot_password_creates_token_in_db(
    client: AsyncClient,
    regular_user,
    db: AsyncSession,
):
    with patch("app.routers.auth.send_reset_email", new_callable=AsyncMock):
        await client.post(
            "/api/v1/auth/forgot-password",
            json={"email": "consultant@example.com"},
        )

    row = await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.user_id == regular_user.id)
    )
    prt = row.scalar_one_or_none()
    assert prt is not None
    assert prt.expires_at > datetime.now(timezone.utc)


async def test_forgot_password_replaces_existing_token(
    client: AsyncClient,
    regular_user,
    db: AsyncSession,
):
    # Un deuxième appel doit remplacer l'ancien token, pas en créer un second
    with patch("app.routers.auth.send_reset_email", new_callable=AsyncMock):
        await client.post("/api/v1/auth/forgot-password", json={"email": "consultant@example.com"})
        await client.post("/api/v1/auth/forgot-password", json={"email": "consultant@example.com"})

    rows = await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.user_id == regular_user.id)
    )
    tokens = rows.scalars().all()
    assert len(tokens) == 1


async def test_forgot_password_invalid_email_format(client: AsyncClient):
    resp = await client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "pas-un-email"},
    )
    assert resp.status_code == 422


# ── reset-password ─────────────────────────────────────────────────────────────

async def test_reset_password_valid_token(
    client: AsyncClient,
    regular_user,
    db: AsyncSession,
):
    plaintext = "valid-reset-token-plaintext-32chars!!"
    await _insert_reset_token(db, regular_user, plaintext)

    resp = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": plaintext, "new_password": "NouveauMdp2026!!"},
    )
    assert resp.status_code == 204

    # Mot de passe bien mis à jour
    token = await login(client, "consultant@example.com", "NouveauMdp2026!!")
    assert token  # login réussi avec le nouveau mdp


async def test_reset_password_token_deleted_after_use(
    client: AsyncClient,
    regular_user,
    db: AsyncSession,
):
    # Le token doit être supprimé après utilisation (usage unique)
    plaintext = "single-use-token-plaintext-32chars!!"
    await _insert_reset_token(db, regular_user, plaintext)

    await client.post(
        "/api/v1/auth/reset-password",
        json={"token": plaintext, "new_password": "NouveauMdp2026!!"},
    )

    row = await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.user_id == regular_user.id)
    )
    assert row.scalar_one_or_none() is None


async def test_reset_password_token_cannot_be_reused(
    client: AsyncClient,
    regular_user,
    db: AsyncSession,
):
    plaintext = "reuse-test-token-plaintext-32chars!!"
    await _insert_reset_token(db, regular_user, plaintext)

    await client.post(
        "/api/v1/auth/reset-password",
        json={"token": plaintext, "new_password": "PremierMdp2026!!"},
    )

    # Deuxième utilisation → 400
    resp = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": plaintext, "new_password": "DeuxiemeMdp2026!!"},
    )
    assert resp.status_code == 400


async def test_reset_password_invalid_token(client: AsyncClient):
    resp = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": "token-qui-nexiste-pas", "new_password": "NouveauMdp2026!!"},
    )
    assert resp.status_code == 400


async def test_reset_password_expired_token(
    client: AsyncClient,
    regular_user,
    db: AsyncSession,
):
    # Insérer un token déjà expiré
    plaintext = "expired-token-plaintext-32chars!!"
    await _insert_reset_token(db, regular_user, plaintext, expires_in=timedelta(hours=-1))

    resp = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": plaintext, "new_password": "NouveauMdp2026!!"},
    )
    assert resp.status_code == 400


async def test_reset_password_too_short(
    client: AsyncClient,
    regular_user,
    db: AsyncSession,
):
    plaintext = "short-pwd-test-token-plaintext-32chars!!"
    await _insert_reset_token(db, regular_user, plaintext)

    resp = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": plaintext, "new_password": "court"},
    )
    assert resp.status_code == 422


async def test_reset_password_old_password_no_longer_works(
    client: AsyncClient,
    regular_user,
    db: AsyncSession,
):
    plaintext = "old-pwd-test-token-plaintext-32chars!!"
    await _insert_reset_token(db, regular_user, plaintext)

    await client.post(
        "/api/v1/auth/reset-password",
        json={"token": plaintext, "new_password": "NouveauMdp2026!!"},
    )

    # L'ancien mot de passe ne doit plus fonctionner
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "consultant@example.com", "password": "ConsultPass123!"},
    )
    assert resp.status_code == 401
