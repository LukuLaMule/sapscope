"""
/api/v1/clients/{client_id}/report-config  — GET, PATCH
/api/v1/clients/{client_id}/report/pdf     — GET (download)
/api/v1/clients/{client_id}/report/send    — POST (send now)
"""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..auth import get_client_for_user, get_current_user
from ..database import get_db
from ..models import Analysis, Client, ClientReportConfig, HealthCheck, Snapshot, User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["reports"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class ReportConfigOut(BaseModel):
    client_id: str
    enabled: bool
    recipient_emails: list[str]
    schedule: str
    schedule_day: int
    language: str
    last_sent_at: datetime | None = None
    report_title: str | None = None
    include_health_domains: bool = True
    include_key_metrics: bool = True
    include_ai_analysis: bool = True


class ReportConfigPatch(BaseModel):
    enabled: bool | None = None
    recipient_emails: list[str] | None = None
    schedule: str | None = None             # daily | weekly | monthly
    schedule_day: int | None = None         # 0-6 (weekly) or 1-28 (monthly)
    language: str | None = None             # fr | en
    report_title: str | None = None
    include_health_domains: bool | None = None
    include_key_metrics: bool | None = None
    include_ai_analysis: bool | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _config_to_out(cfg: ClientReportConfig) -> ReportConfigOut:
    return ReportConfigOut(
        client_id=cfg.client_id,
        enabled=cfg.enabled,
        recipient_emails=cfg.recipient_emails or [],
        schedule=cfg.schedule,
        schedule_day=cfg.schedule_day,
        language=cfg.language,
        last_sent_at=cfg.last_sent_at,
        report_title=cfg.report_title,
        include_health_domains=cfg.include_health_domains,
        include_key_metrics=cfg.include_key_metrics,
        include_ai_analysis=cfg.include_ai_analysis,
    )


async def _get_or_create_config(client_id: str, db: AsyncSession) -> ClientReportConfig:
    row = await db.execute(
        select(ClientReportConfig).where(ClientReportConfig.client_id == client_id)
    )
    cfg = row.scalar_one_or_none()
    if cfg is None:
        cfg = ClientReportConfig(client_id=client_id)
        db.add(cfg)
        await db.commit()
        await db.refresh(cfg)
    return cfg


async def _collect_snapshots_data(client_id: str, db: AsyncSession, hours: int = 36) -> list[dict]:
    """
    Retourne le dernier snapshot par SID (dans les dernières `hours` heures),
    enrichi du health check et de l'analyse IA.
    Inclut également le score du snapshot précédent pour calculer la tendance.
    """
    since = datetime.now(timezone.utc) - timedelta(hours=hours)

    # Sous-requête : max(received_at) par SID dans la fenêtre
    from sqlalchemy import func as sqlfunc
    subq = (
        select(
            Snapshot.system_sid,
            sqlfunc.max(Snapshot.received_at).label("max_recv"),
        )
        .where(
            Snapshot.client_id == client_id,
            Snapshot.received_at >= since,
        )
        .group_by(Snapshot.system_sid)
        .subquery()
    )

    q = (
        select(Snapshot, HealthCheck, Analysis)
        .outerjoin(HealthCheck, HealthCheck.snapshot_id == Snapshot.id)
        .outerjoin(Analysis,    Analysis.snapshot_id    == Snapshot.id)
        .join(
            subq,
            (Snapshot.system_sid  == subq.c.system_sid)
            & (Snapshot.received_at == subq.c.max_recv),
        )
        .where(Snapshot.client_id == client_id)
        .order_by(Snapshot.system_sid)
    )

    rows = await db.execute(q)
    current_snaps = list(rows.tuples())  # [(Snapshot, HealthCheck|None, Analysis|None)]

    result = []
    for snap, hc, analysis in current_snaps:
        # Previous snapshot for this SID (older than current)
        prev_q = (
            select(HealthCheck)
            .join(Snapshot, Snapshot.id == HealthCheck.snapshot_id)
            .where(
                Snapshot.client_id  == client_id,
                Snapshot.system_sid == snap.system_sid,
                Snapshot.received_at < snap.received_at,
            )
            .order_by(Snapshot.received_at.desc())
            .limit(1)
        )
        prev_row = await db.execute(prev_q)
        prev_hc  = prev_row.scalar_one_or_none()

        result.append({
            "sid":           snap.system_sid,
            "score":         hc.score  if hc else None,
            "status":        hc.status if hc else "UNKNOWN",
            "indicators":    hc.indicators if hc else {},
            "analysis":      analysis.content if analysis else None,
            "snapshot_date": snap.collected_at.strftime("%d/%m/%Y") if snap.collected_at else None,
            "prev_score":    prev_hc.score if prev_hc else None,
        })

    return result


# ── Report config endpoints ───────────────────────────────────────────────────

@router.get("/api/v1/clients/{client_id}/report-config", response_model=ReportConfigOut)
async def get_report_config(
    client_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_client_for_user(client_id, user, db)
    cfg = await _get_or_create_config(client_id, db)
    return _config_to_out(cfg)


@router.patch("/api/v1/clients/{client_id}/report-config", response_model=ReportConfigOut)
async def update_report_config(
    client_id: str,
    body: ReportConfigPatch,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Only admins can configure report sending
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")

    await get_client_for_user(client_id, user, db)
    cfg = await _get_or_create_config(client_id, db)

    if body.enabled is not None:
        cfg.enabled = body.enabled
    if body.recipient_emails is not None:
        cfg.recipient_emails = body.recipient_emails
    if body.schedule is not None:
        if body.schedule not in ("daily", "weekly", "monthly"):
            raise HTTPException(status_code=400, detail="schedule must be daily | weekly | monthly")
        cfg.schedule = body.schedule
    if body.schedule_day is not None:
        cfg.schedule_day = body.schedule_day
    if body.language is not None:
        if body.language not in ("fr", "en"):
            raise HTTPException(status_code=400, detail="language must be fr | en")
        cfg.language = body.language
    if body.report_title is not None:
        cfg.report_title = body.report_title.strip() or None
    if body.include_health_domains is not None:
        cfg.include_health_domains = body.include_health_domains
    if body.include_key_metrics is not None:
        cfg.include_key_metrics = body.include_key_metrics
    if body.include_ai_analysis is not None:
        cfg.include_ai_analysis = body.include_ai_analysis

    await db.commit()
    await db.refresh(cfg)

    return _config_to_out(cfg)


# ── PDF download endpoint ─────────────────────────────────────────────────────

@router.get("/api/v1/clients/{client_id}/report/pdf")
async def download_client_report_pdf(
    client_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Génère et retourne le PDF du rapport de santé SAP pour un client."""
    client = await get_client_for_user(client_id, user, db)

    # Récupère la config pour connaître la langue
    cfg = await _get_or_create_config(client_id, db)
    language = cfg.language

    snapshots_data = await _collect_snapshots_data(client_id, db, hours=36)

    if not snapshots_data:
        raise HTTPException(
            status_code=404,
            detail="Aucun snapshot disponible dans les dernières 36 heures",
        )

    from ..pdf_report import generate_client_pdf

    report_date = datetime.now(timezone.utc).strftime("%d/%m/%Y")
    sections = {
        "health_domains": cfg.include_health_domains,
        "key_metrics":    cfg.include_key_metrics,
        "ai_analysis":    cfg.include_ai_analysis,
    }

    try:
        pdf_bytes = await generate_client_pdf(
            client=client,
            snapshots_data=snapshots_data,
            language=language,
            report_date=report_date,
            report_title=cfg.report_title,
            sections=sections,
        )
    except Exception:
        logger.exception("Erreur lors de la génération du PDF pour client %s", client_id)
        raise HTTPException(status_code=500, detail="Erreur lors de la génération du PDF")

    safe_name = client.name.replace(" ", "_").replace("/", "-")
    filename = f"rapport-{safe_name}-{report_date.replace('/', '-')}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Send now endpoint ─────────────────────────────────────────────────────────

@router.post("/api/v1/clients/{client_id}/report/send", status_code=status.HTTP_202_ACCEPTED)
async def send_report_now(
    client_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Envoie immédiatement le rapport PDF par email aux destinataires configurés."""
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")

    client = await get_client_for_user(client_id, user, db)
    cfg = await _get_or_create_config(client_id, db)

    if not cfg.recipient_emails:
        raise HTTPException(
            status_code=400,
            detail="Aucun destinataire configuré",
        )

    snapshots_data = await _collect_snapshots_data(client_id, db, hours=36)
    if not snapshots_data:
        raise HTTPException(
            status_code=404,
            detail="Aucun snapshot disponible dans les dernières 36 heures",
        )

    from ..pdf_report import generate_client_pdf
    from ..mailer import send_report_pdf_email

    report_date = datetime.now(timezone.utc).strftime("%d/%m/%Y")
    sections = {
        "health_domains": cfg.include_health_domains,
        "key_metrics":    cfg.include_key_metrics,
        "ai_analysis":    cfg.include_ai_analysis,
    }

    try:
        pdf_bytes = await generate_client_pdf(
            client=client,
            snapshots_data=snapshots_data,
            language=cfg.language,
            report_date=report_date,
            report_title=cfg.report_title,
            sections=sections,
        )
    except Exception:
        logger.exception("Erreur lors de la génération du PDF pour client %s", client_id)
        raise HTTPException(status_code=500, detail="Erreur lors de la génération du PDF")

    await send_report_pdf_email(
        recipients=cfg.recipient_emails,
        client_name=client.name,
        pdf_bytes=pdf_bytes,
        report_date=report_date,
        sender_name=client.name,
    )

    # Update last_sent_at
    cfg.last_sent_at = datetime.now(timezone.utc)
    await db.commit()

    return {"detail": f"Rapport envoyé à {len(cfg.recipient_emails)} destinataire(s)"}
