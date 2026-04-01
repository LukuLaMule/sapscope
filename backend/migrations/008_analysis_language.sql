-- SAPscope migration 008 — store analysis language
-- Adds language column to analyses. Idempotent.

ALTER TABLE analyses
    ADD COLUMN IF NOT EXISTS language VARCHAR(30) NOT NULL DEFAULT 'English';
