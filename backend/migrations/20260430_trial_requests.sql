CREATE TABLE IF NOT EXISTS trial_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    org VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    license_key VARCHAR(36) NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reminder_sent_at TIMESTAMPTZ
);
