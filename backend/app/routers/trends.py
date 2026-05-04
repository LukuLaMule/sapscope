"""
/api/v1/clients/{client_id}/systems/{sid}/trends

Analyse les tendances prédictives sur les métriques clés d'un système SAP
en s'appuyant sur les 30 derniers snapshots et une régression linéaire simple.
"""

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_client_for_user, get_current_user
from ..database import get_db
from ..models import User

router = APIRouter(tags=["trends"])

# ── Définition des métriques à analyser ──────────────────────────────────────

_METRICS: list[dict] = [
    {
        "metric":    "infrastructure.max_used_pct",
        "label":     "Occupation max (tablespaces/mémoire)",
        "threshold": 90.0,
    },
    {
        "metric":    "stability.dumps_7d",
        "label":     "Dumps ABAP (7j)",
        "threshold": 5.0,
    },
    {
        "metric":    "stability.jobs_aborted_7d",
        "label":     "Jobs abortés (7j)",
        "threshold": 3.0,
    },
    {
        "metric":    "performance.wp_priv",
        "label":     "Work processes privés (%)",
        "threshold": 80.0,
    },
]


# ── Schémas de réponse ────────────────────────────────────────────────────────

class TrendItem(BaseModel):
    metric: str
    label: str
    current_value: float | None
    values: list[float]
    dates: list[str]
    slope_per_day: float | None
    trend: str                    # "stable" | "up" | "down"
    days_to_threshold: int | None
    threshold: float | None
    status: str                   # "ok" | "warning" | "critical"


class TrendsResponse(BaseModel):
    sid: str
    snapshot_count: int
    items: list[TrendItem]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract(indicators: dict[str, Any], metric: str) -> float | None:
    """Navigue dans le chemin pointé du dict indicators."""
    parts = metric.split(".")
    node: Any = indicators
    for part in parts:
        if not isinstance(node, dict):
            return None
        node = node.get(part)
    if node is None:
        return None
    try:
        return float(node)
    except (TypeError, ValueError):
        return None


def _linear_regression(points: list[tuple[float, float]]) -> tuple[float | None, float | None]:
    n = len(points)
    if n < 3:
        return None, None
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    sx, sy = sum(xs), sum(ys)
    sxx = sum(x * x for x in xs)
    sxy = sum(x * y for x, y in zip(xs, ys))
    denom = n * sxx - sx * sx
    if denom == 0:
        return 0.0, sy / n
    slope = (n * sxy - sx * sy) / denom
    intercept = (sy - slope * sx) / n
    return slope, intercept


def _build_trend_item(meta: dict, points: list[tuple[float, float, str]]) -> TrendItem:
    """
    Construit un TrendItem depuis la série temporelle.
    points = [(timestamp_unix, value, iso_date_str), ...]
    """
    metric     = meta["metric"]
    label      = meta["label"]
    threshold  = meta.get("threshold")

    if not points:
        return TrendItem(
            metric=metric,
            label=label,
            current_value=None,
            values=[],
            dates=[],
            slope_per_day=None,
            trend="stable",
            days_to_threshold=None,
            threshold=threshold,
            status="ok",
        )

    # Série triée par date croissante (déjà triée par la requête)
    values = [p[1] for p in points]
    dates  = [p[2] for p in points]
    current_value = values[-1]

    # Régression linéaire sur (timestamp_unix, value)
    reg_points = [(p[0], p[1]) for p in points]
    slope_sec, _intercept = _linear_regression(reg_points)

    # Convertir slope de unités/seconde → unités/jour
    slope_per_day: float | None = None
    if slope_sec is not None:
        slope_per_day = round(slope_sec * 86400, 6)

    # Tendance
    if slope_per_day is None:
        trend = "stable"
    elif slope_per_day > 0.1:
        trend = "up"
    elif slope_per_day < -0.1:
        trend = "down"
    else:
        trend = "stable"

    # Jours avant seuil
    days_to_threshold: int | None = None
    if threshold is not None and slope_per_day is not None and slope_per_day > 0:
        remaining = threshold - current_value
        if remaining <= 0:
            days_to_threshold = 0  # déjà dépassé
        else:
            days = remaining / slope_per_day
            if days <= 365:
                days_to_threshold = max(0, int(days))

    # Statut
    if days_to_threshold is None:
        status = "ok"
    elif days_to_threshold < 7:
        status = "critical"
    elif days_to_threshold < 30:
        status = "warning"
    else:
        status = "ok"

    return TrendItem(
        metric=metric,
        label=label,
        current_value=round(current_value, 3),
        values=[round(v, 3) for v in values],
        dates=dates,
        slope_per_day=slope_per_day,
        trend=trend,
        days_to_threshold=days_to_threshold,
        threshold=threshold,
        status=status,
    )


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.get(
    "/api/v1/clients/{client_id}/systems/{sid}/trends",
    response_model=TrendsResponse,
)
async def get_trends(
    client_id: str,
    sid: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Retourne les tendances prédictives pour les métriques clés d'un système SAP.
    Analyse les 30 derniers snapshots via régression linéaire simple (stdlib uniquement).
    """
    # Vérification d'accès
    await get_client_for_user(client_id, user, db)

    # Récupérer les 30 derniers snapshots avec leurs health_checks
    result = await db.execute(
        text("""
            SELECT
                s.collected_at,
                s.payload,
                hc.indicators
            FROM snapshots s
            JOIN health_checks hc ON hc.snapshot_id = s.id
            WHERE s.client_id = :client_id
              AND s.system_sid = :sid
            ORDER BY s.collected_at DESC
            LIMIT 30
        """),
        {"client_id": client_id, "sid": sid.upper()},
    )
    rows = list(result.mappings())

    if not rows:
        raise HTTPException(status_code=404, detail="No snapshot found for this system")

    # Remettre en ordre croissant pour la série temporelle
    rows = list(reversed(rows))

    items: list[TrendItem] = []
    for meta in _METRICS:
        metric = meta["metric"]
        points: list[tuple[float, float, str]] = []

        for row in rows:
            indicators = row["indicators"] or {}
            collected_at = row["collected_at"]

            value = _extract(indicators, metric)

            # Fallback pour infrastructure.max_used_pct : chercher dans payload health.tablespaces
            if value is None and metric == "infrastructure.max_used_pct":
                payload = row["payload"] or {}
                tablespaces = payload.get("health", {}).get("tablespaces", [])
                if isinstance(tablespaces, list) and tablespaces:
                    try:
                        value = max(float(ts.get("used_pct", 0)) for ts in tablespaces)
                    except (TypeError, ValueError):
                        value = None

            if value is None:
                continue

            # Convertir collected_at en timestamp unix
            if isinstance(collected_at, datetime):
                if collected_at.tzinfo is None:
                    collected_at = collected_at.replace(tzinfo=timezone.utc)
                ts = collected_at.timestamp()
                iso = collected_at.strftime("%Y-%m-%dT%H:%M:%SZ")
            else:
                # Chaîne ISO depuis la DB
                try:
                    dt = datetime.fromisoformat(str(collected_at).replace("Z", "+00:00"))
                    ts = dt.timestamp()
                    iso = dt.strftime("%Y-%m-%dT%H:%M:%SZ")
                except ValueError:
                    continue

            points.append((ts, value, iso))

        items.append(_build_trend_item(meta, points))

    return TrendsResponse(
        sid=sid.upper(),
        snapshot_count=len(rows),
        items=items,
    )
