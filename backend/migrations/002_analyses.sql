-- SAPscope: Claude analysis table

CREATE TABLE IF NOT EXISTS analyses (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id   UUID NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE UNIQUE,
    model         VARCHAR(80)  NOT NULL,
    input_tokens  INTEGER      NOT NULL,
    output_tokens INTEGER      NOT NULL,
    content       TEXT         NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
