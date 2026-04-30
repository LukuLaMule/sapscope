"""
Job planifié — envoi des rappels d'expiration d'essai à J+25 (5 jours avant la fin).

Lancé chaque jour à 9h00 par APScheduler (voir main.py).
Cible les licences trial qui expirent dans 4 à 6 jours et pour lesquelles
aucun rappel n'a encore été envoyé.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from .database import SessionLocal
from .mailer import send_trial_reminder_email
from .models import License, TrialRequest

logger = logging.getLogger(__name__)


async def send_trial_reminders() -> None:
    """Envoie un rappel aux utilisateurs dont l'essai expire dans 4-6 jours."""
    async with SessionLocal() as db:
        now            = datetime.now(timezone.utc)
        window_start   = now + timedelta(days=4)
        window_end     = now + timedelta(days=6)

        # Récupère tous les TrialRequest sans rappel envoyé
        rows = await db.execute(
            select(TrialRequest).where(TrialRequest.reminder_sent_at.is_(None))
        )
        pending: list[TrialRequest] = list(rows.scalars().all())

        if not pending:
            return

        # Charge les licences correspondantes en une seule requête
        keys = [tr.license_key for tr in pending]
        lic_rows = await db.execute(
            select(License).where(License.key.in_(keys))
        )
        licenses_by_key: dict[str, License] = {
            lic.key: lic for lic in lic_rows.scalars().all()
        }

        sent = 0
        for trial_req in pending:
            lic = licenses_by_key.get(trial_req.license_key)
            if lic is None:
                continue

            # Filtre : expire dans la fenêtre 4-6 jours
            if not (window_start <= lic.expires_at <= window_end):
                continue

            days_remaining = max(0, (lic.expires_at - now).days)
            try:
                await send_trial_reminder_email(
                    to_email=trial_req.email,
                    org=trial_req.org,
                    name=trial_req.name,
                    license_key=trial_req.license_key,
                    days_remaining=days_remaining,
                )
                trial_req.reminder_sent_at = now
                sent += 1
            except Exception:
                logger.exception("Failed to send trial reminder to %s", trial_req.email)

        if sent:
            await db.commit()
            logger.info("Trial reminders sent: %d", sent)
