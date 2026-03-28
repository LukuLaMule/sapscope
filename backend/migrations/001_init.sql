-- SAPscope initial schema
-- Run once manually or via migration tool before starting the backend.

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- for gen_random_uuid()

CREATE TABLE IF NOT EXISTS clients (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    label       VARCHAR(255) NOT NULL,
    token_hash  CHAR(64)     NOT NULL UNIQUE,   -- SHA-256 hex
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    system_sid      VARCHAR(10)  NOT NULL,
    system_host     VARCHAR(255) NOT NULL,
    schema_version  VARCHAR(10)  NOT NULL,
    collected_at    TIMESTAMPTZ  NOT NULL,
    received_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    payload         JSONB        NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_snapshots_client_collected ON snapshots (client_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS ix_snapshots_sid              ON snapshots (system_sid);
-- GIN index for JSONB full-text queries (future AI analysis)
CREATE INDEX IF NOT EXISTS ix_snapshots_payload_gin     ON snapshots USING GIN (payload);
