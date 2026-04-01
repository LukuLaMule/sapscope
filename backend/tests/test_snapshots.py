"""Tests — snapshot ingestion and retrieval."""

from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import UserClient

from .conftest import login

pytestmark = pytest.mark.asyncio

SAMPLE_PAYLOAD = {
    "schema_version": "1",
    "collected_at": "2025-01-15T10:00:00Z",
    "system": {
        "rfcsysid": "PRD",
        "rfchost": "sap-prd-01",
        "rfcsaprl": "756",
        "rfcopsys": "Linux",
        "rfcdbsys": "HDB",
        "rfcdbhost": "hana-prd-01",
        "rfckernrl": "785",
    },
    "components": [
        {"component": "SAP_BASIS", "release": "756", "extrelease": "0014", "description": "SAP Basis"},
    ],
    "support_packages": [
        {"component": "SAP_BASIS", "patch": "SAPKB75614", "type": "SPAM", "applied": "20240901"},
    ],
    "custom_objects": {"total": 1200, "by_type": {"PROG": 500, "FUGR": 300, "TABL": 400}},
}


async def test_ingest_snapshot_valid_token(client: AsyncClient, agent_token):
    _, plaintext = agent_token
    resp = await client.post(
        "/api/v1/snapshots",
        json=SAMPLE_PAYLOAD,
        headers={"Authorization": f"Bearer {plaintext}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "id" in data
    assert "received_at" in data


async def test_ingest_snapshot_invalid_token(client: AsyncClient):
    resp = await client.post(
        "/api/v1/snapshots",
        json=SAMPLE_PAYLOAD,
        headers={"Authorization": "Bearer invalid-token-xyz"},
    )
    assert resp.status_code == 401


async def test_ingest_snapshot_revoked_token(
    client: AsyncClient, agent_token, db: AsyncSession
):
    token_obj, plaintext = agent_token
    token_obj.is_revoked = True
    await db.commit()

    resp = await client.post(
        "/api/v1/snapshots",
        json=SAMPLE_PAYLOAD,
        headers={"Authorization": f"Bearer {plaintext}"},
    )
    assert resp.status_code == 401


async def test_list_snapshots_admin_sees_all(
    client: AsyncClient, admin_user, agent_token, db: AsyncSession, test_client_obj
):
    _, plaintext = agent_token
    # Ingest one snapshot
    await client.post(
        "/api/v1/snapshots",
        json=SAMPLE_PAYLOAD,
        headers={"Authorization": f"Bearer {plaintext}"},
    )

    token = await login(client, "admin@example.com", "AdminPass123!")
    resp = await client.get(
        f"/api/v1/clients/{test_client_obj.id}/snapshots",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


async def test_list_snapshots_unauthorized_user(
    client: AsyncClient, regular_user, agent_token, db: AsyncSession, test_client_obj
):
    _, plaintext = agent_token
    await client.post(
        "/api/v1/snapshots",
        json=SAMPLE_PAYLOAD,
        headers={"Authorization": f"Bearer {plaintext}"},
    )

    token = await login(client, "consultant@example.com", "ConsultPass123!")
    # User not assigned to this client → 403
    resp = await client.get(
        f"/api/v1/clients/{test_client_obj.id}/snapshots",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


async def test_list_snapshots_assigned_user(
    client: AsyncClient, regular_user, agent_token, db: AsyncSession, test_client_obj
):
    _, plaintext = agent_token
    await client.post(
        "/api/v1/snapshots",
        json=SAMPLE_PAYLOAD,
        headers={"Authorization": f"Bearer {plaintext}"},
    )

    # Assign user to client
    db.add(UserClient(user_id=regular_user.id, client_id=test_client_obj.id))
    await db.commit()

    token = await login(client, "consultant@example.com", "ConsultPass123!")
    resp = await client.get(
        f"/api/v1/clients/{test_client_obj.id}/snapshots",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert len(resp.json()) >= 1
