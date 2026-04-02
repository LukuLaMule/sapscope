"""Tests — comparaison de snapshots (diff)."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import UserClient

from .conftest import login

pytestmark = pytest.mark.asyncio

# Deux snapshots du même SID mais avec des versions différentes
SNAP_BEFORE = {
    "schema_version": "1",
    "collected_at": "2025-06-01T02:00:00Z",
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
        {"component": "SAP_BASIS", "release": "756", "extrelease": "0012", "description": "SAP Basis"},
        {"component": "SAP_ABA",   "release": "756", "extrelease": "0010", "description": "Cross-Application"},
    ],
    "support_packages": [
        {"component": "SAP_BASIS", "patch": "SAPKB75612", "type": "SPAM", "applied": "20240601"},
    ],
    "custom_objects": {"total": 1000, "by_type": {"PROG": 400, "TABL": 600}},
}

SNAP_AFTER = {
    "schema_version": "1",
    "collected_at": "2025-09-01T02:00:00Z",
    "system": {
        "rfcsysid": "PRD",
        "rfchost": "sap-prd-01",
        "rfcsaprl": "756",
        "rfcopsys": "Linux",
        "rfcdbsys": "HDB",
        "rfcdbhost": "hana-prd-01",
        "rfckernrl": "793",  # kernel mis à jour
    },
    "components": [
        {"component": "SAP_BASIS", "release": "756", "extrelease": "0014", "description": "SAP Basis"},
        # SAP_ABA supprimé, SAP_HR ajouté
        {"component": "SAP_HR",    "release": "608", "extrelease": "0004", "description": "HR"},
    ],
    "support_packages": [
        {"component": "SAP_BASIS", "patch": "SAPKB75614", "type": "SPAM", "applied": "20240901"},
    ],
    "custom_objects": {"total": 1250, "by_type": {"PROG": 500, "TABL": 600, "FUGR": 150}},
}

# Snapshot d'un autre SID — pour tester le refus cross-SID
SNAP_QAS = {
    "schema_version": "1",
    "collected_at": "2025-07-01T02:00:00Z",
    "system": {
        "rfcsysid": "QAS",
        "rfchost": "sap-qas-01",
        "rfcsaprl": "756",
        "rfcopsys": "Linux",
        "rfcdbsys": "HDB",
        "rfcdbhost": "hana-qas-01",
        "rfckernrl": "785",
    },
    "components": [],
    "support_packages": [],
    "custom_objects": {"total": 0, "by_type": {}},
}


async def _ingest(client: AsyncClient, payload: dict, plaintext: str) -> str:
    """Ingère un snapshot et retourne son ID."""
    resp = await client.post(
        "/api/v1/snapshots",
        json=payload,
        headers={"Authorization": f"Bearer {plaintext}"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# ── Cas nominal ────────────────────────────────────────────────────────────────

async def test_diff_basic(
    client: AsyncClient,
    admin_user,
    agent_token,
    test_client_obj,
):
    _, plaintext = agent_token
    id_before = await _ingest(client, SNAP_BEFORE, plaintext)
    id_after  = await _ingest(client, SNAP_AFTER,  plaintext)

    token = await login(client, "admin@example.com", "AdminPass123!")
    resp = await client.get(
        f"/api/v1/clients/{test_client_obj.id}/snapshots/{id_after}/diff?base={id_before}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()

    # Les deux snapshots sont bien référencés
    assert data["snap_a"]["id"] == id_after
    assert data["snap_b"]["id"] == id_before

    # Kernel a changé → un system_change
    assert any(c["field"] == "rfckernrl" for c in data["system_changes"])

    # SAP_BASIS a changé d'extrelease
    changed = data["components"]["changed"]
    assert any(c["component"] == "SAP_BASIS" for c in changed)

    # SAP_HR ajouté, SAP_ABA retiré
    assert any(c["component"] == "SAP_HR"  for c in data["components"]["added"])
    assert any(c["component"] == "SAP_ABA" for c in data["components"]["removed"])

    # Support package SAP_BASIS mis à jour
    assert any(c["component"] == "SAP_BASIS" for c in data["support_packages"]["changed"])

    # Delta d'objets custom : +250
    assert data["custom_objects"]["total_delta"] == 250


async def test_diff_identical_snapshots(
    client: AsyncClient,
    admin_user,
    agent_token,
    test_client_obj,
):
    # Comparer un snapshot avec lui-même → tout vide
    _, plaintext = agent_token
    snap_id = await _ingest(client, SNAP_BEFORE, plaintext)

    token = await login(client, "admin@example.com", "AdminPass123!")
    resp = await client.get(
        f"/api/v1/clients/{test_client_obj.id}/snapshots/{snap_id}/diff?base={snap_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["system_changes"] == []
    assert data["components"]["added"] == []
    assert data["components"]["removed"] == []
    assert data["components"]["changed"] == []
    assert data["custom_objects"]["total_delta"] == 0


# ── Contrôle d'accès ───────────────────────────────────────────────────────────

async def test_diff_requires_auth(client: AsyncClient, agent_token, test_client_obj):
    _, plaintext = agent_token
    snap_id = await _ingest(client, SNAP_BEFORE, plaintext)

    resp = await client.get(
        f"/api/v1/clients/{test_client_obj.id}/snapshots/{snap_id}/diff?base={snap_id}",
    )
    assert resp.status_code == 401


async def test_diff_forbidden_for_unassigned_user(
    client: AsyncClient,
    regular_user,
    agent_token,
    test_client_obj,
):
    _, plaintext = agent_token
    id_before = await _ingest(client, SNAP_BEFORE, plaintext)
    id_after  = await _ingest(client, SNAP_AFTER,  plaintext)

    # Le consultant n'est pas assigné à ce client
    token = await login(client, "consultant@example.com", "ConsultPass123!")
    resp = await client.get(
        f"/api/v1/clients/{test_client_obj.id}/snapshots/{id_after}/diff?base={id_before}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


async def test_diff_accessible_for_assigned_user(
    client: AsyncClient,
    regular_user,
    agent_token,
    test_client_obj,
    db: AsyncSession,
):
    _, plaintext = agent_token
    id_before = await _ingest(client, SNAP_BEFORE, plaintext)
    id_after  = await _ingest(client, SNAP_AFTER,  plaintext)

    # On assigne le consultant au client
    db.add(UserClient(user_id=regular_user.id, client_id=test_client_obj.id))
    await db.commit()

    token = await login(client, "consultant@example.com", "ConsultPass123!")
    resp = await client.get(
        f"/api/v1/clients/{test_client_obj.id}/snapshots/{id_after}/diff?base={id_before}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200


# ── Cas d'erreur ───────────────────────────────────────────────────────────────

async def test_diff_snapshot_not_found(
    client: AsyncClient,
    admin_user,
    agent_token,
    test_client_obj,
):
    _, plaintext = agent_token
    snap_id = await _ingest(client, SNAP_BEFORE, plaintext)
    fake_id = "00000000-0000-0000-0000-000000000000"

    token = await login(client, "admin@example.com", "AdminPass123!")

    # snap_a introuvable
    resp = await client.get(
        f"/api/v1/clients/{test_client_obj.id}/snapshots/{fake_id}/diff?base={snap_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404

    # snap_b (base) introuvable
    resp = await client.get(
        f"/api/v1/clients/{test_client_obj.id}/snapshots/{snap_id}/diff?base={fake_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


async def test_diff_cross_sid_rejected(
    client: AsyncClient,
    admin_user,
    agent_token,
    test_client_obj,
):
    # Comparer PRD vs QAS → 400
    _, plaintext = agent_token
    id_prd = await _ingest(client, SNAP_AFTER, plaintext)
    id_qas = await _ingest(client, SNAP_QAS,   plaintext)

    token = await login(client, "admin@example.com", "AdminPass123!")
    resp = await client.get(
        f"/api/v1/clients/{test_client_obj.id}/snapshots/{id_prd}/diff?base={id_qas}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400
    assert "different" in resp.json()["detail"].lower()
