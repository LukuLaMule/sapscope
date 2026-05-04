"""
/api/v1/clients/{client_id}/systems/{sid}/benchmarks

Compare key metrics of a target system against the average of same-tier systems
across the entire SAPscope instance (all clients).
"""

import statistics
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_client_for_user, get_current_user
from ..database import get_db
from ..models import User

router = APIRouter(tags=["benchmarks"])

# Metrics to benchmark: (json_path_parts, label)
_METRICS: list[tuple[str, str]] = [
    ("stability.dumps_7d",              "Dumps ABAP (7j)"),
    ("stability.jobs_aborted_7d",       "Jobs abortés (7j)"),
    ("performance.wp_priv",             "WP privés (%)"),
    ("connectivity.trfc_errors",        "Erreurs tRFC"),
    ("transports.import_queue_count",   "File de transport"),
    ("security_ops.sap_all_count",      "Utilisateurs SAP_ALL"),
]


class BenchmarkItem(BaseModel):
    metric: str
    label: str
    system_value: float | None
    tier_avg: float | None
    tier_median: float | None
    peer_count: int
    ratio: float | None
    status: str  # "good" | "warning" | "critical" | "unknown"


class BenchmarkResponse(BaseModel):
    sid: str
    tier: str
    items: list[BenchmarkItem]


def _extract(indicators: dict[str, Any], metric: str) -> float | None:
    """Navigate dot-separated path into indicators dict."""
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


def _status(system_value: float | None, tier_avg: float | None, peer_count: int) -> str:
    if peer_count < 2:
        return "unknown"
    if system_value is None or tier_avg is None:
        return "unknown"
    # All metrics: higher = worse
    if system_value == 0 or tier_avg == 0:
        return "good" if system_value == 0 else "critical"
    ratio = system_value / tier_avg
    if ratio <= 1.2:
        return "good"
    elif ratio <= 2.5:
        return "warning"
    return "critical"


@router.get(
    "/api/v1/clients/{client_id}/systems/{sid}/benchmarks",
    response_model=BenchmarkResponse,
)
async def get_benchmarks(
    client_id: str,
    sid: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Compare the target system's metrics against the average of same-tier systems
    across all clients in the instance.
    """
    # Verify the user has access to this client
    await get_client_for_user(client_id, user, db)

    # Fetch latest snapshot + indicators for the target system
    target_row = await db.execute(
        text("""
            SELECT DISTINCT ON (s.client_id, s.system_sid)
                s.system_sid,
                s.payload->>'tier' AS tier,
                hc.indicators
            FROM snapshots s
            JOIN health_checks hc ON hc.snapshot_id = s.id
            WHERE s.client_id = :client_id
              AND s.system_sid = :sid
            ORDER BY s.client_id, s.system_sid, s.collected_at DESC
        """),
        {"client_id": client_id, "sid": sid.upper()},
    )
    target = target_row.mappings().one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="No snapshot found for this system")

    tier: str = target["tier"] or "unknown"
    target_indicators: dict[str, Any] = target["indicators"] or {}

    if not tier or tier == "unknown":
        # No tier data — return all unknowns
        items = [
            BenchmarkItem(
                metric=metric,
                label=label,
                system_value=_extract(target_indicators, metric),
                tier_avg=None,
                tier_median=None,
                peer_count=0,
                ratio=None,
                status="unknown",
            )
            for metric, label in _METRICS
        ]
        return BenchmarkResponse(sid=sid.upper(), tier=tier, items=items)

    # Fetch the latest snapshot of every (client_id, system_sid) with the same tier
    peers_result = await db.execute(
        text("""
            SELECT DISTINCT ON (s.client_id, s.system_sid)
                s.client_id,
                s.system_sid,
                hc.indicators
            FROM snapshots s
            JOIN health_checks hc ON hc.snapshot_id = s.id
            WHERE s.payload->>'tier' = :tier
            ORDER BY s.client_id, s.system_sid, s.collected_at DESC
        """),
        {"tier": tier},
    )
    peers = list(peers_result.mappings())

    # Build one BenchmarkItem per metric
    items: list[BenchmarkItem] = []
    for metric, label in _METRICS:
        system_value = _extract(target_indicators, metric)

        # Collect peer values (all peers of same tier, including target itself)
        peer_values: list[float] = []
        for peer in peers:
            v = _extract(peer["indicators"] or {}, metric)
            if v is not None:
                peer_values.append(v)

        peer_count = len(peer_values)

        if peer_count >= 1:
            tier_avg = statistics.mean(peer_values)
            tier_median = statistics.median(peer_values)
        else:
            tier_avg = None
            tier_median = None

        if system_value is not None and tier_avg is not None and tier_avg > 0:
            ratio = system_value / tier_avg
        elif system_value == 0 and tier_avg == 0:
            ratio = 1.0
        else:
            ratio = None

        st = _status(system_value, tier_avg, peer_count)

        items.append(BenchmarkItem(
            metric=metric,
            label=label,
            system_value=system_value,
            tier_avg=round(tier_avg, 2) if tier_avg is not None else None,
            tier_median=round(tier_median, 2) if tier_median is not None else None,
            peer_count=peer_count,
            ratio=round(ratio, 3) if ratio is not None else None,
            status=st,
        ))

    return BenchmarkResponse(sid=sid.upper(), tier=tier, items=items)
