CREATE TABLE IF NOT EXISTS agent_logs (
    id          SERIAL PRIMARY KEY,
    client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    system_sid  VARCHAR(10),
    level       VARCHAR(10) NOT NULL DEFAULT 'INFO',
    message     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_agent_logs_client_ts
    ON agent_logs (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_agent_logs_client_sid
    ON agent_logs (client_id, system_sid, created_at DESC);
