CREATE TABLE IF NOT EXISTS client_report_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT false,
    recipient_emails JSONB NOT NULL DEFAULT '[]',
    schedule VARCHAR(20) NOT NULL DEFAULT 'weekly',
    schedule_day SMALLINT NOT NULL DEFAULT 0,
    language VARCHAR(5) NOT NULL DEFAULT 'fr',
    last_sent_at TIMESTAMPTZ
);
