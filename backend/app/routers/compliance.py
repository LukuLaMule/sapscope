"""
/api/v1/clients/{client_id}/systems/{sid}/compliance-report

Génère et retourne un PDF de conformité sécurité SAP pour un système donné.
Basé sur les contrôles du SAP Security Guide.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_client_for_user, get_current_user
from ..compliance_report import generate_compliance_pdf
from ..database import get_db
from ..models import User

router = APIRouter(tags=["compliance"])


@router.get(
    "/api/v1/clients/{client_id}/systems/{sid}/compliance-report",
    response_class=Response,
    responses={
        200: {
            "content": {"application/pdf": {}},
            "description": "PDF de conformité sécurité SAP",
        },
        404: {"description": "Aucun snapshot trouvé pour ce système"},
    },
)
async def get_compliance_report(
    client_id: str,
    sid: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Génère un PDF de conformité sécurité SAP pour le dernier snapshot du système.
    Retourne le fichier en téléchargement direct.
    """
    # Vérification d'accès
    client = await get_client_for_user(client_id, user, db)

    # Récupérer le dernier snapshot avec son health_check
    result = await db.execute(
        text("""
            SELECT DISTINCT ON (s.client_id, s.system_sid)
                s.system_sid,
                s.payload,
                s.collected_at,
                hc.indicators
            FROM snapshots s
            JOIN health_checks hc ON hc.snapshot_id = s.id
            WHERE s.client_id = :client_id
              AND s.system_sid = :sid
            ORDER BY s.client_id, s.system_sid, s.collected_at DESC
        """),
        {"client_id": client_id, "sid": sid.upper()},
    )
    row = result.mappings().one_or_none()

    if row is None:
        raise HTTPException(status_code=404, detail="No snapshot found for this system")

    snapshot_payload = row["payload"] or {}
    health_indicators = row["indicators"] or {}

    # Date du snapshot pour nommer le fichier
    collected_at = row["collected_at"]
    if isinstance(collected_at, datetime):
        if collected_at.tzinfo is None:
            collected_at = collected_at.replace(tzinfo=timezone.utc)
        date_str = collected_at.strftime("%Y-%m-%d")
    else:
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    system_info = {
        "sid":         sid.upper(),
        "client_name": client.name,
        "report_date": collected_at.strftime("%d/%m/%Y") if isinstance(collected_at, datetime) else date_str,
    }

    pdf_bytes = generate_compliance_pdf(
        snapshot_payload=snapshot_payload,
        health_indicators=health_indicators,
        system_info=system_info,
    )

    filename = f"compliance-{sid.upper()}-{date_str}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Content-Length": str(len(pdf_bytes)),
        },
    )
