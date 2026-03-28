"""Pydantic schemas — request bodies and response models."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# ── Inbound snapshot (posted by the agent) ────────────────────────────────────

class SnapshotIn(BaseModel):
    schema_version: str
    collected_at: datetime
    system: dict[str, Any]
    components: list[dict[str, Any]]
    support_packages: list[dict[str, Any]]
    custom_objects: dict[str, Any]


# ── Outbound responses ────────────────────────────────────────────────────────

class SnapshotCreated(BaseModel):
    id: str
    received_at: datetime


class SnapshotSummary(BaseModel):
    id: str
    system_sid: str
    system_host: str
    collected_at: datetime
    received_at: datetime
    components_count: int
    support_packages_count: int
    custom_objects_count: int


class SnapshotDetail(SnapshotSummary):
    payload: dict[str, Any]


class ClientOut(BaseModel):
    id: str
    name: str
    created_at: datetime


class TokenCreated(BaseModel):
    id: str
    label: str
    token: str = Field(description="Plaintext token — shown once, store securely")
    created_at: datetime
