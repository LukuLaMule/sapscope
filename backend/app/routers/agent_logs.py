"""
Agent log endpoints.

POST /api/v1/agent/logs        — agent envoie ses logs (auth par token)
GET  /api/v1/clients/{id}/agent-logs — frontend lit les logs (auth JWT)
"""
from datetime import datetime, timezone, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_client_for_agent, get_current_user
from ..database import get_db
from ..models import Client, User

router = APIRouter(tags=["agent-logs"])

KEEP_DAYS = 7
MAX_BATCH = 500


# ── Schemas ───────────────────────────────────────────────────────────────────

class LogEntry(BaseModel):
    level:      Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    message:    str
    system_sid: str | None = None
    ts:         datetime | None = None


class LogBatch(BaseModel):
    logs: list[LogEntry]


class LogOut(BaseModel):
    id:         int
    level:      str
    message:    str
    system_sid: str | None
    created_at: datetime


# ── Agent → backend ───────────────────────────────────────────────────────────

@router.post("/api/v1/agent/logs", status_code=204)
async def receive_logs(
    body:   LogBatch,
    client: Annotated[Client, Depends(get_client_for_agent)],
    db:     Annotated[AsyncSession, Depends(get_db)],
):
    if not body.logs:
        return

    entries = body.logs[:MAX_BATCH]
    now = datetime.now(timezone.utc)

    rows = [
        {
            "client_id":  client.id,
            "system_sid": e.system_sid,
            "level":      e.level,
            "message":    e.message,
            "created_at": e.ts or now,
        }
        for e in entries
    ]

    await db.execute(
        text(
            "INSERT INTO agent_logs (client_id, system_sid, level, message, created_at) "
            "VALUES (:client_id, :system_sid, :level, :message, :created_at)"
        ),
        rows,
    )

    # Cleanup — keep only last KEEP_DAYS per client
    cutoff = now - timedelta(days=KEEP_DAYS)
    await db.execute(
        text("DELETE FROM agent_logs WHERE client_id = :cid AND created_at < :cutoff"),
        {"cid": client.id, "cutoff": cutoff},
    )
    await db.commit()


# ── Frontend → backend ────────────────────────────────────────────────────────

@router.get("/api/v1/clients/{client_id}/agent-logs", response_model=list[LogOut])
async def get_agent_logs(
    client_id: int,
    level:     str | None = Query(None, description="Filter by level (ERROR, WARNING, INFO…)"),
    sid:       str | None = Query(None, description="Filter by system SID"),
    limit:     int = Query(200, le=500),
    _user:     Annotated[User, Depends(get_current_user)] = None,
    db:        Annotated[AsyncSession, Depends(get_db)] = None,
):
    filters = "WHERE client_id = :cid"
    params: dict = {"cid": client_id, "limit": limit}

    if level:
        filters += " AND level = :level"
        params["level"] = level.upper()
    if sid:
        filters += " AND system_sid = :sid"
        params["sid"] = sid.upper()

    rows = await db.execute(
        text(
            f"SELECT id, level, message, system_sid, created_at "
            f"FROM agent_logs {filters} "
            f"ORDER BY created_at DESC LIMIT :limit"
        ),
        params,
    )
    return [
        LogOut(
            id=r.id,
            level=r.level,
            message=r.message,
            system_sid=r.system_sid,
            created_at=r.created_at,
        )
        for r in rows.fetchall()
    ]
