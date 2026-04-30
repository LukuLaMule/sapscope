"""
Envoi automatique planifiable des rapports PDF SAP Basis.
Appelé toutes les heures par APScheduler.

Logique de déclenchement :
  - daily   : envoie chaque jour (schedule_day ignoré)
  - weekly  : envoie quand weekday() == schedule_day (0=lundi … 6=dimanche)
  - monthly : envoie quand day == schedule_day (1-28)

On vérifie également que last_sent_at n'est pas dans les dernières 20h
pour éviter les doubles envois en cas de redémarrage.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from .database import SessionLocal
from .models import Client, ClientReportConfig, HealthCheck, Snapshot, Analysis

logger = logging.getLogger(__name__)


def _should_send(cfg: ClientReportConfig, now: datetime) -> bool:
    """Détermine si le rapport doit être envoyé maintenant."""
    if not cfg.enabled:
        return False
    if not cfg.recipient_emails:
        return False

    # Anti-doublon : pas d'envoi si last_sent_at < 20h
    if cfg.last_sent_at is not None:
        if (now - cfg.last_sent_at) < timedelta(hours=20):
            return False

    schedule = cfg.schedule

    if schedule == "daily":
        return True

    if schedule == "weekly":
        # schedule_day : 0=lundi, 6=dimanche (ISO weekday - 1)
        return now.weekday() == cfg.schedule_day

    if schedule == "monthly":
        # schedule_day : 1-28
        day = cfg.schedule_day if cfg.schedule_day >= 1 else 1
        return now.day == day

    return False


async def _collect_snapshots_data(client_id: str, db) -> list[dict]:
    """
    Identique à routers/reports.py — retourne le dernier snapshot
    par SID dans les 36 dernières heures.
    """
    from sqlalchemy import func as sqlfunc

    since = datetime.now(timezone.utc) - timedelta(hours=36)

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
    current_snaps = list(rows.tuples())

    result = []
    for snap, hc, analysis in current_snaps:
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


async def send_scheduled_reports() -> None:
    """
    Point d'entrée du scheduler APScheduler.
    Tourne toutes les heures — vérifie quels clients ont besoin d'un rapport.
    """
    from .mailer import send_report_pdf_email
    from .pdf_report import generate_client_pdf
    from .settings import settings

    if not settings.smtp_host or not settings.smtp_user:
        logger.debug("SMTP non configuré — rapports schedulés ignorés")
        return

    now = datetime.now(timezone.utc)
    report_date = now.strftime("%d/%m/%Y")

    logger.info("Vérification des rapports schedulés (%s)…", report_date)

    async with SessionLocal() as db:
        # Récupère toutes les configs activées
        rows = await db.execute(
            select(ClientReportConfig)
            .where(ClientReportConfig.enabled == True)
        )
        configs = list(rows.scalars())

        if not configs:
            logger.debug("Aucun rapport schedulé activé")
            return

        for cfg in configs:
            if not _should_send(cfg, now):
                continue

            # Récupère le client
            client_row = await db.execute(
                select(Client).where(Client.id == cfg.client_id)
            )
            client = client_row.scalar_one_or_none()
            if client is None:
                logger.warning("Client introuvable pour report_config client_id=%s", cfg.client_id)
                continue

            # Collecte les données
            snapshots_data = await _collect_snapshots_data(cfg.client_id, db)
            if not snapshots_data:
                logger.info(
                    "Rapport schedulé ignoré pour %s — aucun snapshot récent",
                    client.name,
                )
                continue

            # Génère le PDF
            try:
                pdf_bytes = await generate_client_pdf(
                    client=client,
                    snapshots_data=snapshots_data,
                    language=cfg.language,
                    report_date=report_date,
                )
            except Exception:
                logger.exception(
                    "Erreur lors de la génération du PDF schedulé pour client %s", cfg.client_id
                )
                continue

            # Envoie le PDF par email
            await send_report_pdf_email(
                recipients=cfg.recipient_emails,
                client_name=client.name,
                pdf_bytes=pdf_bytes,
                report_date=report_date,
                sender_name=client.name,
            )

            # Met à jour last_sent_at
            cfg.last_sent_at = now
            await db.commit()

            logger.info(
                "Rapport PDF schedulé envoyé pour %s à %d destinataire(s)",
                client.name, len(cfg.recipient_emails),
            )

    logger.info("Vérification des rapports schedulés terminée")
