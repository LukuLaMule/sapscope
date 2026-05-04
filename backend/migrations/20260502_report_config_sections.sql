-- Ajout des options de personnalisation du rapport PDF par client
ALTER TABLE client_report_configs
    ADD COLUMN IF NOT EXISTS report_title        TEXT,
    ADD COLUMN IF NOT EXISTS include_health_domains BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS include_key_metrics    BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS include_ai_analysis    BOOLEAN NOT NULL DEFAULT TRUE;
