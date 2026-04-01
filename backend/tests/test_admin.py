"""Tests — admin endpoints (clients, tokens, users)."""

import pytest
from httpx import AsyncClient

from .conftest import login

pytestmark = pytest.mark.asyncio


async def test_admin_create_client(client: AsyncClient, admin_user):
    token = await login(client, "admin@example.com", "AdminPass123!")
    resp = await client.post(
        "/api/v1/admin/clients?name=Nouveau%20Client",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["name"] == "Nouveau Client"


async def test_admin_issue_and_revoke_token(client: AsyncClient, admin_user, test_client_obj):
    token = await login(client, "admin@example.com", "AdminPass123!")
    cid = test_client_obj.id

    # Issue token
    resp = await client.post(
        f"/api/v1/admin/clients/{cid}/tokens?label=test-agent",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "token" in data
    token_id = data["id"]

    # List tokens — should appear as active
    resp = await client.get(
        f"/api/v1/admin/clients/{cid}/tokens",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    tokens = resp.json()
    match = next((t for t in tokens if t["id"] == token_id), None)
    assert match is not None
    assert match["is_revoked"] is False

    # Revoke it
    resp = await client.delete(
        f"/api/v1/admin/clients/{cid}/tokens/{token_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 204

    # Confirm revoked in list
    resp = await client.get(
        f"/api/v1/admin/clients/{cid}/tokens",
        headers={"Authorization": f"Bearer {token}"},
    )
    match = next((t for t in resp.json() if t["id"] == token_id), None)
    assert match["is_revoked"] is True


async def test_admin_create_user_and_assign(client: AsyncClient, admin_user, test_client_obj):
    token = await login(client, "admin@example.com", "AdminPass123!")
    cid = test_client_obj.id

    # Create user
    resp = await client.post(
        "/api/v1/admin/users",
        json={"email": "newconsultant@example.com", "password": "StrongPass123!", "is_admin": False},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    uid = resp.json()["id"]

    # Assign client
    resp = await client.post(
        f"/api/v1/admin/users/{uid}/clients/{cid}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 204

    # Unassign client
    resp = await client.delete(
        f"/api/v1/admin/users/{uid}/clients/{cid}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 204


async def test_duplicate_email_rejected(client: AsyncClient, admin_user):
    token = await login(client, "admin@example.com", "AdminPass123!")
    payload = {"email": "dup@example.com", "password": "StrongPass123!"}

    await client.post("/api/v1/admin/users", json=payload, headers={"Authorization": f"Bearer {token}"})
    resp = await client.post("/api/v1/admin/users", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 409
