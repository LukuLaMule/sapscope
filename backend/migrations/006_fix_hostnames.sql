-- SAPscope — Correction des hostnames pour classification d'environnement correcte
-- Corrige les systèmes non-ABAP (SRM, GRC, RTR, BWA, PO1) dont le hostname
-- ne contenait pas d'indicateur d'environnement, les forçant dans "Infra / Svc".
-- Idempotent : UPDATE silencieux si le système n'existe pas.

DO $$
DECLARE
  v_acme_id UUID;
  v_demo_id  UUID;
BEGIN
  SELECT id INTO v_acme_id FROM clients WHERE name = 'ACME Industries';
  SELECT id INTO v_demo_id  FROM clients WHERE name = 'Demo';

  -- ── ACME Industries ──────────────────────────────────────────────────────────

  IF v_acme_id IS NOT NULL THEN

    UPDATE snapshots
    SET system_host = 'sap-srm-prd.acme.local',
        payload     = jsonb_set(jsonb_set(payload,
                        '{system,rfchost}',   '"sap-srm-prd.acme.local"'),
                        '{system,rfcdbhost}', '"sap-srm-prd.acme.local"')
    WHERE client_id = v_acme_id AND system_sid = 'SRM';

    UPDATE snapshots
    SET system_host = 'sap-grc-prd.acme.local',
        payload     = jsonb_set(jsonb_set(payload,
                        '{system,rfchost}',   '"sap-grc-prd.acme.local"'),
                        '{system,rfcdbhost}', '"sap-grc-prd.acme.local"')
    WHERE client_id = v_acme_id AND system_sid = 'GRC';

    UPDATE snapshots
    SET system_host = 'saprouter-prd.acme.local',
        payload     = jsonb_set(payload,
                        '{system,rfchost}', '"saprouter-prd.acme.local"')
    WHERE client_id = v_acme_id AND system_sid = 'RTR';

    UPDATE snapshots
    SET system_host = 'sap-bwa-prd.acme.local',
        payload     = jsonb_set(payload,
                        '{system,rfchost}', '"sap-bwa-prd.acme.local"')
    WHERE client_id = v_acme_id AND system_sid = 'BWA';

    UPDATE snapshots
    SET system_host = 'sap-po1-prd.acme.local',
        payload     = jsonb_set(payload,
                        '{system,rfchost}', '"sap-po1-prd.acme.local"')
    WHERE client_id = v_acme_id AND system_sid = 'PO1';

  END IF;

  -- ── Demo ─────────────────────────────────────────────────────────────────────

  IF v_demo_id IS NOT NULL THEN

    UPDATE snapshots
    SET system_host = 'sap-ads-prd.corp.local',
        payload     = jsonb_set(payload,
                        '{system,rfchost}', '"sap-ads-prd.corp.local"')
    WHERE client_id = v_demo_id AND system_sid = 'ADS';

    UPDATE snapshots
    SET system_host = 'sap-bwp-prd.corp.local',
        payload     = jsonb_set(payload,
                        '{system,rfchost}', '"sap-bwp-prd.corp.local"')
    WHERE client_id = v_demo_id AND system_sid = 'BWP';

    UPDATE snapshots
    SET system_host = 'sap-pi1-prd.corp.local',
        payload     = jsonb_set(payload,
                        '{system,rfchost}', '"sap-pi1-prd.corp.local"')
    WHERE client_id = v_demo_id AND system_sid = 'PI1';

  END IF;

END $$;
