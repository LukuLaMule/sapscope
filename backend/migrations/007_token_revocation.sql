-- SAPscope migration 007 — agent token revocation
-- Adds is_revoked flag to agent_tokens. Idempotent.

ALTER TABLE agent_tokens
    ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN NOT NULL DEFAULT FALSE;
