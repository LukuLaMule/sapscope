-- SAPscope — Enrichissement des snapshots de démo et ajout systèmes BW / PI
-- Idempotent : utilise ON CONFLICT ou vérifie avant insertion.

DO $$
DECLARE
  v_demo_id  UUID;
  v_acme_id  UUID;
BEGIN
  SELECT id INTO v_demo_id FROM clients WHERE name = 'Demo';
  SELECT id INTO v_acme_id FROM clients WHERE name = 'ACME Industries';

  -- ══════════════════════════════════════════════════════════════════════════
  -- Enrichissement Demo : mise à jour des systèmes existants
  -- ══════════════════════════════════════════════════════════════════════════

  IF v_demo_id IS NOT NULL THEN

    -- PRD Demo — ajout rfcdbhost manquant + champs système complets
    UPDATE snapshots
    SET payload = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(payload,
              '{system,rfcdbhost}', '"hana-prd.corp.local"'),
            '{system,rfcmach}', '"x86_64"'),
          '{system,rfctzone}', '"3600"'),
        '{system,rfcdayst}', '"X"'),
      '{system,rfcipaddr}', '"10.10.1.10"')
    WHERE client_id = v_demo_id AND system_sid = 'PRD';

    -- DEV Demo — IP + machine
    UPDATE snapshots
    SET payload = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(payload,
            '{system,rfcmach}', '"x86_64"'),
          '{system,rfctzone}', '"3600"'),
        '{system,rfcdayst}', '"X"'),
      '{system,rfcipaddr}', '"10.10.1.20"')
    WHERE client_id = v_demo_id AND system_sid = 'DEV';

    -- QAL Demo
    UPDATE snapshots
    SET payload = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(payload,
            '{system,rfcmach}', '"x86_64"'),
          '{system,rfctzone}', '"3600"'),
        '{system,rfcdayst}', '"X"'),
      '{system,rfcipaddr}', '"10.10.1.30"')
    WHERE client_id = v_demo_id AND system_sid = 'QAL';

    -- ADS Demo
    UPDATE snapshots
    SET payload = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(payload,
            '{system,rfcmach}', '"x86_64"'),
          '{system,rfctzone}', '"3600"'),
        '{system,rfcdayst}', '"X"'),
      '{system,rfcipaddr}', '"10.10.1.50"')
    WHERE client_id = v_demo_id AND system_sid = 'ADS';

    -- ── BWP — BW/4HANA Prod (Demo) ────────────────────────────────────────
    IF NOT EXISTS (
      SELECT 1 FROM snapshots WHERE client_id = v_demo_id AND system_sid = 'BWP'
    ) THEN
      INSERT INTO snapshots (client_id, system_sid, system_host, schema_version, collected_at, payload)
      VALUES (
        v_demo_id, 'BWP', 'sap-bwp-01.corp.local', '1',
        now() - interval '4 minutes',
        '{
          "schema_version": "1",
          "collected_at": "2026-03-28T08:06:00+00:00",
          "system": {
            "rfcsysid":   "BWP",
            "rfchost":    "sap-bwp-01.corp.local",
            "rfcdbhost":  "hana-bwp.corp.local",
            "rfcdbsys":   "HDB",
            "rfcsaprl":   "757",
            "rfckernrl":  "789",
            "rfcmach":    "x86_64",
            "rfcopsys":   "Linux",
            "rfctzone":   "3600",
            "rfcdayst":   "X",
            "rfcipaddr":  "10.10.1.60",
            "rfcipv6addr": ""
          },
          "components": [
            {"component": "SAP_BASIS",  "release": "757", "extrelease": "0003", "description": "SAP Basis Component"},
            {"component": "SAP_ABA",    "release": "757", "extrelease": "0003", "description": "Cross-Application Component"},
            {"component": "BI_CONT",    "release": "758", "extrelease": "0003", "description": "Business Intelligence Content"},
            {"component": "SAP_BW",     "release": "757", "extrelease": "0003", "description": "SAP BW/4HANA"},
            {"component": "BW4CORE",    "release": "200", "extrelease": "0003", "description": "BW/4HANA Core"},
            {"component": "HANA_BI",    "release": "200", "extrelease": "0003", "description": "SAP HANA BI Platform"},
            {"component": "SAP_UI",     "release": "757", "extrelease": "0002", "description": "SAP UI Technologies"}
          ],
          "support_packages": [
            {"component": "SAP_BASIS", "patch": "SAPKB75703", "type": "Support Package", "applied": "20260101", "time": "030000"},
            {"component": "SAP_ABA",   "patch": "SAPKA75703", "type": "Support Package", "applied": "20260101", "time": "031500"},
            {"component": "BW4CORE",   "patch": "SAPK-20003INBW4CORE", "type": "Support Package", "applied": "20260101", "time": "050000"},
            {"component": "BI_CONT",   "patch": "SAPKIBIIP8", "type": "Support Package", "applied": "20251001", "time": "060000"}
          ],
          "custom_objects": {
            "total": 523,
            "by_type": {"PROG": 112, "TRAN": 43, "ROUT": 89, "IOBJ": 78, "CUBE": 34, "DSO": 67, "TRFN": 65, "ODSO": 35},
            "objects": [
              {"type": "ROUT",  "name": "ZDEMO_FINANCE_ROUTE",   "package": "ZBWFI",  "author": "THOUVARD", "lang": "EN", "origin": "C", "created": "20230601"},
              {"type": "CUBE",  "name": "ZDEMO_SALES_CUBE",      "package": "ZBWSD",  "author": "THOUVARD", "lang": "EN", "origin": "C", "created": "20220315"},
              {"type": "IOBJ",  "name": "ZDEMO_MATERIAL_GRPG",   "package": "ZBWMM",  "author": "NGUYEN",   "lang": "EN", "origin": "C", "created": "20210820"},
              {"type": "PROG",  "name": "ZDEMO_BW_LOAD_MONITOR", "package": "ZBWBASIS","author": "THOUVARD","lang": "EN", "origin": "C", "created": "20240110"}
            ]
          }
        }'
      );
    END IF;

    -- ── PI1 — SAP Process Integration (Demo) ──────────────────────────────
    IF NOT EXISTS (
      SELECT 1 FROM snapshots WHERE client_id = v_demo_id AND system_sid = 'PI1'
    ) THEN
      INSERT INTO snapshots (client_id, system_sid, system_host, schema_version, collected_at, payload)
      VALUES (
        v_demo_id, 'PI1', 'sap-pi-01.corp.local', '1',
        now() - interval '3 minutes',
        '{
          "schema_version": "1",
          "collected_at": "2026-03-28T08:07:00+00:00",
          "system": {
            "rfcsysid":   "PI1",
            "rfchost":    "sap-pi-01.corp.local",
            "rfcdbhost":  "ora-pi.corp.local",
            "rfcdbsys":   "ORA",
            "rfcsaprl":   "750",
            "rfckernrl":  "777",
            "rfcmach":    "x86_64",
            "rfcopsys":   "Linux",
            "rfctzone":   "3600",
            "rfcdayst":   "X",
            "rfcipaddr":  "10.10.1.70",
            "rfcipv6addr": ""
          },
          "components": [
            {"component": "SAP_BASIS",    "release": "750", "extrelease": "0026", "description": "SAP Basis Component"},
            {"component": "SAP_ABA",      "release": "750", "extrelease": "0026", "description": "Cross-Application Component"},
            {"component": "PI_BASIS",     "release": "750", "extrelease": "0026", "description": "SAP PI / Process Integration Basis"},
            {"component": "XIESR",        "release": "750", "extrelease": "0026", "description": "Enterprise Services Repository"},
            {"component": "XITOOL",       "release": "750", "extrelease": "0026", "description": "Integration Builder Tools"},
            {"component": "XIAF",         "release": "750", "extrelease": "0026", "description": "Advanced Adapter Framework"},
            {"component": "XIRWB",        "release": "750", "extrelease": "0026", "description": "Integration Workbench"},
            {"component": "SAP_UI",       "release": "750", "extrelease": "0021", "description": "SAP UI Technologies"}
          ],
          "support_packages": [
            {"component": "SAP_BASIS", "patch": "SAPKB75026", "type": "Support Package", "applied": "20250601", "time": "020000"},
            {"component": "PI_BASIS",  "patch": "SAPKIPYI7026","type": "Support Package","applied": "20250601","time": "030000"},
            {"component": "XIESR",     "patch": "SAPK-75026INXIESR","type": "Support Package","applied": "20250601","time": "031500"}
          ],
          "custom_objects": {
            "total": 318,
            "by_type": {"SWFL": 87, "PROG": 62, "CLAS": 54, "TABL": 38, "DTEL": 29, "INTF": 48},
            "objects": [
              {"type": "SWFL", "name": "ZDEMO_IDOC_TO_VENDOR",  "package": "ZPISD",  "author": "MOULIN", "lang": "EN", "origin": "C", "created": "20220401"},
              {"type": "CLAS", "name": "ZCL_PI_MSG_TRANSFORM",  "package": "ZPIBASE","author": "MOULIN", "lang": "EN", "origin": "C", "created": "20230715"},
              {"type": "PROG", "name": "ZDEMO_PI_REPROCESS",    "package": "ZPIBASE","author": "MOULIN", "lang": "EN", "origin": "C", "created": "20240210"}
            ]
          }
        }'
      );
    END IF;

  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- Enrichissement ACME : ajout champs manquants + hosts DB plus réalistes
  -- ══════════════════════════════════════════════════════════════════════════

  IF v_acme_id IS NOT NULL THEN

    -- PRD ACME — DB host sur serveur Oracle dédié
    UPDATE snapshots
    SET payload = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(payload,
              '{system,rfcdbhost}', '"db-ora-prd01.acme.local"'),
            '{system,rfcmach}', '"x86_64"'),
          '{system,rfctzone}', '"3600"'),
        '{system,rfcdayst}', '"X"'),
      '{system,rfcipaddr}', '"10.0.1.10"')
    WHERE client_id = v_acme_id AND system_sid = 'PRD';

    -- DEV ACME
    UPDATE snapshots
    SET payload = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(payload,
            '{system,rfcdbhost}', '"hana-dev01.acme.local"'),
          '{system,rfcmach}', '"x86_64"'),
        '{system,rfctzone}', '"3600"'),
      '{system,rfcdayst}', '"X"')
    WHERE client_id = v_acme_id AND system_sid = 'DEV';

    -- QAS ACME
    UPDATE snapshots
    SET payload = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(payload,
            '{system,rfcdbhost}', '"hana-qas01.acme.local"'),
          '{system,rfcmach}', '"x86_64"'),
        '{system,rfctzone}', '"3600"'),
      '{system,rfcdayst}', '"X"')
    WHERE client_id = v_acme_id AND system_sid = 'QAS';

    -- SRM ACME
    UPDATE snapshots
    SET payload = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(payload,
            '{system,rfcdbhost}', '"db-ora-srm01.acme.local"'),
          '{system,rfcmach}', '"x86_64"'),
        '{system,rfctzone}', '"3600"'),
      '{system,rfcdayst}', '"X"')
    WHERE client_id = v_acme_id AND system_sid = 'SRM';

    -- GRC ACME
    UPDATE snapshots
    SET payload = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(payload,
            '{system,rfcdbhost}', '"hana-grc01.acme.local"'),
          '{system,rfcmach}', '"x86_64"'),
        '{system,rfctzone}', '"3600"'),
      '{system,rfcdayst}', '"X"')
    WHERE client_id = v_acme_id AND system_sid = 'GRC';

    -- ── BWA — BW Analytique ACME (NW 7.50 + HANA) ─────────────────────────
    IF NOT EXISTS (
      SELECT 1 FROM snapshots WHERE client_id = v_acme_id AND system_sid = 'BWA'
    ) THEN
      INSERT INTO snapshots (client_id, system_sid, system_host, schema_version, collected_at, payload)
      VALUES (
        v_acme_id, 'BWA', 'sap-bwa-prd.acme.local', '1',
        now() - interval '2 minutes',
        '{
          "schema_version": "1",
          "collected_at": "2026-03-28T08:08:00+00:00",
          "system": {
            "rfcsysid":   "BWA",
            "rfchost":    "sap-bwa-prd.acme.local",
            "rfcdbhost":  "hana-bwa01.acme.local",
            "rfcdbsys":   "HDB",
            "rfcsaprl":   "750",
            "rfckernrl":  "777",
            "rfcmach":    "x86_64",
            "rfcopsys":   "Linux",
            "rfctzone":   "3600",
            "rfcdayst":   "X",
            "rfcipaddr":  "10.0.1.60",
            "rfcipv6addr": ""
          },
          "components": [
            {"component": "SAP_BASIS", "release": "750", "extrelease": "0024", "description": "SAP Basis Component"},
            {"component": "SAP_ABA",   "release": "750", "extrelease": "0024", "description": "Cross-Application Component"},
            {"component": "SAP_BW",    "release": "750", "extrelease": "0024", "description": "SAP Business Warehouse"},
            {"component": "BI_CONT",   "release": "757", "extrelease": "0008", "description": "Business Intelligence Content"},
            {"component": "SAP_UI",    "release": "750", "extrelease": "0020", "description": "SAP UI Technologies"},
            {"component": "BWMIGR",    "release": "101", "extrelease": "0008", "description": "BW Migration Cockpit"}
          ],
          "support_packages": [
            {"component": "SAP_BASIS", "patch": "SAPKB75024", "type": "Support Package", "applied": "20240301", "time": "020000"},
            {"component": "SAP_BW",    "patch": "SAPKW75024",  "type": "Support Package", "applied": "20240301", "time": "040000"},
            {"component": "BI_CONT",   "patch": "SAPKIBIIP8",  "type": "Support Package", "applied": "20231001", "time": "060000"}
          ],
          "custom_objects": {
            "total": 891,
            "by_type": {"ROUT": 213, "IOBJ": 187, "CUBE": 78, "DSO": 143, "PROG": 134, "TRFN": 89, "ODSO": 47},
            "objects": [
              {"type": "ROUT", "name": "ZACME_FI_AR_ROUTE",     "package": "ZBWFI",  "author": "LECLERCF", "lang": "FR", "origin": "C", "created": "20190801"},
              {"type": "CUBE", "name": "ZACME_SALES_ANALYSIS",   "package": "ZBWSD",  "author": "DUPONTM",  "lang": "FR", "origin": "C", "created": "20200315"},
              {"type": "IOBJ", "name": "ZACME_DIVISION_CODE",    "package": "ZBWMM",  "author": "BLANCP",   "lang": "FR", "origin": "C", "created": "20180620"},
              {"type": "PROG", "name": "ZACME_BW_DELTA_MONITOR", "package": "ZBWBASIS","author":"MARTINB",  "lang": "FR", "origin": "C", "created": "20230110"}
            ]
          }
        }'
      );
    END IF;

    -- ── PO1 — SAP PO / Process Orchestration ACME ─────────────────────────
    IF NOT EXISTS (
      SELECT 1 FROM snapshots WHERE client_id = v_acme_id AND system_sid = 'PO1'
    ) THEN
      INSERT INTO snapshots (client_id, system_sid, system_host, schema_version, collected_at, payload)
      VALUES (
        v_acme_id, 'PO1', 'sap-po1-prd.acme.local', '1',
        now() - interval '1 minute',
        '{
          "schema_version": "1",
          "collected_at": "2026-03-28T08:09:00+00:00",
          "system": {
            "rfcsysid":   "PO1",
            "rfchost":    "sap-po1-prd.acme.local",
            "rfcdbhost":  "hana-po1.acme.local",
            "rfcdbsys":   "HDB",
            "rfcsaprl":   "750",
            "rfckernrl":  "777",
            "rfcmach":    "x86_64",
            "rfcopsys":   "Linux",
            "rfctzone":   "3600",
            "rfcdayst":   "X",
            "rfcipaddr":  "10.0.1.70",
            "rfcipv6addr": ""
          },
          "components": [
            {"component": "SAP_BASIS",  "release": "750", "extrelease": "0025", "description": "SAP Basis Component"},
            {"component": "SAP_ABA",    "release": "750", "extrelease": "0025", "description": "Cross-Application Component"},
            {"component": "PI_BASIS",   "release": "750", "extrelease": "0025", "description": "SAP Process Orchestration Basis"},
            {"component": "XIESR",      "release": "750", "extrelease": "0025", "description": "Enterprise Services Repository"},
            {"component": "XIAF",       "release": "750", "extrelease": "0025", "description": "Advanced Adapter Framework"},
            {"component": "XIRWB",      "release": "750", "extrelease": "0025", "description": "Integration Workbench"},
            {"component": "BPEM",       "release": "750", "extrelease": "0025", "description": "Business Process Exception Mgmt"}
          ],
          "support_packages": [
            {"component": "SAP_BASIS", "patch": "SAPKB75025", "type": "Support Package", "applied": "20241001", "time": "020000"},
            {"component": "PI_BASIS",  "patch": "SAPKIPYI7025","type": "Support Package","applied": "20241001","time": "030000"},
            {"component": "XIESR",     "patch": "SAPK-75025INXIESR","type": "Support Package","applied": "20241001","time": "031500"}
          ],
          "custom_objects": {
            "total": 476,
            "by_type": {"SWFL": 143, "PROG": 87, "CLAS": 76, "INTF": 58, "TABL": 52, "DTEL": 34, "DOMA": 26},
            "objects": [
              {"type": "SWFL", "name": "ZACME_INTERCO_IDOC",    "package": "ZPOACME", "author": "MARTINB",  "lang": "FR", "origin": "C", "created": "20190915"},
              {"type": "CLAS", "name": "ZCL_PO_VENDOR_MAPPER",  "package": "ZPOACME", "author": "MARTINB",  "lang": "FR", "origin": "C", "created": "20210530"},
              {"type": "PROG", "name": "ZACME_PO_ERROR_REPORT", "package": "ZPOACME", "author": "BLANCP",   "lang": "FR", "origin": "C", "created": "20230801"}
            ]
          }
        }'
      );
    END IF;

  END IF;

END $$;
