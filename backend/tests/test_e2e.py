"""
Test end-to-end — parcours complet SaaS :
  inscription → login → créer client → créer token agent
  → ingest snapshot (avec health) → GET snapshot → POST analyse → GET analyse
"""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio

SNAPSHOT_PAYLOAD = {
    "schema_version": "1",
    "collected_at": "2025-03-01T08:00:00Z",
    "system": {
        "rfcsysid": "E2E",
        "rfchost": "sap-e2e-01",
        "rfcsaprl": "756",
        "rfcopsys": "Linux",
        "rfcdbsys": "HDB",
        "rfcdbhost": "hana-e2e-01",
        "rfckernrl": "785",
    },
    "components": [
        {"component": "SAP_BASIS", "release": "756", "extrelease": "0014", "description": "SAP Basis"},
    ],
    "support_packages": [
        {"component": "SAP_BASIS", "patch": "SAPKB75614", "type": "SPAM", "applied": "20240901"},
    ],
    "custom_objects": {"total": 300, "by_type": {"PROG": 100, "FUGR": 100, "TABL": 100}},
    "health": {
        "dumps_7d": 1,
        "jobs_aborted_7d": 0,
        "wp_priv": 0,
        "wp_stopped": 1,
        "trfc_errors": 3,
        "users_locked": 5,
        "tablespaces": [{"name": "PSAPSR3", "used_pct": 70}],
    },
}


async def test_full_saas_flow(client: AsyncClient, admin_user, db: AsyncSession):
    """
    Admin crée client + token → agent ingère snapshot avec health
    → consultant récupère snapshot → admin génère analyse → consultant la lit.
    """
    from .conftest import login

    admin_token = await login(client, "admin@example.com", "AdminPass123!")

    # 1. Créer un client
    resp = await client.post(
        "/api/v1/admin/clients?name=E2E+Corp",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201, resp.text
    client_id = resp.json()["id"]

    # 2. Créer un token agent
    resp = await client.post(
        f"/api/v1/admin/clients/{client_id}/tokens?label=e2e-agent",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201, resp.text
    agent_plaintext = resp.json()["token"]

    # 3. Agent ingère un snapshot avec données health
    resp = await client.post(
        "/api/v1/snapshots",
        json=SNAPSHOT_PAYLOAD,
        headers={"Authorization": f"Bearer {agent_plaintext}"},
    )
    assert resp.status_code == 201, resp.text
    snap_id = resp.json()["id"]

    # 4. Admin récupère la liste des snapshots
    resp = await client.get(
        f"/api/v1/clients/{client_id}/snapshots",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    snapshots = resp.json()
    assert len(snapshots) == 1
    assert snapshots[0]["system_sid"] == "E2E"
    # Health score calculé
    assert snapshots[0]["health"] is not None
    assert snapshots[0]["health"]["status"] in ("OK", "WARNING", "CRITICAL")

    # 5. Admin récupère le détail du snapshot
    resp = await client.get(
        f"/api/v1/clients/{client_id}/snapshots/{snap_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    detail = resp.json()
    assert detail["payload"]["system"]["rfcsysid"] == "E2E"

    # 6. Admin génère une analyse Claude (mockée)
    mock_result = ("## Rapport E2E\nSystème stable.", 900, 200)
    with patch("app.routers.analysis.analyse", new_callable=AsyncMock, return_value=mock_result):
        resp = await client.post(
            f"/api/v1/clients/{client_id}/snapshots/{snap_id}/analysis?language=French",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 201
    analysis = resp.json()
    assert analysis["language"] == "French"
    assert "E2E" in analysis["content"]
    assert analysis["input_tokens"] == 900

    # 7. GET retourne la même analyse depuis le cache
    resp = await client.get(
        f"/api/v1/clients/{client_id}/snapshots/{snap_id}/analysis",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["id"] == analysis["id"]
