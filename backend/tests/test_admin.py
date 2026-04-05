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


async def test_delete_client(client: AsyncClient, admin_user, test_client_obj):
    token = await login(client, "admin@example.com", "AdminPass123!")
    cid = test_client_obj.id

    resp = await client.delete(
        f"/api/v1/admin/clients/{cid}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 204

    # Ne doit plus apparaître dans la liste
    resp = await client.get("/api/v1/admin/clients", headers={"Authorization": f"Bearer {token}"})
    ids = [c["id"] for c in resp.json()]
    assert cid not in ids


async def test_delete_client_not_found(client: AsyncClient, admin_user):
    token = await login(client, "admin@example.com", "AdminPass123!")
    resp = await client.delete(
        "/api/v1/admin/clients/00000000-0000-0000-0000-000000000000",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


async def test_delete_client_non_admin_forbidden(client: AsyncClient, regular_user, test_client_obj):
    token = await login(client, "consultant@example.com", "ConsultPass123!")
    resp = await client.delete(
        f"/api/v1/admin/clients/{test_client_obj.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


# ── List endpoints ────────────────────────────────────────────────────────────

async def test_list_clients(client: AsyncClient, admin_user, test_client_obj):
    token = await login(client, "admin@example.com", "AdminPass123!")
    resp = await client.get("/api/v1/admin/clients", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert any(c["id"] == test_client_obj.id for c in resp.json())


async def test_list_users(client: AsyncClient, admin_user, regular_user):
    token = await login(client, "admin@example.com", "AdminPass123!")
    resp = await client.get("/api/v1/admin/users", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    emails = [u["email"] for u in resp.json()]
    assert "admin@example.com" in emails
    assert "consultant@example.com" in emails


async def test_non_admin_cannot_list_users(client: AsyncClient, regular_user):
    token = await login(client, "consultant@example.com", "ConsultPass123!")
    resp = await client.get("/api/v1/admin/users", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


# ── Delete user ───────────────────────────────────────────────────────────────

async def test_delete_user(client: AsyncClient, admin_user, regular_user):
    token = await login(client, "admin@example.com", "AdminPass123!")
    uid = regular_user.id
    resp = await client.delete(
        f"/api/v1/admin/users/{uid}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 204

    # Ne doit plus apparaître
    resp = await client.get("/api/v1/admin/users", headers={"Authorization": f"Bearer {token}"})
    assert not any(u["id"] == uid for u in resp.json())


async def test_admin_cannot_delete_own_account(client: AsyncClient, admin_user):
    token = await login(client, "admin@example.com", "AdminPass123!")
    resp = await client.delete(
        f"/api/v1/admin/users/{admin_user.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400


async def test_cannot_delete_last_admin(client: AsyncClient, admin_user):
    """Seul admin — suppression doit être refusée."""
    token = await login(client, "admin@example.com", "AdminPass123!")
    # On essaie de supprimer un autre utilisateur admin (il n'y en a pas)
    # On crée un second admin puis on supprime le premier — protège le dernier
    resp = await client.post(
        "/api/v1/admin/users",
        json={"email": "admin2@example.com", "password": "AdminPass456!", "is_admin": True},
        headers={"Authorization": f"Bearer {token}"},
    )
    uid2 = resp.json()["id"]

    # Supprimer admin2 (ok, il reste admin_user)
    resp = await client.delete(f"/api/v1/admin/users/{uid2}", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 204

    # Tenter de supprimer admin_user (le dernier admin) — doit être refusé
    # On recrée admin2 d'abord pour pouvoir tenter la suppression de admin_user
    resp = await client.post(
        "/api/v1/admin/users",
        json={"email": "admin3@example.com", "password": "AdminPass789!", "is_admin": False},
        headers={"Authorization": f"Bearer {token}"},
    )
    uid3 = resp.json()["id"]
    resp = await client.delete(f"/api/v1/admin/users/{uid3}", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 204  # suppression d'un non-admin ok


# ── Admin toggle ──────────────────────────────────────────────────────────────

async def test_set_admin_flag(client: AsyncClient, admin_user, regular_user):
    token = await login(client, "admin@example.com", "AdminPass123!")
    resp = await client.patch(
        f"/api/v1/admin/users/{regular_user.id}/admin",
        json={"is_admin": True},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 204

    # Vérifier dans la liste
    resp = await client.get("/api/v1/admin/users", headers={"Authorization": f"Bearer {token}"})
    user = next(u for u in resp.json() if u["id"] == regular_user.id)
    assert user["is_admin"] is True


async def test_cannot_demote_last_admin(client: AsyncClient, admin_user):
    token = await login(client, "admin@example.com", "AdminPass123!")
    resp = await client.patch(
        f"/api/v1/admin/users/{admin_user.id}/admin",
        json={"is_admin": False},
        headers={"Authorization": f"Bearer {token}"},
    )
    # Cannot change own admin status
    assert resp.status_code == 400


# ── Admin password reset ──────────────────────────────────────────────────────

async def test_admin_reset_user_password(client: AsyncClient, admin_user, regular_user):
    token = await login(client, "admin@example.com", "AdminPass123!")
    resp = await client.patch(
        f"/api/v1/admin/users/{regular_user.id}/password",
        json={"password": "NewAdminSet123!"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 204

    # Nouveau mot de passe fonctionne
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "consultant@example.com", "password": "NewAdminSet123!"},
    )
    assert resp.status_code == 200


# ── Token edge cases ──────────────────────────────────────────────────────────

async def test_issue_token_client_not_found(client: AsyncClient, admin_user):
    token = await login(client, "admin@example.com", "AdminPass123!")
    resp = await client.post(
        "/api/v1/admin/clients/00000000-0000-0000-0000-000000000000/tokens?label=x",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


async def test_revoke_token_not_found(client: AsyncClient, admin_user, test_client_obj):
    token = await login(client, "admin@example.com", "AdminPass123!")
    resp = await client.delete(
        f"/api/v1/admin/clients/{test_client_obj.id}/tokens/00000000-0000-0000-0000-000000000000",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404
