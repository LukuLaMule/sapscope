"""
GET /api/v1/clients/{client_id}/history

Retourne l'historique de health scores sur N jours :
  - by_sid  : un score par (SID, jour) — dernier snapshot de la journée
  - daily_avg : moyenne journalière sur tous les SIDs actifs ce jour-là
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_client_for_user, get_current_user
from ..database import get_db
from ..models import User

router = APIRouter(tags=["history"])


@router.get("/api/v1/clients/{client_id}/history")
async def get_health_history(
    client_id: str,
    days: Annotated[int, Query(ge=7, le=365)] = 30,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Historique des health scores pour tous les SIDs d'un client.

    Renvoie :
      - by_sid    : { "PRD": [{date, score, status}, …], … }
      - daily_avg : [{date, score}, …]  — moyenne tous SIDs confondus
    """
    client = await get_client_for_user(client_id, user, db)

    # Un seul score par (SID, jour) : dernier snapshot de la journée
    rows = (await db.execute(
        text("""
            SELECT s.system_sid,
                   DATE(s.collected_at AT TIME ZONE 'UTC') AS day,
                   hc.score,
                   hc.status
            FROM (
                SELECT DISTINCT ON (system_sid, DATE(collected_at AT TIME ZONE 'UTC'))
                       id, system_sid, collected_at
                FROM snapshots
                WHERE client_id  = :client_id
                  AND collected_at >= NOW() - (:days * INTERVAL '1 day')
                ORDER BY system_sid,
                         DATE(collected_at AT TIME ZONE 'UTC') DESC,
                         collected_at DESC
            ) s
            JOIN health_checks hc ON hc.snapshot_id = s.id
            ORDER BY s.system_sid, day
        """),
        {"client_id": client.id, "days": days},
    )).fetchall()

    # Construire by_sid
    by_sid: dict[str, list[dict]] = {}
    for system_sid, day, score, status in rows:
        by_sid.setdefault(system_sid, []).append({
            "date":   day.isoformat(),
            "score":  score,
            "status": status,
        })

    # Moyenne journalière toutes SIDs confondues
    daily_buckets: dict[str, list[int]] = {}
    for entries in by_sid.values():
        for e in entries:
            daily_buckets.setdefault(e["date"], []).append(e["score"])

    daily_avg = [
        {"date": d, "score": round(sum(scores) / len(scores))}
        for d, scores in sorted(daily_buckets.items())
    ]

    return {"days": days, "by_sid": by_sid, "daily_avg": daily_avg}
