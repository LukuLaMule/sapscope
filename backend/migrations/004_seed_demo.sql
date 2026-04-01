-- SAPscope — Données de démonstration
-- Insère un client "ACME Industries" avec 6 systèmes SAP réalistes.
-- Idempotent : ne réinsère pas si le client existe déjà.

DO $$
DECLARE
  v_client_id  UUID;
  v_token_hash CHAR(64) := 'a3f1c2d4e5b6789012345678901234567890abcdef1234567890abcdef123456';
BEGIN

  -- ── Client ────────────────────────────────────────────────────────────────
  SELECT id INTO v_client_id FROM clients WHERE name = 'ACME Industries';

  IF v_client_id IS NULL THEN
    INSERT INTO clients (id, name)
    VALUES (gen_random_uuid(), 'ACME Industries')
    RETURNING id INTO v_client_id;
  END IF;

  -- ── Agent token (pour référence) ──────────────────────────────────────────
  INSERT INTO agent_tokens (client_id, label, token_hash)
  VALUES (v_client_id, 'agent-demo', v_token_hash)
  ON CONFLICT (token_hash) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════════════════
  -- SNAPSHOTS : un par système, collectés à des moments légèrement différents
  -- ══════════════════════════════════════════════════════════════════════════

  -- ── PRD — Production ERP (ECC 6.0 EhP8, release 618) ─────────────────────
  INSERT INTO snapshots (client_id, system_sid, system_host, schema_version, collected_at, payload)
  VALUES (
    v_client_id, 'PRD', 'sapprdhst01', '1',
    now() - interval '10 minutes',
    '{
      "schema_version": "1",
      "collected_at": "2026-03-28T08:00:00+00:00",
      "system": {
        "rfcsysid":   "PRD",
        "rfchost":    "sapprdhst01",
        "rfcdbhost":  "sapprdhst01",
        "rfcdbsys":   "ORA",
        "rfcsaprl":   "618",
        "rfckernrl":  "753",
        "rfcmach":    "x86_64",
        "rfcopsys":   "Linux",
        "rfctzone":   "3600",
        "rfcdayst":   "X",
        "rfcipaddr":  "10.0.1.10",
        "rfcipv6addr": ""
      },
      "components": [
        {"component": "SAP_BASIS",  "release": "702", "extrelease": "0018", "description": "SAP Basis Component"},
        {"component": "SAP_ABA",    "release": "702", "extrelease": "0018", "description": "Cross-Application Component"},
        {"component": "SAP_APPL",   "release": "618", "extrelease": "0000", "description": "Logistics and Accounting"},
        {"component": "SAP_HR",     "release": "608", "extrelease": "0018", "description": "Human Resources"},
        {"component": "SAP_FIN",    "release": "618", "extrelease": "0000", "description": "SAP Financial Accounting"},
        {"component": "SAP_HRRXX",  "release": "608", "extrelease": "0018", "description": "SAP HR Addon"},
        {"component": "SAP_AP",     "release": "702", "extrelease": "0018", "description": "Application Platform"},
        {"component": "EA-IPPE",    "release": "400", "extrelease": "0018", "description": "Integrated Product and Process Eng."},
        {"component": "EA-RETAIL",  "release": "618", "extrelease": "0000", "description": "SAP for Retail"},
        {"component": "TOOLSAP",    "release": "702", "extrelease": "0018", "description": "Tools for SAP"}
      ],
      "support_packages": [
        {"component": "SAP_BASIS", "patch": "SAPKB70218", "type": "Support Package", "applied": "20240115", "time": "120000"},
        {"component": "SAP_ABA",   "patch": "SAPKA70218", "type": "Support Package", "applied": "20240115", "time": "123000"},
        {"component": "SAP_APPL",  "patch": "SAPKH61800", "type": "Support Package", "applied": "20231020", "time": "090000"},
        {"component": "SAP_HR",    "patch": "SAPKH60818", "type": "Support Package", "applied": "20231020", "time": "091500"}
      ],
      "custom_objects": {
        "total": 1847,
        "by_type": {"PROG": 642, "FUGR": 318, "CLAS": 201, "TABL": 187, "TTYP": 43, "DTEL": 156, "DOMA": 89, "FORM": 211},
        "objects": [
          {"type": "PROG", "name": "ZFICO_REPORT_BALANCE",    "package": "ZFICO",    "author": "LECLERCF", "lang": "FR", "origin": "C", "created": "20190312"},
          {"type": "PROG", "name": "ZLOGISTIC_STOCK_DAILY",   "package": "ZMM",      "author": "DUPONTM",  "lang": "FR", "origin": "C", "created": "20200601"},
          {"type": "FUGR", "name": "ZRFC_INTERCO_PAYMENTS",   "package": "ZFICO",    "author": "LECLERCF", "lang": "FR", "origin": "C", "created": "20180415"},
          {"type": "CLAS", "name": "ZCL_IDOC_PARSER",         "package": "ZEDI",     "author": "MARTINB",  "lang": "FR", "origin": "C", "created": "20210720"},
          {"type": "TABL", "name": "ZACME_CUSTOMER_EXT",      "package": "ZCUST",    "author": "BLANCP",   "lang": "FR", "origin": "C", "created": "20170210"}
        ]
      }
    }'::jsonb
  );

  -- ── DEV — Développement (NW 7.50) ─────────────────────────────────────────
  INSERT INTO snapshots (client_id, system_sid, system_host, schema_version, collected_at, payload)
  VALUES (
    v_client_id, 'DEV', 'sapdevhst01', '1',
    now() - interval '9 minutes',
    '{
      "schema_version": "1",
      "collected_at": "2026-03-28T08:01:00+00:00",
      "system": {
        "rfcsysid":   "DEV",
        "rfchost":    "sapdevhst01",
        "rfcdbhost":  "sapdevhst01",
        "rfcdbsys":   "HDB",
        "rfcsaprl":   "750",
        "rfckernrl":  "777",
        "rfcmach":    "x86_64",
        "rfcopsys":   "Linux",
        "rfctzone":   "3600",
        "rfcdayst":   "X",
        "rfcipaddr":  "10.0.1.20",
        "rfcipv6addr": ""
      },
      "components": [
        {"component": "SAP_BASIS", "release": "750", "extrelease": "0027", "description": "SAP Basis Component"},
        {"component": "SAP_ABA",   "release": "750", "extrelease": "0027", "description": "Cross-Application Component"},
        {"component": "SAP_APPL",  "release": "618", "extrelease": "0000", "description": "Logistics and Accounting"},
        {"component": "SAP_UI",    "release": "750", "extrelease": "0023", "description": "SAP UI Technologies"},
        {"component": "SAP_HR",    "release": "608", "extrelease": "0018", "description": "Human Resources"},
        {"component": "UIAPFI70",  "release": "100", "extrelease": "0018", "description": "Fiori Apps for Finance"}
      ],
      "support_packages": [
        {"component": "SAP_BASIS", "patch": "SAPKB75027", "type": "Support Package", "applied": "20250301", "time": "020000"},
        {"component": "SAP_ABA",   "patch": "SAPKA75027", "type": "Support Package", "applied": "20250301", "time": "022000"},
        {"component": "SAP_UI",    "patch": "SAPKIIFZAD", "type": "Support Package", "applied": "20250301", "time": "030000"}
      ],
      "custom_objects": {
        "total": 2341,
        "by_type": {"PROG": 798, "FUGR": 402, "CLAS": 287, "TABL": 223, "DTEL": 198, "DOMA": 112, "INTF": 143, "FORM": 178},
        "objects": [
          {"type": "PROG", "name": "ZDEV_TEST_HARNESS",       "package": "ZTOOLS",   "author": "RICHARDV", "lang": "FR", "origin": "C", "created": "20220901"},
          {"type": "CLAS", "name": "ZCL_REST_CLIENT",         "package": "ZINTEGR",  "author": "RICHARDV", "lang": "FR", "origin": "C", "created": "20230115"},
          {"type": "INTF", "name": "ZIF_PAYMENT_GATEWAY",     "package": "ZFICO",    "author": "LECLERCF", "lang": "FR", "origin": "C", "created": "20240210"},
          {"type": "TABL", "name": "ZDEV_CONFIG",             "package": "ZTOOLS",   "author": "MARTINB",  "lang": "FR", "origin": "C", "created": "20211130"}
        ]
      }
    }'::jsonb
  );

  -- ── QAS — Qualité / Recette (NW 7.50 — même base que DEV) ─────────────────
  INSERT INTO snapshots (client_id, system_sid, system_host, schema_version, collected_at, payload)
  VALUES (
    v_client_id, 'QAS', 'sapqashst01', '1',
    now() - interval '8 minutes',
    '{
      "schema_version": "1",
      "collected_at": "2026-03-28T08:02:00+00:00",
      "system": {
        "rfcsysid":   "QAS",
        "rfchost":    "sapqashst01",
        "rfcdbhost":  "sapqashst01",
        "rfcdbsys":   "HDB",
        "rfcsaprl":   "750",
        "rfckernrl":  "777",
        "rfcmach":    "x86_64",
        "rfcopsys":   "Linux",
        "rfctzone":   "3600",
        "rfcdayst":   "X",
        "rfcipaddr":  "10.0.1.30",
        "rfcipv6addr": ""
      },
      "components": [
        {"component": "SAP_BASIS", "release": "750", "extrelease": "0025", "description": "SAP Basis Component"},
        {"component": "SAP_ABA",   "release": "750", "extrelease": "0025", "description": "Cross-Application Component"},
        {"component": "SAP_APPL",  "release": "618", "extrelease": "0000", "description": "Logistics and Accounting"},
        {"component": "SAP_UI",    "release": "750", "extrelease": "0021", "description": "SAP UI Technologies"},
        {"component": "SAP_HR",    "release": "608", "extrelease": "0016", "description": "Human Resources"}
      ],
      "support_packages": [
        {"component": "SAP_BASIS", "patch": "SAPKB75025", "type": "Support Package", "applied": "20241001", "time": "020000"},
        {"component": "SAP_ABA",   "patch": "SAPKA75025", "type": "Support Package", "applied": "20241001", "time": "021500"},
        {"component": "SAP_APPL",  "patch": "SAPKH61800", "type": "Support Package", "applied": "20231020", "time": "090000"}
      ],
      "custom_objects": {
        "total": 1832,
        "by_type": {"PROG": 641, "FUGR": 396, "CLAS": 278, "TABL": 218, "DTEL": 192, "DOMA": 107},
        "objects": [
          {"type": "PROG", "name": "ZTEST_INTEGRATION_SD",   "package": "ZSD",      "author": "DUPONTM",  "lang": "FR", "origin": "C", "created": "20230401"},
          {"type": "CLAS", "name": "ZCL_REST_CLIENT",        "package": "ZINTEGR",  "author": "RICHARDV", "lang": "FR", "origin": "C", "created": "20230115"},
          {"type": "PROG", "name": "ZQAS_BATCH_CHECK",       "package": "ZTOOLS",   "author": "MARTINB",  "lang": "FR", "origin": "C", "created": "20240601"}
        ]
      }
    }'::jsonb
  );

  -- ── SRM — Supplier Relationship Management (NW 7.31) ──────────────────────
  INSERT INTO snapshots (client_id, system_sid, system_host, schema_version, collected_at, payload)
  VALUES (
    v_client_id, 'SRM', 'sap-srm-prd.acme.local', '1',
    now() - interval '7 minutes',
    '{
      "schema_version": "1",
      "collected_at": "2026-03-28T08:03:00+00:00",
      "system": {
        "rfcsysid":   "SRM",
        "rfchost":    "sap-srm-prd.acme.local",
        "rfcdbhost":  "sap-srm-prd.acme.local",
        "rfcdbsys":   "ORA",
        "rfcsaprl":   "731",
        "rfckernrl":  "753",
        "rfcmach":    "x86_64",
        "rfcopsys":   "Linux",
        "rfctzone":   "3600",
        "rfcdayst":   "X",
        "rfcipaddr":  "10.0.1.40",
        "rfcipv6addr": ""
      },
      "components": [
        {"component": "SAP_BASIS",    "release": "731", "extrelease": "0014", "description": "SAP Basis Component"},
        {"component": "SAP_ABA",      "release": "731", "extrelease": "0014", "description": "Cross-Application Component"},
        {"component": "SRM_SERVER",   "release": "700", "extrelease": "0014", "description": "SRM Server"},
        {"component": "BBPCRM",       "release": "700", "extrelease": "0014", "description": "SRM / CRM Shared Objects"},
        {"component": "SAP_AP",       "release": "700", "extrelease": "0014", "description": "Application Platform"}
      ],
      "support_packages": [
        {"component": "SAP_BASIS",  "patch": "SAPKB73114", "type": "Support Package", "applied": "20220610", "time": "020000"},
        {"component": "SRM_SERVER", "patch": "SAPKIBK7014","type": "Support Package", "applied": "20220610", "time": "030000"}
      ],
      "custom_objects": {
        "total": 412,
        "by_type": {"PROG": 134, "FUGR": 98, "CLAS": 67, "TABL": 55, "DTEL": 34, "DOMA": 24},
        "objects": [
          {"type": "PROG", "name": "ZSRM_CATALOG_SYNC",     "package": "ZSRM",  "author": "BLANCP",  "lang": "FR", "origin": "C", "created": "20180920"},
          {"type": "FUGR", "name": "ZSRM_RFC_SUPPLIER",     "package": "ZSRM",  "author": "BLANCP",  "lang": "FR", "origin": "C", "created": "20190314"}
        ]
      }
    }'::jsonb
  );

  -- ── GRC — Governance, Risk & Compliance (NW 7.50) ─────────────────────────
  INSERT INTO snapshots (client_id, system_sid, system_host, schema_version, collected_at, payload)
  VALUES (
    v_client_id, 'GRC', 'sap-grc-prd.acme.local', '1',
    now() - interval '6 minutes',
    '{
      "schema_version": "1",
      "collected_at": "2026-03-28T08:04:00+00:00",
      "system": {
        "rfcsysid":   "GRC",
        "rfchost":    "sap-grc-prd.acme.local",
        "rfcdbhost":  "sap-grc-prd.acme.local",
        "rfcdbsys":   "HDB",
        "rfcsaprl":   "750",
        "rfckernrl":  "777",
        "rfcmach":    "x86_64",
        "rfcopsys":   "Linux",
        "rfctzone":   "3600",
        "rfcdayst":   "X",
        "rfcipaddr":  "10.0.1.50",
        "rfcipv6addr": ""
      },
      "components": [
        {"component": "SAP_BASIS",  "release": "750", "extrelease": "0022", "description": "SAP Basis Component"},
        {"component": "SAP_ABA",    "release": "750", "extrelease": "0022", "description": "Cross-Application Component"},
        {"component": "GRCFND_A",   "release": "1200","extrelease": "0022", "description": "GRC Foundation Application"},
        {"component": "GRC_BASIS",  "release": "1200","extrelease": "0022", "description": "GRC Foundation Basis"},
        {"component": "GRCPINW",    "release": "1200","extrelease": "0022", "description": "GRC Process Integration"},
        {"component": "SAP_UI",     "release": "750", "extrelease": "0018", "description": "SAP UI Technologies"}
      ],
      "support_packages": [
        {"component": "SAP_BASIS", "patch": "SAPKB75022", "type": "Support Package", "applied": "20240601", "time": "020000"},
        {"component": "GRCFND_A",  "patch": "SAPK-12022INGRCFNDA","type": "Support Package","applied": "20240601","time": "040000"}
      ],
      "custom_objects": {
        "total": 287,
        "by_type": {"PROG": 89, "FUGR": 54, "CLAS": 71, "TABL": 43, "DTEL": 18, "DOMA": 12},
        "objects": [
          {"type": "PROG", "name": "ZGRC_SOD_REPORT",    "package": "ZGRC", "author": "LECLERCF", "lang": "FR", "origin": "C", "created": "20211005"},
          {"type": "CLAS", "name": "ZCL_GRC_ROLE_UTIL",  "package": "ZGRC", "author": "MARTINB",  "lang": "FR", "origin": "C", "created": "20220310"}
        ]
      }
    }'::jsonb
  );

  -- ── RTR — SAP Router (standalone, pas d''application) ─────────────────────
  INSERT INTO snapshots (client_id, system_sid, system_host, schema_version, collected_at, payload)
  VALUES (
    v_client_id, 'RTR', 'saprouter-prd.acme.local', '1',
    now() - interval '5 minutes',
    '{
      "schema_version": "1",
      "collected_at": "2026-03-28T08:05:00+00:00",
      "system": {
        "rfcsysid":   "RTR",
        "rfchost":    "saprouter-prd.acme.local",
        "rfcdbhost":  "",
        "rfcdbsys":   "",
        "rfcsaprl":   "753",
        "rfckernrl":  "753",
        "rfcmach":    "x86_64",
        "rfcopsys":   "Linux",
        "rfctzone":   "3600",
        "rfcdayst":   "X",
        "rfcipaddr":  "10.0.0.1",
        "rfcipv6addr": "2001:db8::1"
      },
      "components": [
        {"component": "SAP_BASIS", "release": "753", "extrelease": "0000", "description": "SAP Basis Component (standalone NW)"}
      ],
      "support_packages": [],
      "custom_objects": {
        "total": 0,
        "by_type": {},
        "objects": []
      }
    }'::jsonb
  );

END $$;
