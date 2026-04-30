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
    profile_params:  dict[str, Any] | None = None         # paramètres de profil SAP (PAHI)
    db_stats:        dict[str, Any] | None = None         # stats DB spécifiques (HANA mem, version…)
    jobs_error_24h:  dict[str, Any] | None = None         # SM37 — jobs abortés 24h
    sm12_locks:      dict[str, Any] | None = None         # SM12 — entrées bloquées
    st22_24h:        dict[str, Any] | None = None         # ST22 — dumps 24h détail
    qrfc_queues:     dict[str, Any] | None = None         # SMQ1/SMQ2 — queues qRFC
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
    # Champs enrichis (v2) — extraits du payload côté backend
    kernel_release: str | None = None     # ex: "785"
    kernel_patch: str | None = None       # ex: "900"
    basis_sp: str | None = None           # ex: "16" (SAP_BASIS extrelease)
    unicode: bool | None = None           # True si unicode
    installation_no: str | None = None
    security_critical: bool = False       # SAP*/DDIC actif ou SAP_ALL
    security_sap_all_count: int = 0       # nb utilisateurs SAP_ALL
    security_default_users: list[str] = []# ex: ["SAP*", "DDIC"]
    transport_queue: int | None = None    # nb transports en attente
    bg_jobs_delayed: int | None = None    # nb jobs en retard
    update_errors: int | None = None      # nb erreurs SM13
    spool_pending: int | None = None      # spool requests en attente
    avg_response_ms: int | None = None    # temps de réponse dialog moyen
    # Données opérationnelles détaillées
    jobs_error_24h_count: int | None = None       # SM37 — jobs abortés 24h
    jobs_error_24h_list: list[dict] = []           # [{name, user, date, time}]
    sm12_locks_count: int | None = None            # SM12 — entrées bloquées
    sm12_locks_list: list[dict] = []               # [{object, user, mode, client}]
    st22_count_24h: int | None = None              # ST22 — dumps 24h
    st22_list_24h: list[dict] = []                 # [{date, time, program, user}]
    qrfc_outbound_total: int | None = None         # SMQ1 — total entrées outbound
    qrfc_outbound_errors: int | None = None        # SMQ1 — erreurs outbound
    qrfc_inbound_total: int | None = None          # SMQ2 — total entrées inbound
    qrfc_inbound_errors: int | None = None         # SMQ2 — erreurs inbound


class SnapshotDetail(SnapshotSummary):
    payload: dict[str, Any]


class ClientOut(BaseModel):
    id: str
    name: str
    logo_b64: str | None = None
    created_at: datetime


class LogoUpdateRequest(BaseModel):
    logo_b64: str | None = None


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
