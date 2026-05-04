"""
SQLAlchemy ORM models.

clients              — one row per customer organisation
client_report_configs— PDF report scheduling config per client
agent_tokens         — write-only tokens issued to agents (POST snapshots only)
users                — consultant accounts (read dashboard)
user_clients         — which consultants can see which clients
snapshots            — one row per collection run, raw payload stored as JSONB
analyses             — Claude-generated assessment for a snapshot
"""

import hashlib
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, JSON, SmallInteger, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=func.gen_random_uuid()
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    logo_b64: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    tokens: Mapped[list["AgentToken"]] = relationship(back_populates="client", cascade="all, delete-orphan")
    snapshots: Mapped[list["Snapshot"]] = relationship(back_populates="client", cascade="all, delete-orphan")
    user_links: Mapped[list["UserClient"]] = relationship(back_populates="client", cascade="all, delete-orphan")
    report_config: Mapped["ClientReportConfig | None"] = relationship(
        back_populates="client", uselist=False, cascade="all, delete-orphan"
    )


class ClientReportConfig(Base):
    __tablename__ = "client_report_configs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=func.gen_random_uuid()
    )
    client_id: Mapped[str] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    recipient_emails: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    schedule: Mapped[str] = mapped_column(String(20), nullable=False, default="weekly")  # daily | weekly | monthly
    schedule_day: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)   # 0=lundi pour weekly
    language: Mapped[str] = mapped_column(String(5), nullable=False, default="fr")
    last_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    report_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    include_health_domains: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    include_key_metrics: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    include_ai_analysis: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    client: Mapped["Client"] = relationship(back_populates="report_config")


class AgentToken(Base):
    __tablename__ = "agent_tokens"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=func.gen_random_uuid()
    )
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)  # SHA-256 hex
    is_revoked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    client: Mapped["Client"] = relationship(back_populates="tokens")

    @staticmethod
    def hash(token: str) -> str:
        return hashlib.sha256(token.encode()).hexdigest()


class Snapshot(Base):
    __tablename__ = "snapshots"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=func.gen_random_uuid()
    )
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    system_sid: Mapped[str] = mapped_column(String(10), nullable=False)
    system_host: Mapped[str] = mapped_column(String(255), nullable=False)
    schema_version: Mapped[str] = mapped_column(String(10), nullable=False)
    collected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)

    client: Mapped["Client"] = relationship(back_populates="snapshots")
    analysis: Mapped["Analysis | None"] = relationship(back_populates="snapshot", uselist=False, cascade="all, delete-orphan")
    health_check: Mapped["HealthCheck | None"] = relationship(back_populates="snapshot", uselist=False, cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_snapshots_client_collected", "client_id", "collected_at"),
        Index("ix_snapshots_sid", "system_sid"),
    )


class HealthCheck(Base):
    """Health score computed at snapshot ingestion time."""
    __tablename__ = "health_checks"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=func.gen_random_uuid()
    )
    snapshot_id: Mapped[str] = mapped_column(
        ForeignKey("snapshots.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    score: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False)   # OK | WARNING | CRITICAL | UNKNOWN
    indicators: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    snapshot: Mapped["Snapshot"] = relationship(back_populates="health_check")


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=func.gen_random_uuid()
    )
    snapshot_id: Mapped[str] = mapped_column(
        ForeignKey("snapshots.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    model: Mapped[str] = mapped_column(String(80), nullable=False)
    language: Mapped[str] = mapped_column(String(30), nullable=False, default="English")
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    snapshot: Mapped["Snapshot"] = relationship(back_populates="analysis")


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=func.gen_random_uuid()
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    client_links: Mapped[list["UserClient"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class UserClient(Base):
    """Which consultants can see which clients."""
    __tablename__ = "user_clients"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), primary_key=True)

    user: Mapped["User"] = relationship(back_populates="client_links")
    client: Mapped["Client"] = relationship(back_populates="user_links")


class Subscription(Base):
    """Stripe subscription linked to a user (SaaS only)."""
    __tablename__ = "subscriptions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    stripe_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tier: Mapped[str] = mapped_column(String(50), nullable=False)   # trial | solo | team | enterprise
    status: Mapped[str] = mapped_column(String(50), nullable=False)  # active | canceled | past_due | expired
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class PasswordResetToken(Base):
    """Token à usage unique pour le reset de mot de passe.
    Expire après 1h, supprimé dès qu'il est utilisé.
    """
    __tablename__ = "password_reset_tokens"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class OnboardingToken(Base):
    """Plaintext agent token stored temporarily after a successful Stripe checkout.
    Retrieved once by the frontend, then deleted.
    """
    __tablename__ = "onboarding_tokens"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    client_id: Mapped[str] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    token_plaintext: Mapped[str] = mapped_column(String(512), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class SystemNote(Base):
    """Notes libres laissées par un consultant sur un système SAP."""
    __tablename__ = "system_notes"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=func.gen_random_uuid()
    )
    client_id: Mapped[str] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    system_sid: Mapped[str] = mapped_column(String(10), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    author_email: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, onupdate=func.now()
    )

    __table_args__ = (
        Index("ix_system_notes_client_sid", "client_id", "system_sid"),
    )


class TrialRequest(Base):
    """Demande d'essai self-hosted — enregistre l'email, l'org et la clé de licence associée."""
    __tablename__ = "trial_requests"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=func.gen_random_uuid()
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    org: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    license_key: Mapped[str] = mapped_column(String(36), nullable=False)  # UUID de la licence
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=func.gen_random_uuid()
    )
    client_id: Mapped[str] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    system_sid: Mapped[str] = mapped_column(String(10), nullable=False)
    severity: Mapped[str] = mapped_column(String(10), nullable=False)   # warning | critical
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_notifications_client_created", "client_id", "created_at"),
    )


class License(Base):
    """Licence self-hosted émise par le serveur de licences central."""
    __tablename__ = "licenses"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=func.gen_random_uuid()
    )
    key: Mapped[str] = mapped_column(Text, unique=True, nullable=False, index=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    plan: Mapped[str] = mapped_column(String(50), nullable=False)   # trial | solo | team | enterprise
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    instance_id: Mapped[str | None] = mapped_column(String(255), nullable=True)  # UUID de l'instance activée
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class AgentHeartbeat(Base):
    __tablename__ = "agent_heartbeats"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, unique=True)
    monitored_sids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    agent_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    collection_interval_minutes: Mapped[int] = mapped_column(default=60)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())

    client: Mapped["Client"] = relationship()


class SystemDecommission(Base):
    __tablename__ = "system_decommissions"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    system_sid: Mapped[str] = mapped_column(String(10), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="candidate")  # candidate | confirmed | restored
    reason: Mapped[str] = mapped_column(String(50), default="removed_from_config")
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    restored_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("client_id", "system_sid", name="uq_system_decommission"),
        Index("ix_system_decommissions_client", "client_id"),
        Index("ix_system_decommissions_status", "status"),
    )
