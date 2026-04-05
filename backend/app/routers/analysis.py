"""
/api/v1/snapshots/{id}/analysis — trigger and retrieve Claude analysis.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

logger = logging.getLogger(__name__)

from ..analyser import MODEL, analyse
from ..auth import get_client_for_user, get_current_user
from ..database import get_db
from ..limiter import limiter
from ..models import Analysis, Client, Snapshot, User

router = APIRouter(tags=["analysis"])


class AnalysisOut(BaseModel):
    id: str
    model: str
    language: str
    input_tokens: int
    output_tokens: int
    content: str
    created_at: str


@router.post(
    "/api/v1/clients/{client_id}/snapshots/{snapshot_id}/analysis",
    response_model=AnalysisOut,
    status_code=status.HTTP_201_CREATED,
    summary="Run Claude analysis on a snapshot (or return cached result)",
)
@limiter.limit("20/hour")
async def run_analysis(
    request: Request,
    client_id: str,
    snapshot_id: str,
    force: bool = Query(False, description="Re-run even if analysis already exists"),
    language: str = Query("English", description="Language for the analysis text"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    client = await get_client_for_user(client_id, user, db)
    row = await db.execute(
        select(Snapshot)
        .options(selectinload(Snapshot.analysis))
        .where(
            Snapshot.id == snapshot_id,
            Snapshot.client_id == client.id,
        )
    )
    snap = row.scalar_one_or_none()
    if snap is None:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    # Return cached analysis unless forced
    if snap.analysis and not force:
        a = snap.analysis
        return AnalysisOut(
            id=a.id,
            model=a.model,
            language=a.language,
            input_tokens=a.input_tokens,
            output_tokens=a.output_tokens,
            content=a.content,
            created_at=a.created_at.isoformat(),
        )

    try:
        text, in_tok, out_tok = await analyse(snap.payload, language=language)
    except Exception as exc:
        logger.error("Claude API error for snapshot %s: %s", snapshot_id, exc)
        raise HTTPException(status_code=502, detail="Analysis service unavailable")

    # Upsert analysis
    if snap.analysis:
        snap.analysis.model         = MODEL
        snap.analysis.language      = language
        snap.analysis.input_tokens  = in_tok
        snap.analysis.output_tokens = out_tok
        snap.analysis.content       = text
        a = snap.analysis
    else:
        a = Analysis(
            snapshot_id=snap.id,
            model=MODEL,
            language=language,
            input_tokens=in_tok,
            output_tokens=out_tok,
            content=text,
        )
        db.add(a)

    await db.commit()
    await db.refresh(a)

    return AnalysisOut(
        id=a.id,
        model=a.model,
        language=a.language,
        input_tokens=a.input_tokens,
        output_tokens=a.output_tokens,
        content=a.content,
        created_at=a.created_at.isoformat(),
    )


@router.get(
    "/api/v1/clients/{client_id}/snapshots/{snapshot_id}/analysis",
    response_model=AnalysisOut,
    summary="Retrieve existing analysis for a snapshot",
)
async def get_analysis(
    client_id: str,
    snapshot_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    client = await get_client_for_user(client_id, user, db)
    row = await db.execute(
        select(Snapshot)
        .options(selectinload(Snapshot.analysis))
        .where(
            Snapshot.id == snapshot_id,
            Snapshot.client_id == client.id,
        )
    )
    snap = row.scalar_one_or_none()
    if snap is None:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    if snap.analysis is None:
        raise HTTPException(status_code=404, detail="No analysis yet — POST to generate one")

    a = snap.analysis
    return AnalysisOut(
        id=a.id,
        model=a.model,
        language=a.language,
        input_tokens=a.input_tokens,
        output_tokens=a.output_tokens,
        content=a.content,
        created_at=a.created_at.isoformat(),
    )
