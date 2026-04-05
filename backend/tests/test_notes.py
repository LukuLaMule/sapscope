"""Tests — notes par système SAP."""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SystemNote
from .conftest import login

pytestmark = pytest.mark.asyncio


async def test_create_and_list_note(client: AsyncClient, admin_user, db: AsyncSession, test_client_obj):
    token = await login(client, "admin@example.com", "AdminPass123!")
    cid = test_client_obj.id

    resp = await client.post(
        f"/api/v1/clients/{cid}/systems/PRD/notes",
        json={"content": "Mise à jour SP prévue Q3"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    note = resp.json()
    assert note["content"] == "Mise à jour SP prévue Q3"
    assert note["author_email"] == "admin@example.com"
    note_id = note["id"]

    # List
    resp = await client.get(
        f"/api/v1/clients/{cid}/systems/PRD/notes",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    ids = [n["id"] for n in resp.json()]
    assert note_id in ids


async def test_update_note(client: AsyncClient, admin_user, db: AsyncSession, test_client_obj):
    token = await login(client, "admin@example.com", "AdminPass123!")
    cid = test_client_obj.id

    resp = await client.post(
        f"/api/v1/clients/{cid}/systems/QAS/notes",
        json={"content": "Note initiale"},
        headers={"Authorization": f"Bearer {token}"},
    )
    note_id = resp.json()["id"]

    resp = await client.patch(
        f"/api/v1/clients/{cid}/systems/QAS/notes/{note_id}",
        json={"content": "Note modifiée"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["content"] == "Note modifiée"


async def test_delete_note(client: AsyncClient, admin_user, db: AsyncSession, test_client_obj):
    token = await login(client, "admin@example.com", "AdminPass123!")
    cid = test_client_obj.id

    resp = await client.post(
        f"/api/v1/clients/{cid}/systems/DEV/notes",
        json={"content": "À supprimer"},
        headers={"Authorization": f"Bearer {token}"},
    )
    note_id = resp.json()["id"]

    resp = await client.delete(
        f"/api/v1/clients/{cid}/systems/DEV/notes/{note_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 204

    resp = await client.get(
        f"/api/v1/clients/{cid}/systems/DEV/notes",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert all(n["id"] != note_id for n in resp.json())


async def test_consultant_cannot_access_unassigned(
    client: AsyncClient, admin_user, regular_user, db: AsyncSession, test_client_obj
):
    token = await login(client, "consultant@example.com", "ConsultPass123!")
    resp = await client.get(
        f"/api/v1/clients/{test_client_obj.id}/systems/PRD/notes",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


async def test_empty_content_rejected(client: AsyncClient, admin_user, test_client_obj):
    token = await login(client, "admin@example.com", "AdminPass123!")
    resp = await client.post(
        f"/api/v1/clients/{test_client_obj.id}/systems/PRD/notes",
        json={"content": ""},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422
