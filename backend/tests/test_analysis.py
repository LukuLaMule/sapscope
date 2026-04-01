"""Tests — analysis endpoint (cache, language persistence)."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Analysis, Snapshot, UserClient

from .conftest import login

pytestmark = pytest.mark.asyncio

SAMPLE_PAYLOAD = {
    "schema_version": "1",
    "collected_at": "2025-01-15T10:00:00Z",
    "system": {
        "rfcsysid": "TST",
        "rfchost": "sap-tst-01",
        "rfcsaprl": "756",
        "rfcopsys": "Linux",
        "rfcdbsys": "HDB",
        "rfcdbhost": "hana-tst-01",
        "rfckernrl": "785",
    },
    "components": [{"component": "SAP_BASIS", "release": "756", "extrelease": "0014", "description": "SAP Basis"}],
    "support_packages": [{"component": "SAP_BASIS", "patch": "SAPKB75614", "type": "SPAM", "applied": "20240901"}],
    "custom_objects": {"total": 500, "by_type": {"PROG": 200, "FUGR": 150, "TABL": 150}},
}


async def _ingest_and_get_snapshot_id(
    client: AsyncClient, agent_plaintext: str, admin_token: str, client_id: str
) -> str:
    await client.post(
        "/api/v1/snapshots",
        json=SAMPLE_PAYLOAD,
        headers={"Authorization": f"Bearer {agent_plaintext}"},
    )
    resp = await client.get(
        f"/api/v1/clients/{client_id}/snapshots",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    return resp.json()[0]["id"]


async def test_analysis_cached_result(
    client: AsyncClient, admin_user, agent_token, db: AsyncSession, test_client_obj
):
    _, plaintext = agent_token
    token = await login(client, "admin@example.com", "AdminPass123!")
    snap_id = await _ingest_and_get_snapshot_id(client, plaintext, token, test_client_obj.id)

    mock_result = ("## Release\nStill in mainstream maintenance.", 800, 200)

    with patch("app.routers.analysis.analyse", new_callable=AsyncMock, return_value=mock_result):
        # First call — generates
        resp = await client.post(
            f"/api/v1/clients/{test_client_obj.id}/snapshots/{snap_id}/analysis?language=French",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["language"] == "French"
        assert "maintenance" in data["content"]

        # Second call without force — returns cache, does NOT call analyse again
        resp2 = await client.post(
            f"/api/v1/clients/{test_client_obj.id}/snapshots/{snap_id}/analysis",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp2.status_code == 201
        assert resp2.json()["language"] == "French"  # language from cache, not default


async def test_analysis_force_regenerate(
    client: AsyncClient, admin_user, agent_token, db: AsyncSession, test_client_obj
):
    _, plaintext = agent_token
    token = await login(client, "admin@example.com", "AdminPass123!")
    snap_id = await _ingest_and_get_snapshot_id(client, plaintext, token, test_client_obj.id)

    first  = ("First analysis content.", 800, 200)
    second = ("Second analysis content.", 900, 250)

    with patch("app.routers.analysis.analyse", new_callable=AsyncMock, return_value=first):
        await client.post(
            f"/api/v1/clients/{test_client_obj.id}/snapshots/{snap_id}/analysis?language=English",
            headers={"Authorization": f"Bearer {token}"},
        )

    with patch("app.routers.analysis.analyse", new_callable=AsyncMock, return_value=second):
        resp = await client.post(
            f"/api/v1/clients/{test_client_obj.id}/snapshots/{snap_id}/analysis?force=true&language=German",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 201
    data = resp.json()
    assert data["content"] == "Second analysis content."
    assert data["language"] == "German"


async def test_get_analysis_not_found(
    client: AsyncClient, admin_user, agent_token, db: AsyncSession, test_client_obj
):
    _, plaintext = agent_token
    token = await login(client, "admin@example.com", "AdminPass123!")
    snap_id = await _ingest_and_get_snapshot_id(client, plaintext, token, test_client_obj.id)

    resp = await client.get(
        f"/api/v1/clients/{test_client_obj.id}/snapshots/{snap_id}/analysis",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404
