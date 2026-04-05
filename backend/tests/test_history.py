"""Tests — endpoint GET /clients/{id}/history."""

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import HealthCheck, Snapshot

from .conftest import login

pytestmark = pytest.mark.asyncio


async def _ingest(db: AsyncSession, client_id: str, sid: str, score: int, days_ago: int) -> None:
    """Insère un snapshot + health_check à N jours dans le passé."""
    collected = datetime.now(timezone.utc) - timedelta(days=days_ago)
    snap = Snapshot(
        client_id=client_id,
        system_sid=sid,
        system_host=f"{sid.lower()}-host",
        schema_version="2",
        collected_at=collected,
        payload={"system": {"rfcsysid": sid}},
    )
    db.add(snap)
    await db.flush()
    hc = HealthCheck(
        snapshot_id=snap.id,
        score=score,
        status="OK" if score >= 70 else "WARNING",
        indicators={},
    )
    db.add(hc)
    await db.commit()


async def test_history_basic(
    client: AsyncClient, admin_user, db: AsyncSession, test_client_obj
):
    token = await login(client, "admin@example.com", "AdminPass123!")
    cid = test_client_obj.id

    # Snapshots sur 3 jours pour 2 SIDs
    await _ingest(db, cid, "PRD", 90, days_ago=0)
    await _ingest(db, cid, "PRD", 85, days_ago=1)
    await _ingest(db, cid, "QAS", 70, days_ago=0)
    await _ingest(db, cid, "QAS", 65, days_ago=1)

    resp = await client.get(
        f"/api/v1/clients/{cid}/history?days=30",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()

    assert "by_sid" in data
    assert "daily_avg" in data
    assert "PRD" in data["by_sid"]
    assert "QAS" in data["by_sid"]
    assert len(data["by_sid"]["PRD"]) == 2
    assert len(data["daily_avg"]) >= 2


async def test_history_one_per_day(
    client: AsyncClient, admin_user, db: AsyncSession, test_client_obj
):
    """Deux snapshots le même jour → un seul score retourné (dernier)."""
    token = await login(client, "admin@example.com", "AdminPass123!")
    cid = test_client_obj.id

    now = datetime.now(timezone.utc)
    for score, minutes_ago in [(80, 120), (88, 30)]:
        snap = Snapshot(
            client_id=cid, system_sid="DEV",
            system_host="dev-host", schema_version="2",
            collected_at=now - timedelta(minutes=minutes_ago),
            payload={},
        )
        db.add(snap)
        await db.flush()
        db.add(HealthCheck(snapshot_id=snap.id, score=score,
                            status="OK", indicators={}))
        await db.commit()

    resp = await client.get(
        f"/api/v1/clients/{cid}/history?days=7",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    prd_history = resp.json()["by_sid"]["DEV"]
    assert len(prd_history) == 1           # un seul par jour
    assert prd_history[0]["score"] == 88   # le plus récent


async def test_history_empty(
    client: AsyncClient, admin_user, db: AsyncSession, test_client_obj
):
    """Aucun snapshot → réponse vide mais 200."""
    token = await login(client, "admin@example.com", "AdminPass123!")
    resp = await client.get(
        f"/api/v1/clients/{test_client_obj.id}/history",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["by_sid"] == {}
    assert data["daily_avg"] == []


async def test_history_requires_auth(
    client: AsyncClient, test_client_obj
):
    resp = await client.get(f"/api/v1/clients/{test_client_obj.id}/history")
    assert resp.status_code == 401


async def test_history_unassigned_consultant(
    client: AsyncClient, admin_user, regular_user, db: AsyncSession, test_client_obj
):
    """Consultant non assigné → 403."""
    await _ingest(db, test_client_obj.id, "PRD", 80, days_ago=0)
    token = await login(client, "consultant@example.com", "ConsultPass123!")
    resp = await client.get(
        f"/api/v1/clients/{test_client_obj.id}/history",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


async def test_history_days_param(
    client: AsyncClient, admin_user, db: AsyncSession, test_client_obj
):
    """days=7 n'inclut pas un snapshot à J-10."""
    token = await login(client, "admin@example.com", "AdminPass123!")
    cid = test_client_obj.id
    await _ingest(db, cid, "PRD", 90, days_ago=10)

    resp = await client.get(
        f"/api/v1/clients/{cid}/history?days=7",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert "PRD" not in resp.json()["by_sid"]


async def test_history_daily_avg_correct(
    client: AsyncClient, admin_user, db: AsyncSession, test_client_obj
):
    """La moyenne journalière est bien la moyenne des SIDs ce jour-là."""
    token = await login(client, "admin@example.com", "AdminPass123!")
    cid = test_client_obj.id
    await _ingest(db, cid, "PRD", 80, days_ago=0)
    await _ingest(db, cid, "QAS", 60, days_ago=0)

    resp = await client.get(
        f"/api/v1/clients/{cid}/history?days=7",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    today_avg = resp.json()["daily_avg"][-1]["score"]
    assert today_avg == 70  # (80+60)/2
