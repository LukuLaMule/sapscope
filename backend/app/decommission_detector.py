"""
Job planifié — détecte les systèmes candidats à la décommission.

Logique :
- Agent KO  : pas de heartbeat depuis > 3× collection_interval → notification "agent down"
- Candidat  : heartbeat frais + SID absent de monitored_sids + dernier snapshot > 24h
- Résolution: SID réapparaît dans monitored_sids → restore automatique du candidat
"""
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update, func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from .database import SessionLocal
from .models import AgentHeartbeat, Notification, Snapshot, SystemDecommission

logger = logging.getLogger(__name__)


async def run_decommission_detection() -> None:
    async with SessionLocal() as db:
        try:
            await _detect(db)
        except Exception:
            logger.exception("Decommission detection failed")


async def _detect(db: AsyncSession) -> None:
    now = datetime.now(timezone.utc)

    # Récupère tous les clients avec heartbeat
    heartbeats = (await db.execute(select(AgentHeartbeat))).scalars().all()

    for hb in heartbeats:
        interval = timedelta(minutes=hb.collection_interval_minutes)
        age = now - hb.last_seen_at

        # Agent KO : pas de heartbeat depuis 3× l'intervalle
        if age > interval * 3:
            await _notify_agent_down(db, hb.client_id, hb.last_seen_at)
            continue

        # Heartbeat frais — récupère tous les SIDs connus pour ce client
        known_sids_rows = await db.execute(
            select(Snapshot.system_sid)
            .where(Snapshot.client_id == hb.client_id)
            .distinct()
        )
        known_sids = {row[0] for row in known_sids_rows}
        monitored = set(hb.monitored_sids)

        # SIDs retirés de la config → candidats
        removed = known_sids - monitored
        for sid in removed:
            # Vérifie que le dernier snapshot date de plus de 24h (évite faux positifs)
            last_snap = await db.scalar(
                select(func.max(Snapshot.collected_at))
                .where(Snapshot.client_id == hb.client_id, Snapshot.system_sid == sid)
            )
            if last_snap and (now - last_snap) < timedelta(hours=24):
                continue  # trop récent, pas un vrai retrait

            stmt = pg_insert(SystemDecommission).values(
                client_id=hb.client_id,
                system_sid=sid,
                status="candidate",
                reason="removed_from_config",
                detected_at=now,
            ).on_conflict_do_nothing()
            await db.execute(stmt)
            logger.info("Decommission candidate detected: %s/%s", hb.client_id, sid)

        # SIDs réapparus → restore automatique des candidats
        for sid in monitored:
            await db.execute(
                update(SystemDecommission)
                .where(
                    SystemDecommission.client_id == hb.client_id,
                    SystemDecommission.system_sid == sid,
                    SystemDecommission.status == "candidate",
                )
                .values(status="restored", restored_at=now)
            )

        await db.commit()


async def _notify_agent_down(db: AsyncSession, client_id: str, last_seen: datetime) -> None:
    # Évite doublons : une seule notif "agent down" par tranche de 20h
    existing = await db.scalar(
        select(Notification)
        .where(
            Notification.client_id == client_id,
            Notification.system_sid == "AGENT",
            Notification.severity == "critical",
            Notification.created_at >= datetime.now(timezone.utc) - timedelta(hours=20),
        )
    )
    if existing:
        return

    notif = Notification(
        client_id=client_id,
        system_sid="AGENT",
        severity="critical",
        message=f"Agent injoignable depuis {last_seen.strftime('%Y-%m-%d %H:%M')} UTC",
    )
    db.add(notif)
    await db.commit()
    logger.warning("Agent down notification created for client %s", client_id)
