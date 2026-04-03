-- Health checks: one row per snapshot, computed at ingestion time.
-- score: 0-100 weighted average across available domains
-- status: OK (>=80) | WARNING (>=50) | CRITICAL (<50) | UNKNOWN (no health data)
-- indicators: per-domain detail as JSONB

CREATE TABLE health_checks (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id  UUID        NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE UNIQUE,
    score        SMALLINT    NOT NULL CHECK (score >= 0 AND score <= 100),
    status       VARCHAR(10) NOT NULL CHECK (status IN ('OK', 'WARNING', 'CRITICAL', 'UNKNOWN')),
    indicators   JSONB       NOT NULL DEFAULT '{}',
    computed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_health_checks_snapshot ON health_checks (snapshot_id);
