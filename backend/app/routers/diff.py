"""
GET /api/v1/clients/{client_id}/snapshots/{snapshot_id}/diff?base={snap_id}

Returns a structured comparison between two snapshots of the same SID.
snap_a = snapshot_id  (newer, "after")
snap_b = base         (older, "before")
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_client_for_user, get_current_user
from ..database import get_db
from ..models import Snapshot, User

router = APIRouter(tags=["diff"])


@router.get("/api/v1/clients/{client_id}/snapshots/{snapshot_id}/diff")
async def get_diff(
    client_id: str,
    snapshot_id: str,
    base: str = Query(..., description="Snapshot ID to compare against (the older one)"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    client = await get_client_for_user(client_id, user, db)

    async def _load(sid: str) -> Snapshot:
        row = await db.execute(
            select(Snapshot).where(Snapshot.id == sid, Snapshot.client_id == client.id)
        )
        snap = row.scalar_one_or_none()
        if snap is None:
            raise HTTPException(status_code=404, detail=f"Snapshot {sid} not found")
        return snap

    snap_a = await _load(snapshot_id)
    snap_b = await _load(base)

    if snap_a.system_sid != snap_b.system_sid:
        raise HTTPException(
            status_code=400,
            detail="Cannot diff snapshots from different SAP systems",
        )

    return _compute_diff(snap_a, snap_b)


# ── Diff computation ──────────────────────────────────────────────────────────

_SYSTEM_FIELDS = [
    ("rfcsaprl",  "SAP Release"),
    ("rfckernrl", "Kernel"),
    ("rfcopsys",  "OS"),
    ("rfcdbsys",  "DB Engine"),
    ("rfcdbhost", "DB Host"),
    ("rfchost",   "App Server"),
]


def _compute_diff(snap_a: Snapshot, snap_b: Snapshot) -> dict:
    pa = snap_a.payload
    pb = snap_b.payload

    # ── System-level field changes ────────────────────────────────────────────
    sys_changes = []
    for field, label in _SYSTEM_FIELDS:
        va = pa.get("system", {}).get(field, "")
        vb = pb.get("system", {}).get(field, "")
        if va != vb:
            sys_changes.append({"field": field, "label": label, "old": vb, "new": va})

    # ── Components ────────────────────────────────────────────────────────────
    ca = {c["component"]: c for c in pa.get("components", [])}
    cb = {c["component"]: c for c in pb.get("components", [])}

    comp_added   = sorted([ca[k] for k in ca if k not in cb], key=lambda x: x["component"])
    comp_removed = sorted([cb[k] for k in cb if k not in ca], key=lambda x: x["component"])
    comp_changed = []
    for k in sorted(ca):
        if k not in cb:
            continue
        a, b = ca[k], cb[k]
        if a.get("extrelease") != b.get("extrelease") or a.get("release") != b.get("release"):
            comp_changed.append({
                "component":  k,
                "release":    {"old": b.get("release",    ""), "new": a.get("release",    "")},
                "extrelease": {"old": b.get("extrelease", ""), "new": a.get("extrelease", "")},
            })

    # ── Support packages (latest patch per component) ─────────────────────────
    def _latest(sps: list) -> dict:
        out: dict = {}
        for sp in sps:
            comp = sp.get("component", "")
            if comp not in out or sp.get("patch", "") > out[comp].get("patch", ""):
                out[comp] = sp
        return out

    sa = _latest(pa.get("support_packages", []))
    sb = _latest(pb.get("support_packages", []))

    sp_added   = sorted([sa[k] for k in sa if k not in sb], key=lambda x: x["component"])
    sp_removed = sorted([sb[k] for k in sb if k not in sa], key=lambda x: x["component"])
    sp_changed = []
    for k in sorted(sa):
        if k not in sb:
            continue
        a, b = sa[k], sb[k]
        if a.get("patch") != b.get("patch"):
            sp_changed.append({
                "component": k,
                "patch":   {"old": b.get("patch",   ""), "new": a.get("patch",   "")},
                "applied": {"old": b.get("applied", ""), "new": a.get("applied", "")},
            })

    # ── Custom objects delta ──────────────────────────────────────────────────
    co_a = pa.get("custom_objects", {})
    co_b = pb.get("custom_objects", {})
    total_delta = co_a.get("total", 0) - co_b.get("total", 0)

    bt_a = co_a.get("by_type", {})
    bt_b = co_b.get("by_type", {})
    by_type_delta = {
        t: bt_a.get(t, 0) - bt_b.get(t, 0)
        for t in set(bt_a) | set(bt_b)
        if bt_a.get(t, 0) != bt_b.get(t, 0)
    }
    by_type_delta = dict(sorted(by_type_delta.items(), key=lambda x: -abs(x[1])))

    return {
        "snap_a": {
            "id": snap_a.id,
            "collected_at": snap_a.collected_at.isoformat(),
            "system_sid":   snap_a.system_sid,
        },
        "snap_b": {
            "id": snap_b.id,
            "collected_at": snap_b.collected_at.isoformat(),
            "system_sid":   snap_b.system_sid,
        },
        "system_changes":   sys_changes,
        "components":       {"added": comp_added, "removed": comp_removed, "changed": comp_changed},
        "support_packages": {"added": sp_added,   "removed": sp_removed,   "changed": sp_changed},
        "custom_objects":   {"total_delta": total_delta, "by_type_delta": by_type_delta},
    }
