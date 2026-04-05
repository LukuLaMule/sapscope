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


async def test_get_snapshot_detail(
    client: AsyncClient, admin_user, agent_token, db: AsyncSession, test_client_obj
):
    _, plaintext = agent_token
    ingest_resp = await client.post(
        "/api/v1/snapshots",
        json=SAMPLE_PAYLOAD,
        headers={"Authorization": f"Bearer {plaintext}"},
    )
    snap_id = ingest_resp.json()["id"]

    token = await login(client, "admin@example.com", "AdminPass123!")
    resp = await client.get(
        f"/api/v1/clients/{test_client_obj.id}/snapshots/{snap_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == snap_id
    assert data["system_sid"] == "PRD"
    assert "payload" in data


async def test_get_snapshot_not_found(
    client: AsyncClient, admin_user, db: AsyncSession, test_client_obj
):
    token = await login(client, "admin@example.com", "AdminPass123!")
    resp = await client.get(
        f"/api/v1/clients/{test_client_obj.id}/snapshots/00000000-0000-0000-0000-000000000000",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


async def test_list_snapshots_filter_by_sid(
    client: AsyncClient, admin_user, agent_token, db: AsyncSession, test_client_obj
):
    _, plaintext = agent_token
    # Ingest PRD snapshot
    await client.post(
        "/api/v1/snapshots",
        json=SAMPLE_PAYLOAD,
        headers={"Authorization": f"Bearer {plaintext}"},
    )
    # Ingest DEV snapshot
    dev_payload = {**SAMPLE_PAYLOAD, "system": {**SAMPLE_PAYLOAD["system"], "rfcsysid": "DEV"}}
    await client.post(
        "/api/v1/snapshots",
        json=dev_payload,
        headers={"Authorization": f"Bearer {plaintext}"},
    )

    token = await login(client, "admin@example.com", "AdminPass123!")
    resp = await client.get(
        f"/api/v1/clients/{test_client_obj.id}/snapshots?sid=PRD",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    results = resp.json()
    assert all(s["system_sid"] == "PRD" for s in results)


async def test_list_snapshots_pagination(
    client: AsyncClient, admin_user, agent_token, db: AsyncSession, test_client_obj
):
    _, plaintext = agent_token
    # Ingest 3 snapshots
    for _ in range(3):
        await client.post(
            "/api/v1/snapshots",
            json=SAMPLE_PAYLOAD,
            headers={"Authorization": f"Bearer {plaintext}"},
        )

    token = await login(client, "admin@example.com", "AdminPass123!")
    resp_page1 = await client.get(
        f"/api/v1/clients/{test_client_obj.id}/snapshots?limit=2&offset=0",
        headers={"Authorization": f"Bearer {token}"},
    )
    resp_page2 = await client.get(
        f"/api/v1/clients/{test_client_obj.id}/snapshots?limit=2&offset=2",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp_page1.status_code == 200
    assert len(resp_page1.json()) == 2
    assert resp_page2.status_code == 200
    # IDs on page 1 and 2 must not overlap
    ids_p1 = {s["id"] for s in resp_page1.json()}
    ids_p2 = {s["id"] for s in resp_page2.json()}
    assert ids_p1.isdisjoint(ids_p2)


async def test_ingest_snapshot_with_health_computes_score(
    client: AsyncClient, agent_token, db: AsyncSession, test_client_obj
):
    _, plaintext = agent_token
    payload_with_health = {
        **SAMPLE_PAYLOAD,
        "health": {
            "dumps_7d": 0,
            "jobs_aborted_7d": 0,
            "wp_priv": 0,
            "wp_stopped": 0,
            "trfc_errors": 0,
            "users_locked": 2,
        },
    }
    resp = await client.post(
        "/api/v1/snapshots",
        json=payload_with_health,
        headers={"Authorization": f"Bearer {plaintext}"},
    )
    assert resp.status_code == 201
    snap_id = resp.json()["id"]

    # Verify health score via snapshot detail (need admin)
    from app.models import AgentToken as AgentTokenModel
    from sqlalchemy import select as sa_select
    from sqlalchemy.orm import selectinload as sl
    from app.models import Snapshot, HealthCheck
    row = await db.execute(
        sa_select(Snapshot).options(sl(Snapshot.health_check)).where(Snapshot.id == snap_id)
    )
    snap = row.scalar_one()
    assert snap.health_check is not None
    assert snap.health_check.score == 100
    assert snap.health_check.status == "OK"


async def test_list_clients_admin_sees_all(
    client: AsyncClient, admin_user, test_client_obj, db: AsyncSession
):
    token = await login(client, "admin@example.com", "AdminPass123!")
    resp = await client.get("/api/v1/clients", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    ids = [c["id"] for c in resp.json()]
    assert test_client_obj.id in ids


async def test_list_clients_consultant_sees_only_assigned(
    client: AsyncClient, regular_user, admin_user, test_client_obj, db: AsyncSession
):
    # Consultant has no assignment yet
    token = await login(client, "consultant@example.com", "ConsultPass123!")
    resp = await client.get("/api/v1/clients", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    ids = [c["id"] for c in resp.json()]
    assert test_client_obj.id not in ids

    # Assign then retry
    db.add(UserClient(user_id=regular_user.id, client_id=test_client_obj.id))
    await db.commit()
    resp2 = await client.get("/api/v1/clients", headers={"Authorization": f"Bearer {token}"})
    ids2 = [c["id"] for c in resp2.json()]
    assert test_client_obj.id in ids2
