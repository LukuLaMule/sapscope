"""Pydantic schemas — request bodies and response models."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field


# ── Inbound snapshot (posted by the agent) ────────────────────────────────────

class SnapshotIn(BaseModel):
    schema_version: str
    collected_at: datetime
    system: dict[str, Any]
    components: list[dict[str, Any]]
    support_packages: list[dict[str, Any]]
    custom_objects: dict[str, Any]
    # v1 fields
    health: dict[str, Any] | None = None
    # v2 fields — agent schema_version "2"
    instances:       list[dict[str, Any]] | None = None   # topologie AS
    security:        dict[str, Any] | None = None         # users par défaut, SAP_ALL, RFC
    transports:      dict[str, Any] | None = None         # queue import, imports récents
    license_info:    dict[str, Any] | None = None         # expiry, named users
    performance:     dict[str, Any] | None = None         # response time, buffer hit rates
    background_jobs: dict[str, Any] | None = None         # actifs, en retard
    update_info:     dict[str, Any] | None = None         # erreurs SM13
    spool:           dict[str, Any] | None = None         # requests en attente
    system_messages: list[dict[str, Any]] | None = None   # SM02


# ── Outbound responses ────────────────────────────────────────────────────────

class SnapshotCreated(BaseModel):
    id: str
    received_at: datetime


class HealthOut(BaseModel):
    score: int
    status: str                    # OK | WARNING | CRITICAL | UNKNOWN
    indicators: dict[str, Any]


class SnapshotSummary(BaseModel):
    id: str
    system_sid: str
    system_host: str
    collected_at: datetime
    received_at: datetime
    components_count: int
    support_packages_count: int
    custom_objects_count: int
    system_release: str | None = None
    db_type: str | None = None
    health: HealthOut | None = None


class SnapshotDetail(SnapshotSummary):
    payload: dict[str, Any]


class ClientOut(BaseModel):
    id: str
    name: str
    created_at: datetime


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12)
    is_admin: bool = False


class PasswordReset(BaseModel):
    password: str = Field(min_length=12)


class AdminToggle(BaseModel):
    is_admin: bool


class UserOut(BaseModel):
    id: str
    email: str
    is_admin: bool
    created_at: datetime
    client_ids: list[str] = []


class TokenCreated(BaseModel):
    id: str
    label: str
    token: str = Field(description="Plaintext token — shown once, store securely")
    created_at: datetime


class TokenOut(BaseModel):
    id: str
    label: str
    is_revoked: bool
    created_at: datetime
