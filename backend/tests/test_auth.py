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
