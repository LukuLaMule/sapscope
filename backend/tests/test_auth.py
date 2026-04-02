"""Tests — authentication endpoints."""

import pytest
from httpx import AsyncClient

from .conftest import login

pytestmark = pytest.mark.asyncio


async def test_login_success(client: AsyncClient, admin_user):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "AdminPass123!"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert data["is_admin"] is True


async def test_login_wrong_password(client: AsyncClient, admin_user):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "WrongPassword!"},
    )
    assert resp.status_code == 401


async def test_login_unknown_email(client: AsyncClient):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@nowhere.com", "password": "Whatever123!"},
    )
    assert resp.status_code == 401


async def test_protected_endpoint_without_token(client: AsyncClient):
    resp = await client.get("/api/v1/clients")
    assert resp.status_code == 401


async def test_protected_endpoint_with_bad_token(client: AsyncClient):
    resp = await client.get(
        "/api/v1/clients",
        headers={"Authorization": "Bearer this.is.not.valid"},
    )
    assert resp.status_code == 401


async def test_regular_user_cannot_access_admin(client: AsyncClient, regular_user):
    token = await login(client, "consultant@example.com", "ConsultPass123!")
    resp = await client.get(
        "/api/v1/admin/clients",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


async def test_get_me(client: AsyncClient, admin_user):
    token = await login(client, "admin@example.com", "AdminPass123!")
    resp = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "admin@example.com"
    assert data["is_admin"] is True
    assert "user_id" in data


async def test_get_me_without_token(client: AsyncClient):
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401


# ── Registration ──────────────────────────────────────────────────────────────

async def test_register_success(client: AsyncClient):
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "newuser@example.com", "password": "SecurePass123!"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == "newuser@example.com"
    assert data["is_admin"] is False
    assert "token" in data


async def test_register_duplicate_email(client: AsyncClient, regular_user):
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "consultant@example.com", "password": "SecurePass123!"},
    )
    assert resp.status_code == 409


async def test_register_password_too_short(client: AsyncClient):
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "short@example.com", "password": "short"},
    )
    assert resp.status_code == 422


async def test_register_disabled(client: AsyncClient, monkeypatch):
    from app.routers import auth as auth_module
    monkeypatch.setattr(auth_module.settings, "registration_enabled", False)
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "blocked@example.com", "password": "SecurePass123!"},
    )
    assert resp.status_code == 403


# ── Change own password ───────────────────────────────────────────────────────

async def test_change_own_password(client: AsyncClient, regular_user):
    token = await login(client, "consultant@example.com", "ConsultPass123!")
    resp = await client.patch(
        "/api/v1/auth/me/password",
        json={"current_password": "ConsultPass123!", "new_password": "NewPassword456!"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 204

    # Old password no longer works
    resp2 = await client.post(
        "/api/v1/auth/login",
        json={"email": "consultant@example.com", "password": "ConsultPass123!"},
    )
    assert resp2.status_code == 401

    # New password works
    resp3 = await client.post(
        "/api/v1/auth/login",
        json={"email": "consultant@example.com", "password": "NewPassword456!"},
    )
    assert resp3.status_code == 200


async def test_change_password_wrong_current(client: AsyncClient, regular_user):
    token = await login(client, "consultant@example.com", "ConsultPass123!")
    resp = await client.patch(
        "/api/v1/auth/me/password",
        json={"current_password": "WrongCurrent!", "new_password": "NewPassword456!"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 401


async def test_change_password_too_short(client: AsyncClient, regular_user):
    token = await login(client, "consultant@example.com", "ConsultPass123!")
    resp = await client.patch(
        "/api/v1/auth/me/password",
        json={"current_password": "ConsultPass123!", "new_password": "short"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


# ── JWT ───────────────────────────────────────────────────────────────────────

async def test_expired_token_rejected(client: AsyncClient, admin_user):
    import time
    from app.auth import create_jwt
    # Create a token that expired 1 second ago
    expired = create_jwt(str(admin_user.id), expires_in_seconds=-1)
    resp = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {expired}"},
    )
    assert resp.status_code == 401


async def test_malformed_token_rejected(client: AsyncClient):
    resp = await client.get(
        "/api/v1/clients",
        headers={"Authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.garbage.garbage"},
    )
    assert resp.status_code == 401
