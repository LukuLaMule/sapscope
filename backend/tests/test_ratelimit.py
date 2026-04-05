"""
Tests — rate limiting.

Le limiter slowapi est désactivé globalement dans conftest (RATELIMIT_ENABLED=false
est setté avant l'import de l'app, donc limiter.enabled=False au boot du test).

La fixture enable_ratelimit patche l'attribut directement et vide le storage
in-memory pour que les compteurs soient propres entre tests.
"""

from unittest.mock import MagicMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.limiter import limiter

@pytest.fixture()
def enable_ratelimit():
    """Active le rate limiting et vide le storage entre tests."""
    old_enabled = limiter.enabled
    limiter.enabled = True

    # Vide le storage in-memory pour isoler les compteurs entre tests
    storage = limiter._storage
    if hasattr(storage, "storage"):          # MemoryStorage
        storage.storage.clear()
    elif hasattr(storage, "_storage"):
        storage._storage.clear()

    yield

    limiter.enabled = old_enabled
    # Re-vide après le test
    if hasattr(storage, "storage"):
        storage.storage.clear()
    elif hasattr(storage, "_storage"):
        storage._storage.clear()


@pytest.mark.asyncio
async def test_login_rate_limit(client: AsyncClient, admin_user, enable_ratelimit):
    """Login bloqué après 10 tentatives par minute."""
    payload = {"email": "admin@example.com", "password": "WrongPassword!"}

    for _ in range(10):
        await client.post("/api/v1/auth/login", json=payload)

    resp = await client.post("/api/v1/auth/login", json=payload)
    assert resp.status_code == 429


@pytest.mark.asyncio
async def test_register_rate_limit(client: AsyncClient, enable_ratelimit):
    """Register bloqué après 5 tentatives par minute."""
    for i in range(5):
        await client.post(
            "/api/v1/auth/register",
            json={"email": f"spam{i}@test.com", "password": "Password123!"},
        )

    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "spam6@test.com", "password": "Password123!"},
    )
    assert resp.status_code == 429


def test_snapshot_route_has_rate_limit():
    """Vérifie que l'endpoint ingest_snapshot est bien enregistré dans le limiter."""
    route_name = "app.routers.snapshots.ingest_snapshot"
    assert route_name in limiter._route_limits, (
        f"La route {route_name} n'a pas de rate limit configuré"
    )
    limit_strings = [str(lim.limit) for lim in limiter._route_limits[route_name]]
    assert any("60" in s for s in limit_strings), (
        f"Attendu 60/minute, trouvé : {limit_strings}"
    )


def test_analysis_route_has_rate_limit():
    """Vérifie que l'endpoint run_analysis est bien enregistré dans le limiter."""
    route_name = "app.routers.analysis.run_analysis"
    assert route_name in limiter._route_limits, (
        f"La route {route_name} n'a pas de rate limit configuré"
    )
    limit_strings = [str(lim.limit) for lim in limiter._route_limits[route_name]]
    assert any("20" in s for s in limit_strings), (
        f"Attendu 20/hour, trouvé : {limit_strings}"
    )


def test_auth_routes_have_rate_limits():
    """Vérifie que les routes auth sensibles ont bien leurs limites."""
    expected = {
        "app.routers.auth.login":           "10",
        "app.routers.auth.register":        "5",
        "app.routers.auth.forgot_password": "5",
        "app.routers.auth.reset_password":  "10",
    }
    for route_name, expected_count in expected.items():
        assert route_name in limiter._route_limits, f"{route_name} sans rate limit"
        limit_strings = [str(lim.limit) for lim in limiter._route_limits[route_name]]
        assert any(expected_count in s for s in limit_strings), (
            f"{route_name}: attendu {expected_count}, trouvé {limit_strings}"
        )
