CREATE TABLE IF NOT EXISTS agent_heartbeats (
    id SERIAL PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    monitored_sids JSONB NOT NULL DEFAULT '[]',
    agent_version TEXT,
    collection_interval_minutes INTEGER DEFAULT 60,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_agent_heartbeat_client UNIQUE (client_id)
);

CREATE TABLE IF NOT EXISTS system_decommissions (
    id SERIAL PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    system_sid VARCHAR(10) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'candidate',  -- candidate | confirmed | restored
    reason VARCHAR(50) NOT NULL DEFAULT 'removed_from_config',  -- removed_from_config | long_stale
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,
    restored_at TIMESTAMPTZ,
    CONSTRAINT uq_system_decommission UNIQUE (client_id, system_sid)
);

CREATE INDEX IF NOT EXISTS ix_agent_heartbeats_client ON agent_heartbeats(client_id);
CREATE INDEX IF NOT EXISTS ix_system_decommissions_client ON system_decommissions(client_id);
CREATE INDEX IF NOT EXISTS ix_system_decommissions_status ON system_decommissions(status);
