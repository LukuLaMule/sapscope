-- Licences self-hosted : table centrale du serveur de licences SAPscope.
-- Chaque ligne représente une licence émise pour un client self-hosted.
-- plan : trial | solo | team | enterprise
-- instance_id : UUID de l'instance self-hosted qui a activé la licence (null = pas encore activée)

CREATE TABLE licenses (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    key          VARCHAR(36)  NOT NULL UNIQUE,
    email        VARCHAR(255),
    plan         VARCHAR(50)  NOT NULL,
    expires_at   TIMESTAMPTZ  NOT NULL,
    activated_at TIMESTAMPTZ,
    instance_id  VARCHAR(255),
    active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX ix_licenses_key ON licenses (key);
