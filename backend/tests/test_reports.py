"""
Tests pour les endpoints report-config (GET, PATCH) et les champs de personnalisation.
"""

import pytest
from httpx import AsyncClient

from .conftest import login


@pytest.mark.asyncio
async def test_get_report_config_default(client: AsyncClient, admin_user, test_client_obj, db):
    from app.models import UserClient
    db.add(UserClient(user_id=admin_user.id, client_id=test_client_obj.id))
    await db.commit()

    token = await login(client, "admin@example.com", "AdminPass123!")
    resp = await client.get(
        f"/api/v1/clients/{test_client_obj.id}/report-config",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["enabled"] is False
    assert data["language"] == "fr"
    assert data["report_title"] is None
    assert data["include_health_domains"] is True
    assert data["include_key_metrics"] is True
    assert data["include_ai_analysis"] is True


@pytest.mark.asyncio
async def test_patch_report_config_sections(client: AsyncClient, admin_user, test_client_obj, db):
    from app.models import UserClient
    db.add(UserClient(user_id=admin_user.id, client_id=test_client_obj.id))
    await db.commit()

    token = await login(client, "admin@example.com", "AdminPass123!")
    resp = await client.patch(
        f"/api/v1/clients/{test_client_obj.id}/report-config",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "report_title": "Rapport mensuel SAP",
            "include_health_domains": False,
            "include_key_metrics": True,
            "include_ai_analysis": False,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["report_title"] == "Rapport mensuel SAP"
    assert data["include_health_domains"] is False
    assert data["include_key_metrics"] is True
    assert data["include_ai_analysis"] is False


@pytest.mark.asyncio
async def test_patch_report_config_forbidden_non_admin(client: AsyncClient, regular_user, test_client_obj, db):
    from app.models import UserClient
    db.add(UserClient(user_id=regular_user.id, client_id=test_client_obj.id))
    await db.commit()

    token = await login(client, "consultant@example.com", "ConsultPass123!")
    resp = await client.patch(
        f"/api/v1/clients/{test_client_obj.id}/report-config",
        headers={"Authorization": f"Bearer {token}"},
        json={"report_title": "hack"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_patch_report_title_blank_stored_as_null(client: AsyncClient, admin_user, test_client_obj, db):
    from app.models import UserClient
    db.add(UserClient(user_id=admin_user.id, client_id=test_client_obj.id))
    await db.commit()

    token = await login(client, "admin@example.com", "AdminPass123!")
    resp = await client.patch(
        f"/api/v1/clients/{test_client_obj.id}/report-config",
        headers={"Authorization": f"Bearer {token}"},
        json={"report_title": "   "},
    )
    assert resp.status_code == 200
    assert resp.json()["report_title"] is None


@pytest.mark.asyncio
async def test_patch_report_config_language_invalid(client: AsyncClient, admin_user, test_client_obj, db):
    from app.models import UserClient
    db.add(UserClient(user_id=admin_user.id, client_id=test_client_obj.id))
    await db.commit()

    token = await login(client, "admin@example.com", "AdminPass123!")
    resp = await client.patch(
        f"/api/v1/clients/{test_client_obj.id}/report-config",
        headers={"Authorization": f"Bearer {token}"},
        json={"language": "de"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_patch_report_config_schedule_and_language(client: AsyncClient, admin_user, test_client_obj, db):
    from app.models import UserClient
    db.add(UserClient(user_id=admin_user.id, client_id=test_client_obj.id))
    await db.commit()

    token = await login(client, "admin@example.com", "AdminPass123!")
    resp = await client.patch(
        f"/api/v1/clients/{test_client_obj.id}/report-config",
        headers={"Authorization": f"Bearer {token}"},
        json={"schedule": "monthly", "schedule_day": 1, "language": "en", "enabled": True},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["schedule"] == "monthly"
    assert data["schedule_day"] == 1
    assert data["language"] == "en"
    assert data["enabled"] is True
