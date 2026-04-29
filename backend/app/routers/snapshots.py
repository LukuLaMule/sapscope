"""
/api/v1/snapshots

POST   (no client_id param)  — agent token (write-only)
GET    /clients/{id}/snapshots — consultant JWT (read-only)
GET    /clients/{id}/snapshots/{snap_id}
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_client_for_agent, get_client_for_user, get_current_user
from ..database import get_db
from .. import health_scorer
from ..limiter import limiter
from ..models import Client, HealthCheck, Snapshot, User, UserClient
from ..schemas import ClientOut, HealthOut, SnapshotCreated, SnapshotDetail, SnapshotIn, SnapshotSummary

router = APIRouter(tags=["snapshots"])


# ── Client list (consultant-accessible) ──────────────────────────────────────

@router.get("/api/v1/clients", response_model=list[ClientOut])
async def list_my_clients(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
):
    """Returns clients visible to the current user (all for admins, assigned only for consultants)."""
    if user.is_admin:
        rows = await db.execute(select(Client).order_by(Client.name).limit(limit))
    else:
        rows = await db.execute(
            select(Client)
            .join(UserClient, UserClient.client_id == Client.id)
            .where(UserClient.user_id == user.id)
            .order_by(Client.name)
            .limit(limit)
        )
    return [ClientOut(id=c.id, name=c.name, created_at=c.created_at) for c in rows.scalars()]


# ── Agent write ───────────────────────────────────────────────────────────────

@router.post("/api/v1/snapshots", response_model=SnapshotCreated, status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def ingest_snapshot(
    request: Request,
    body: SnapshotIn,
    client: Client = Depends(get_client_for_agent),
    db: AsyncSession = Depends(get_db),
):
    """Agent endpoint — write-only, authenticated by agent token."""
    system = body.system
    sid  = str(system.get("rfcsysid", "")).strip() or "UNKNOWN"
    host = str(system.get("rfchost", "")).strip() or "unknown"

    snap = Snapshot(
        client_id=client.id,
        system_sid=sid[:10],
        system_host=host[:255],
        schema_version=str(body.schema_version)[:10],
        collected_at=body.collected_at,
        payload=body.model_dump(mode="json"),
    )
    db.add(snap)
    await db.flush()   # get snap.id before committing

    result = health_scorer.compute(body.health, body.security, body.transports, body.db_stats)
    hc = HealthCheck(
        snapshot_id=snap.id,
        score=result["score"],
        status=result["status"],
        indicators=result["indicators"],
    )
    db.add(hc)
    await db.commit()
    await db.refresh(snap)
    return SnapshotCreated(id=snap.id, received_at=snap.received_at)


# ── Consultant read ───────────────────────────────────────────────────────────

@router.get("/api/v1/clients/{client_id}/snapshots", response_model=list[SnapshotSummary])
async def list_snapshots(
    client_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    sid: Annotated[str | None, Query(description="Filter by SAP SID")] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    client = await get_client_for_user(client_id, user, db)

    q = (
        select(Snapshot)
        .options(selectinload(Snapshot.health_check))
        .where(Snapshot.client_id == client.id)
    )
    if sid:
        q = q.where(Snapshot.system_sid == sid.upper())
    q = q.order_by(Snapshot.collected_at.desc()).limit(limit).offset(offset)

    rows = await db.execute(q)
    return [_to_summary(s) for s in rows.scalars()]


@router.get("/api/v1/clients/{client_id}/snapshots/{snapshot_id}", response_model=SnapshotDetail)
async def get_snapshot(
    client_id: str,
    snapshot_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    client = await get_client_for_user(client_id, user, db)

    row = await db.execute(
        select(Snapshot)
        .options(selectinload(Snapshot.health_check))
        .where(
            Snapshot.id == snapshot_id,
            Snapshot.client_id == client.id,
        )
    )
    snap = row.scalar_one_or_none()
    if snap is None:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return _to_detail(snap)


# ── helpers ───────────────────────────────────────────────────────────────────

def _to_summary(s: Snapshot) -> SnapshotSummary:
    co  = s.payload.get("custom_objects") or {}
    sys = s.payload.get("system") or {}
    hc  = s.health_check

    # SAP_BASIS SP level (extrelease "0016" → "16")
    basis_sp = None
    for comp in s.payload.get("components") or []:
        if comp.get("component") == "SAP_BASIS":
            raw = (comp.get("extrelease") or "").lstrip("0")
            basis_sp = raw or None
            break

    # Security summary
    sec = s.payload.get("security") or {}
    default_users  = sec.get("default_users_active") or []
    sap_all_users  = sec.get("sap_all_users") or []
    security_crit  = bool(default_users or sap_all_users)

    # Operations summary
    trans       = s.payload.get("transports") or {}
    bgjobs      = s.payload.get("background_jobs") or {}
    upd         = s.payload.get("update_info") or {}
    spool       = s.payload.get("spool") or {}
    perf        = s.payload.get("performance") or {}
    jobs_err    = s.payload.get("jobs_error_24h") or {}
    sm12        = s.payload.get("sm12_locks") or {}
    st22        = s.payload.get("st22_24h") or {}
    qrfc        = s.payload.get("qrfc_queues") or {}

    return SnapshotSummary(
        id=s.id,
        system_sid=s.system_sid,
        system_host=s.system_host,
        collected_at=s.collected_at,
        received_at=s.received_at,
        components_count=len(s.payload.get("components", [])),
        support_packages_count=len(s.payload.get("support_packages", [])),
        custom_objects_count=co.get("total", 0),
        system_release=sys.get("rfcsaprl") or None,
        db_type=sys.get("rfcdbsys") or None,
        health=HealthOut(score=hc.score, status=hc.status, indicators=hc.indicators) if hc else None,
        kernel_release=sys.get("rfckernrl") or None,
        kernel_patch=sys.get("rfckernpatch") or None,
        basis_sp=basis_sp,
        unicode=True if sys.get("rfcunicode") == "U" else (False if sys.get("rfcunicode") == "" else None),
        installation_no=sys.get("rfcintno") or None,
        security_critical=security_crit,
        security_sap_all_count=len(sap_all_users),
        security_default_users=default_users,
        transport_queue=trans.get("import_queue_count"),
        bg_jobs_delayed=bgjobs.get("delayed_count"),
        update_errors=upd.get("update_errors"),
        spool_pending=spool.get("pending_count"),
        avg_response_ms=perf.get("avg_response_ms"),
        jobs_error_24h_count=jobs_err.get("count"),
        jobs_error_24h_list=jobs_err.get("jobs") or [],
        sm12_locks_count=sm12.get("count"),
        sm12_locks_list=sm12.get("locks") or [],
        st22_count_24h=st22.get("count"),
        st22_list_24h=st22.get("dumps") or [],
        qrfc_outbound_total=qrfc.get("outbound_total"),
        qrfc_outbound_errors=qrfc.get("outbound_errors"),
        qrfc_inbound_total=qrfc.get("inbound_total"),
        qrfc_inbound_errors=qrfc.get("inbound_errors"),
    )


def _to_detail(s: Snapshot) -> SnapshotDetail:
    return SnapshotDetail(**_to_summary(s).model_dump(), payload=s.payload)
