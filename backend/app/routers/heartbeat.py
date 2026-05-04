"""
POST /api/v1/agent/heartbeat — agent envoie ses SIDs actifs (auth par token)
"""
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_client_for_agent
from ..database import get_db
from ..models import AgentHeartbeat, Client

router = APIRouter(tags=["heartbeat"])


class HeartbeatIn(BaseModel):
    monitored_sids: list[str]
    agent_version: str | None = None
    collection_interval_minutes: int = 60


@router.post("/api/v1/agent/heartbeat", status_code=204)
async def agent_heartbeat(
    body: HeartbeatIn,
    client: Annotated[Client, Depends(get_client_for_agent)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    stmt = pg_insert(AgentHeartbeat).values(
        client_id=client.id,
        monitored_sids=body.monitored_sids,
        agent_version=body.agent_version,
        collection_interval_minutes=body.collection_interval_minutes,
        last_seen_at=datetime.now(timezone.utc),
    ).on_conflict_do_update(
        constraint="uq_agent_heartbeat_client",
        set_={
            "monitored_sids": body.monitored_sids,
            "agent_version": body.agent_version,
            "collection_interval_minutes": body.collection_interval_minutes,
            "last_seen_at": datetime.now(timezone.utc),
        }
    )
    await db.execute(stmt)
    await db.commit()
