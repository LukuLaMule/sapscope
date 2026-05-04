"""
SAPscope data collector.
Reads system info, component versions, support packages, and custom objects
from a live SAP system via RFC.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import pyrfc

from .config import AgentConfig

logger = logging.getLogger(__name__)


class SAPCollector:
    def __init__(self, config: AgentConfig):
        self.config = config
        self._conn: pyrfc.Connection | None = None

    # ------------------------------------------------------------------
    # Connection lifecycle
    # ------------------------------------------------------------------

    def __enter__(self) -> "SAPCollector":
        logger.info("Connecting to SAP %s (client %s)", self.config.sap.ashost, self.config.sap.client)
        self._conn = pyrfc.Connection(**self.config.sap.to_pyrfc())
        return self

    def __exit__(self, *_) -> None:
        if self._conn:
            self._conn.close()
            self._conn = None

    @property
    def conn(self) -> pyrfc.Connection:
        if not self._conn:
            raise RuntimeError("Not connected — use SAPCollector as a context manager")
        return self._conn

    # ------------------------------------------------------------------
    # Individual collectors
    # ------------------------------------------------------------------

    def get_system_info(self) -> dict[str, Any]:
        """RFC_SYSTEM_INFO — SID, hostname, OS, DB, kernel version + patch + unicode/64bit."""
        logger.debug("Calling RFC_SYSTEM_INFO")
        result = self.conn.call("RFC_SYSTEM_INFO")
        ri = result.get("RFCSI_EXPORT", {})
        return {
            "rfchost":      ri.get("RFCHOST", ""),
            "rfcsysid":     ri.get("RFCSYSID", ""),
            "rfcdbhost":    ri.get("RFCDBHOST", ""),
            "rfcdbsys":     ri.get("RFCDBSYS", ""),
            "rfcsaprl":     ri.get("RFCSAPRL", ""),    # SAP release (e.g. 756)
            "rfckernrl":    ri.get("RFCKERNRL", ""),   # kernel release
            "rfckernpatch": ri.get("RFCKERNPATCH", ""),# kernel patch level
            "rfcmach":      ri.get("RFCMACH", ""),     # machine type
            "rfcopsys":     ri.get("RFCOPSYS", ""),    # OS
            "rfcunicode":   ri.get("RFCUNICODE", ""),  # U = unicode
            "rfcbit64":     ri.get("RFCBIT64", ""),    # X = 64-bit
            "rfcintno":     ri.get("RFCINTNO", ""),    # installation number
            "rfctzone":     ri.get("RFCTZONE", ""),
            "rfcdayst":     ri.get("RFCDAYST", ""),
            "rfcipaddr":    ri.get("RFCIPADDR", ""),
            "rfcipv6addr":  ri.get("RFCIPV6ADDR", ""),
        }

    def get_component_versions(self) -> list[dict[str, str]]:
        """CVERS table — installed SAP component versions (BASIS, etc.)."""
        logger.debug("Reading CVERS")
        rows = self.conn.call(
            "RFC_READ_TABLE",
            QUERY_TABLE="CVERS",
            FIELDS=[
                {"FIELDNAME": "COMPONENT"},
                {"FIELDNAME": "RELEASE"},
                {"FIELDNAME": "EXTRELEASE"},
                {"FIELDNAME": "DESC_TEXT"},
            ],
        )
        return [
            {
                "component":   _trim(row, "COMPONENT"),
                "release":     _trim(row, "RELEASE"),
                "extrelease":  _trim(row, "EXTRELEASE"),
                "description": _trim(row, "DESC_TEXT"),
            }
            for row in _parse_table(rows)
        ]

    def get_support_packages(self) -> list[dict[str, str]]:
        """PAT03 table — applied support packages per component."""
        logger.debug("Reading PAT03")
        rows = self.conn.call(
            "RFC_READ_TABLE",
            QUERY_TABLE="PAT03",
            FIELDS=[
                {"FIELDNAME": "COMPONENT"},
                {"FIELDNAME": "PATCH"},
                {"FIELDNAME": "TYPE"},
                {"FIELDNAME": "APPLDATE"},
                {"FIELDNAME": "APPLTIME"},
            ],
        )
        return [
            {
                "component": _trim(row, "COMPONENT"),
                "patch":     _trim(row, "PATCH"),
                "type":      _trim(row, "TYPE"),
                "applied":   _trim(row, "APPLDATE"),
                "time":      _trim(row, "APPLTIME"),
            }
            for row in _parse_table(rows)
        ]

    def get_custom_objects(self) -> dict[str, Any]:
        """TADIR — Z* and Y* custom objects, grouped by object type."""
        logger.debug("Reading TADIR (custom objects)")
        fields = [
            {"FIELDNAME": "OBJECT"},
            {"FIELDNAME": "OBJ_NAME"},
            {"FIELDNAME": "DEVCLASS"},
            {"FIELDNAME": "AUTHOR"},
            {"FIELDNAME": "MASTERLANG"},
            {"FIELDNAME": "SRCSYSTEM"},
            {"FIELDNAME": "CREATED_ON"},
        ]
        # Two separate static calls — no variable interpolation in WHERE clause
        rows_z = self.conn.call(
            "RFC_READ_TABLE", QUERY_TABLE="TADIR", DELIMITER="|",
            FIELDS=fields,
            OPTIONS=[{"TEXT": "OBJ_NAME LIKE 'Z%'"}],
            ROWCOUNT=self.config.tadir_limit,
        )
        rows_y = self.conn.call(
            "RFC_READ_TABLE", QUERY_TABLE="TADIR", DELIMITER="|",
            FIELDS=fields,
            OPTIONS=[{"TEXT": "OBJ_NAME LIKE 'Y%'"}],
            ROWCOUNT=self.config.tadir_limit,
        )
        rows = {
            "FIELDS": rows_z["FIELDS"],
            "DATA":   rows_z["DATA"] + rows_y["DATA"],
        }

        objects: list[dict] = []
        by_type: dict[str, int] = {}

        for row in _parse_table(rows):
            obj_type = _trim(row, "OBJECT")
            obj_name = _trim(row, "OBJ_NAME")
            objects.append(
                {
                    "type":     obj_type,
                    "name":     obj_name,
                    "package":  _trim(row, "DEVCLASS"),
                    "author":   _trim(row, "AUTHOR"),
                    "lang":     _trim(row, "MASTERLANG"),
                    "origin":   _trim(row, "SRCSYSTEM"),
                    "created":  _trim(row, "CREATED_ON"),
                }
            )
            by_type[obj_type] = by_type.get(obj_type, 0) + 1

        return {
            "total": len(objects),
            "by_type": dict(sorted(by_type.items(), key=lambda x: -x[1])),
            "objects": objects,
        }

    def get_instances(self) -> list[dict[str, Any]]:
        """TH_SERVER_LIST — active application server instances with WP counts."""
        logger.debug("Calling TH_SERVER_LIST")
        instances = []
        try:
            result = self.conn.call("TH_SERVER_LIST")
            for srv in result.get("LIST", []):
                instances.append({
                    "name":    str(srv.get("NAME", "")).strip(),
                    "host":    str(srv.get("HOST", "")).strip(),
                    "type":    str(srv.get("ITYPE", "")).strip(),
                    "release": str(srv.get("RELEASE", "")).strip(),
                })
        except Exception:
            logger.debug("get_instances: TH_SERVER_LIST not callable")

        # WP counts per instance
        try:
            wp_result = self.conn.call("TH_WPINFO")
            wp_by_host: dict[str, dict] = {}
            for wp in wp_result.get("WPLIST", []):
                host = str(wp.get("WP_AUTOMAT_LOKAL_HOST", "")).strip() or "local"
                wp_type   = str(wp.get("WP_TYP", "")).strip()
                wp_status = str(wp.get("WP_STATUS", "")).strip()
                entry = wp_by_host.setdefault(host, {
                    "dia": 0, "bgd": 0, "spo": 0, "upd": 0, "enq": 0,
                    "free": 0, "busy": 0,
                })
                type_map = {"DIA": "dia", "BGD": "bgd", "SPO": "spo",
                            "UPD": "upd", "ENQ": "enq"}
                if wp_type in type_map:
                    entry[type_map[wp_type]] += 1
                if wp_status in ("Wait", "WAIT", "0"):
                    entry["free"] += 1
                else:
                    entry["busy"] += 1

            for inst in instances:
                host = inst.get("host", "")
                inst["wp"] = wp_by_host.get(host, {})
        except Exception:
            logger.debug("get_instances: TH_WPINFO not callable")

        return instances

    def get_security_info(self) -> dict[str, Any]:
        """Security metrics: default users, SAP_ALL holders, RFC without logon."""
        result: dict[str, Any] = {}

        # Default users active (not locked)
        try:
            active_defaults = []
            for user in ("SAP*", "DDIC", "EARLYWATCH", "SAPCPIC"):
                rows = self.conn.call(
                    "RFC_READ_TABLE",
                    QUERY_TABLE="USR02",
                    FIELDS=[{"FIELDNAME": "BNAME"}, {"FIELDNAME": "UFLAG"}],
                    OPTIONS=[{"TEXT": f"BNAME = '{user}'"}],
                    ROWCOUNT=1,
                )
                parsed = _parse_table(rows)
                if parsed and _trim(parsed[0], "UFLAG") == "0":
                    active_defaults.append(user)
            result["default_users_active"] = active_defaults
        except Exception:
            logger.debug("Security: USR02 not readable")

        # Users with SAP_ALL
        try:
            rows = self.conn.call(
                "RFC_READ_TABLE",
                QUERY_TABLE="AGR_USERS",
                FIELDS=[{"FIELDNAME": "UNAME"}],
                OPTIONS=[{"TEXT": "AGR_NAME = 'SAP_ALL'"}],
                ROWCOUNT=100,
            )
            result["sap_all_users"] = [
                _trim(r, "UNAME") for r in _parse_table(rows) if _trim(r, "UNAME")
            ]
        except Exception:
            logger.debug("Security: AGR_USERS not readable")

        # RFC destinations type-3 without logon user
        try:
            rows = self.conn.call(
                "RFC_READ_TABLE",
                QUERY_TABLE="RFCDES",
                FIELDS=[
                    {"FIELDNAME": "RFCDEST"},
                    {"FIELDNAME": "RFCTYPE"},
                    {"FIELDNAME": "RFCUSER"},
                    {"FIELDNAME": "TRUSTED"},
                ],
                OPTIONS=[{"TEXT": "RFCTYPE = '3'"}],
                ROWCOUNT=300,
            )
            no_user = []
            trusted = []
            for r in _parse_table(rows):
                dest = _trim(r, "RFCDEST")
                if not dest:
                    continue
                if not _trim(r, "RFCUSER"):
                    no_user.append(dest)
                if _trim(r, "TRUSTED") == "X":
                    trusted.append(dest)
            result["rfc_no_logon"]       = no_user
            result["rfc_no_logon_count"] = len(no_user)
            result["rfc_trusted"]        = trusted
            result["rfc_trusted_count"]  = len(trusted)
        except Exception:
            logger.debug("Security: RFCDES not readable")

        # Inactive users (no login in 90+ days, not locked)
        try:
            cutoff = (datetime.now() - timedelta(days=90)).strftime("%Y%m%d")
            rows = self.conn.call(
                "RFC_READ_TABLE",
                QUERY_TABLE="USR02",
                FIELDS=[{"FIELDNAME": "BNAME"}],
                OPTIONS=[
                    {"TEXT": f"TRDAT < '{cutoff}'"},
                    {"TEXT": "AND TRDAT <> '00000000'"},
                    {"TEXT": "AND UFLAG = '0'"},
                ],
                ROWCOUNT=500,
            )
            parsed = _parse_table(rows)
            result["inactive_users_count"] = len(parsed)
            result["inactive_users"]       = [_trim(r, "BNAME") for r in parsed[:20]]
        except Exception:
            logger.debug("Security: inactive users not readable")

        # Users who never logged in (dialog, not locked)
        try:
            rows = self.conn.call(
                "RFC_READ_TABLE",
                QUERY_TABLE="USR02",
                FIELDS=[{"FIELDNAME": "BNAME"}],
                OPTIONS=[
                    {"TEXT": "TRDAT = '00000000'"},
                    {"TEXT": "AND UFLAG = '0'"},
                ],
                ROWCOUNT=200,
            )
            parsed = _parse_table(rows)
            result["never_logged_in_count"] = len(parsed)
            result["never_logged_in"]       = [_trim(r, "BNAME") for r in parsed[:20]]
        except Exception:
            logger.debug("Security: never-logged-in users not readable")

        # Users with SAP_NEW (nearly as dangerous as SAP_ALL)
        try:
            rows = self.conn.call(
                "RFC_READ_TABLE",
                QUERY_TABLE="AGR_USERS",
                FIELDS=[{"FIELDNAME": "UNAME"}],
                OPTIONS=[{"TEXT": "AGR_NAME = 'SAP_NEW'"}],
                ROWCOUNT=100,
            )
            result["sap_new_users"] = [
                _trim(r, "UNAME") for r in _parse_table(rows) if _trim(r, "UNAME")
            ]
            result["sap_new_count"] = len(result["sap_new_users"])
        except Exception:
            logger.debug("Security: SAP_NEW not readable")

        return result

    def get_transport_info(self) -> dict[str, Any]:
        """Transport queue: pending imports + last 30 days imports."""
        result: dict[str, Any] = {}
        thirty_days_ago = (datetime.now() - timedelta(days=30)).strftime("%Y%m%d")

        # Pending imports in buffer (TRBAT)
        try:
            rows = self.conn.call(
                "RFC_READ_TABLE",
                QUERY_TABLE="TRBAT",
                FIELDS=[{"FIELDNAME": "TRKORR"}, {"FIELDNAME": "PSTEP"}],
                ROWCOUNT=500,
            )
            result["import_queue_count"] = len(_parse_table(rows))
        except Exception:
            logger.debug("Transport: TRBAT not readable")

        # Recent imported transports (E070)
        try:
            rows = self.conn.call(
                "RFC_READ_TABLE",
                QUERY_TABLE="E070",
                FIELDS=[
                    {"FIELDNAME": "TRKORR"},
                    {"FIELDNAME": "TRSTATUS"},
                    {"FIELDNAME": "AS4USER"},
                    {"FIELDNAME": "AS4DATE"},
                    {"FIELDNAME": "STRKORR"},
                ],
                OPTIONS=[
                    {"TEXT": f"AS4DATE >= '{thirty_days_ago}'"},
                    {"TEXT": " AND TRSTATUS = 'R'"},
                ],
                ROWCOUNT=100,
            )
            result["recent_imports"] = [
                {
                    "trkorr":  _trim(r, "TRKORR"),
                    "user":    _trim(r, "AS4USER"),
                    "date":    _trim(r, "AS4DATE"),
                    "source":  _trim(r, "STRKORR"),
                }
                for r in _parse_table(rows)
            ]
            result["recent_imports_count"] = len(result["recent_imports"])
        except Exception:
            logger.debug("Transport: E070 not readable")

        return result

    def get_license_info(self) -> dict[str, Any]:
        """LICENSE_GET — licence expiry and user counts."""
        result: dict[str, Any] = {}
        try:
            lic = self.conn.call("LICENSE_GET")
            info = lic.get("LICENSE_INFO", [{}])[0] if lic.get("LICENSE_INFO") else {}
            result["expiry_date"]     = str(info.get("LIC_EXPIRE", "")).strip()
            result["system_id"]       = str(info.get("SID", "")).strip()
            result["installation_no"] = str(info.get("INSTNO", "")).strip()
        except Exception:
            logger.debug("License: LICENSE_GET not callable")

        # Named users count from USZBVSYS
        try:
            rows = self.conn.call(
                "RFC_READ_TABLE",
                QUERY_TABLE="USZBVSYS",
                FIELDS=[{"FIELDNAME": "MANDT"}, {"FIELDNAME": "COUNTER"}],
                ROWCOUNT=10,
            )
            total = sum(int(_trim(r, "COUNTER") or 0) for r in _parse_table(rows))
            result["named_users"] = total
        except Exception:
            logger.debug("License: USZBVSYS not readable")

        return result

    def get_performance_stats(self) -> dict[str, Any]:
        """Response time + buffer hit rates via SWNC_COLLECTOR_GET_AGGREGATES."""
        result: dict[str, Any] = {}
        try:
            perf = self.conn.call(
                "SWNC_COLLECTOR_GET_AGGREGATES",
                COMPONENT="DIALOG",
                STARTDATE=datetime.now().strftime("%Y%m%d"),
                STARTTIME="000000",
            )
            agg = perf.get("AGGREGATES", [])
            if agg:
                row = agg[0]
                total_steps = int(row.get("RESPCOUNT", 0) or 0)
                total_resp  = int(row.get("RESPTIME",  0) or 0)
                if total_steps > 0:
                    result["avg_response_ms"]  = round(total_resp / total_steps)
                    result["dialog_steps_today"] = total_steps
        except Exception:
            logger.debug("Performance: SWNC_COLLECTOR_GET_AGGREGATES not callable")

        # Buffer hit rates (program buffer)
        try:
            buf = self.conn.call("SWNC_COLLECTOR_GET_AGGREGATES", COMPONENT="BUFFER")
            for row in buf.get("AGGREGATES", []):
                name = str(row.get("BUFNAME", "")).strip()
                hitratio = row.get("HITRATIO")
                if name and hitratio is not None:
                    result.setdefault("buffer_hit_rates", {})[name] = round(float(hitratio), 1)
        except Exception:
            logger.debug("Performance: buffer stats not available")

        return result

    def get_jobs_error_24h(self) -> dict[str, Any]:
        """TBTCO — jobs abortés dans les dernières 24h (SM37)."""
        result: dict[str, Any] = {}
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y%m%d")
        try:
            rows = self.conn.call(
                "RFC_READ_TABLE",
                QUERY_TABLE="TBTCO",
                DELIMITER="|",
                FIELDS=[
                    {"FIELDNAME": "JOBNAME"},
                    {"FIELDNAME": "SDLUNAME"},
                    {"FIELDNAME": "SDLSTRTDT"},
                    {"FIELDNAME": "SDLSTRTTM"},
                ],
                OPTIONS=[
                    {"TEXT": f"SDLSTRTDT >= '{yesterday}'"},
                    {"TEXT": " AND STATUS = 'A'"},
                ],
                ROWCOUNT=100,
            )
            jobs = [
                {
                    "name": _trim(r, "JOBNAME"),
                    "user": _trim(r, "SDLUNAME"),
                    "date": _trim(r, "SDLSTRTDT"),
                    "time": _trim(r, "SDLSTRTTM"),
                }
                for r in _parse_table(rows)
                if _trim(r, "JOBNAME")
            ]
            result["count"] = len(jobs)
            result["jobs"]  = jobs[:50]
        except Exception:
            logger.debug("SM37: TBTCO (aborted 24h) not readable")
        return result

    def get_sm12_locks(self) -> dict[str, Any]:
        """ENQLOCK — entrées bloquées en cours (SM12)."""
        result: dict[str, Any] = {}
        try:
            rows = self.conn.call(
                "RFC_READ_TABLE",
                QUERY_TABLE="ENQLOCK",
                DELIMITER="|",
                FIELDS=[
                    {"FIELDNAME": "GNAME"},
                    {"FIELDNAME": "GUNAME"},
                    {"FIELDNAME": "GMODE"},
                    {"FIELDNAME": "GCLIENT"},
                ],
                ROWCOUNT=200,
            )
            locks = [
                {
                    "object": _trim(r, "GNAME"),
                    "user":   _trim(r, "GUNAME"),
                    "mode":   _trim(r, "GMODE"),
                    "client": _trim(r, "GCLIENT"),
                }
                for r in _parse_table(rows)
                if _trim(r, "GUNAME")
            ]
            result["count"] = len(locks)
            result["locks"] = locks[:50]
        except Exception:
            logger.debug("SM12: ENQLOCK not readable")
        return result

    def get_st22_24h(self) -> dict[str, Any]:
        """SNAP — short dumps des dernières 24h avec détail programme/user (ST22)."""
        result: dict[str, Any] = {}
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y%m%d")
        try:
            rows = self.conn.call(
                "RFC_READ_TABLE",
                QUERY_TABLE="SNAP",
                DELIMITER="|",
                FIELDS=[
                    {"FIELDNAME": "DATUM"},
                    {"FIELDNAME": "UZEIT"},
                    {"FIELDNAME": "PROG"},
                    {"FIELDNAME": "UNAME"},
                    {"FIELDNAME": "MANDT"},
                ],
                OPTIONS=[{"TEXT": f"DATUM >= '{yesterday}'"}],
                ROWCOUNT=100,
            )
            dumps = [
                {
                    "date":    _trim(r, "DATUM"),
                    "time":    _trim(r, "UZEIT"),
                    "program": _trim(r, "PROG"),
                    "user":    _trim(r, "UNAME"),
                    "client":  _trim(r, "MANDT"),
                }
                for r in _parse_table(rows)
                if _trim(r, "PROG")
            ]
            result["count"] = len(dumps)
            result["dumps"] = dumps[:50]
        except Exception:
            logger.debug("ST22: SNAP detail not readable")
        return result

    def get_profile_params(self) -> dict[str, Any]:
        """PAHI — paramètres de profil SAP clés pour l'analyse de dimensionnement."""
        KEY_PARAMS = [
            "rdisp/wp_no_dia",
            "rdisp/wp_no_btc",
            "rdisp/wp_no_spo",
            "rdisp/wp_no_vb",
            "em/initial_size_MB",
            "em/max_size_MB",
            "rdisp/ROLL_MAXFS",
            "abap/heap_area_total",
            "rdisp/max_wprun_time",
            "rdisp/tm_max_no",
        ]
        result: dict[str, Any] = {}
        for param in KEY_PARAMS:
            try:
                rows = self.conn.call(
                    "RFC_READ_TABLE",
                    QUERY_TABLE="PAHI",
                    DELIMITER="|",
                    FIELDS=[
                        {"FIELDNAME": "PARNAME"},
                        {"FIELDNAME": "PARVAL"},
                        {"FIELDNAME": "PARMDATE"},
                    ],
                    OPTIONS=[{"TEXT": f"PARNAME = '{param}'"}],
                    ROWCOUNT=10,
                )
                parsed = _parse_table(rows)
                if parsed:
                    # Prendre la valeur la plus récente (dernière par date)
                    latest = sorted(parsed, key=lambda r: _trim(r, "PARMDATE"))[-1]
                    result[param] = _trim(latest, "PARVAL")
            except Exception:
                pass
        return result

    def get_db_stats(self, system_info: dict[str, Any]) -> dict[str, Any]:
        """
        Statistiques base de données adaptées au type détecté.
        - HANA (HDB)  : version, mémoire allouée/utilisée
        - Oracle (ORA): version DB
        - DB2 (DB6)   : version DB
        - Tous        : tentative de lecture version via DBCON / tables système
        """
        db_type = system_info.get("rfcdbsys", "").strip().upper()
        result: dict[str, Any] = {"db_type": db_type}

        # ── HANA : version + mémoire ─────────────────────────────────────────
        if db_type == "HDB":
            # Version HANA via M_DATABASE (vue système HANA exposée dans ABAP)
            try:
                rows = self.conn.call(
                    "RFC_READ_TABLE",
                    QUERY_TABLE="M_DATABASE",
                    DELIMITER="|",
                    FIELDS=[
                        {"FIELDNAME": "VERSION"},
                        {"FIELDNAME": "SYSTEM_ID"},
                        {"FIELDNAME": "START_TIME"},
                    ],
                    ROWCOUNT=1,
                )
                parsed = _parse_table(rows)
                if parsed:
                    result["hana_version"]    = _trim(parsed[0], "VERSION")
                    result["hana_start_time"] = _trim(parsed[0], "START_TIME")
            except Exception:
                logger.debug("DB stats: M_DATABASE not readable (HANA)")

            # Mémoire HANA par service via M_SERVICE_MEMORY
            try:
                rows = self.conn.call(
                    "RFC_READ_TABLE",
                    QUERY_TABLE="M_SERVICE_MEMORY",
                    DELIMITER="|",
                    FIELDS=[
                        {"FIELDNAME": "SERVICE_NAME"},
                        {"FIELDNAME": "HEAP_MEMORY_ALLOCATED_SIZE"},
                        {"FIELDNAME": "HEAP_MEMORY_USED_SIZE"},
                        {"FIELDNAME": "SHARED_MEMORY_ALLOCATED_SIZE"},
                        {"FIELDNAME": "ALLOCATION_LIMIT"},
                    ],
                    ROWCOUNT=20,
                )
                services = []
                total_alloc = 0
                total_used  = 0
                alloc_limit = 0
                for r in _parse_table(rows):
                    heap_alloc = int(_trim(r, "HEAP_MEMORY_ALLOCATED_SIZE") or 0)
                    heap_used  = int(_trim(r, "HEAP_MEMORY_USED_SIZE") or 0)
                    limit      = int(_trim(r, "ALLOCATION_LIMIT") or 0)
                    total_alloc += heap_alloc
                    total_used  += heap_used
                    if limit > alloc_limit:
                        alloc_limit = limit
                    services.append({
                        "service":     _trim(r, "SERVICE_NAME"),
                        "alloc_gb":    round(heap_alloc / 1_073_741_824, 1),
                        "used_gb":     round(heap_used  / 1_073_741_824, 1),
                    })
                result["hana_services"]    = services
                result["hana_total_alloc_gb"] = round(total_alloc / 1_073_741_824, 1)
                result["hana_total_used_gb"]  = round(total_used  / 1_073_741_824, 1)
                if alloc_limit > 0:
                    result["hana_alloc_limit_gb"] = round(alloc_limit / 1_073_741_824, 1)
                    result["hana_used_pct"] = round(total_used / alloc_limit * 100, 1)
            except Exception:
                logger.debug("DB stats: M_SERVICE_MEMORY not readable (HANA)")

            # Colonnes HANA delta merge (indicateur de santé column store)
            try:
                rows = self.conn.call(
                    "RFC_READ_TABLE",
                    QUERY_TABLE="M_CS_TABLES",
                    DELIMITER="|",
                    FIELDS=[
                        {"FIELDNAME": "MEMORY_SIZE_IN_TOTAL"},
                        {"FIELDNAME": "ESTIMATED_MAX_MEMORY_SIZE_IN_TOTAL"},
                    ],
                    ROWCOUNT=1,
                )
                parsed = _parse_table(rows)
                if parsed:
                    result["hana_column_store_gb"] = round(
                        int(_trim(parsed[0], "MEMORY_SIZE_IN_TOTAL") or 0) / 1_073_741_824, 1
                    )
            except Exception:
                logger.debug("DB stats: M_CS_TABLES not readable (HANA)")

            # HANA System Replication (HSR) status
            result["hsr"] = self._get_hana_hsr()

        # ── Oracle / DB2 : version ────────────────────────────────────────────
        if db_type in ("ORA", "DB6", "MSS", "SYB", "ADA"):
            try:
                rows = self.conn.call(
                    "RFC_READ_TABLE",
                    QUERY_TABLE="SVERS",
                    DELIMITER="|",
                    FIELDS=[
                        {"FIELDNAME": "DBVERSION"},
                        {"FIELDNAME": "COMPONENT"},
                    ],
                    OPTIONS=[{"TEXT": "COMPONENT = 'DATABASE'"}],
                    ROWCOUNT=1,
                )
                parsed = _parse_table(rows)
                if parsed:
                    result["db_version"] = _trim(parsed[0], "DBVERSION")
            except Exception:
                pass

        return result

    def _get_hana_hsr(self) -> dict[str, Any]:
        """M_SYSTEM_REPLICATION — HANA System Replication status.

        Returns {"configured": False} when HSR is not set up.
        Returns {"configured": True, "status": "ACTIVE"|..., "mode": "SYNC"|..., "sites": [...]}
        when HSR is configured.
        """
        result: dict[str, Any] = {"configured": False}
        try:
            rows = self.conn.call(
                "RFC_READ_TABLE",
                QUERY_TABLE="M_SYSTEM_REPLICATION",
                DELIMITER="|",
                FIELDS=[
                    {"FIELDNAME": "SITE_NAME"},
                    {"FIELDNAME": "SECONDARY_SITE_NAME"},
                    {"FIELDNAME": "SECONDARY_HOST"},
                    {"FIELDNAME": "REPLICATION_STATUS"},
                    {"FIELDNAME": "REPLICATION_MODE"},
                    {"FIELDNAME": "SECONDARY_ACTIVE_STATUS"},
                ],
                ROWCOUNT=10,
            )
            sites = _parse_table(rows)
            if not sites:
                return result

            result["configured"] = True
            result["sites"] = [
                {
                    "site_name":       _trim(s, "SITE_NAME"),
                    "secondary_site":  _trim(s, "SECONDARY_SITE_NAME"),
                    "secondary_host":  _trim(s, "SECONDARY_HOST"),
                    "status":          _trim(s, "REPLICATION_STATUS"),
                    "mode":            _trim(s, "REPLICATION_MODE"),
                    "secondary_active": _trim(s, "SECONDARY_ACTIVE_STATUS") == "YES",
                }
                for s in sites
            ]
            statuses = [s["status"] for s in result["sites"]]
            result["status"] = "ACTIVE" if all(s == "ACTIVE" for s in statuses) else (statuses[0] if statuses else "UNKNOWN")
            result["mode"] = result["sites"][0]["mode"] if result["sites"] else ""
        except Exception:
            logger.debug("HANA HSR: M_SYSTEM_REPLICATION not readable")
        return result

    def get_qrfc_queues(self) -> dict[str, Any]:
        """qRFC outbound/inbound queue status — SMQ1 (ARFCSSTATE) / SMQ2 (ARFCRSTATE)."""
        result: dict[str, Any] = {}

        # Outbound qRFC — SMQ1
        try:
            rows = self.conn.call(
                "RFC_READ_TABLE",
                QUERY_TABLE="ARFCSSTATE",
                DELIMITER="|",
                FIELDS=[
                    {"FIELDNAME": "ARFCIPID"},
                    {"FIELDNAME": "ARFCSTATE"},
                    {"FIELDNAME": "ARFCDEST"},
                ],
                OPTIONS=[{"TEXT": "ARFCSTATE <> 'executed'"}],
                ROWCOUNT=500,
            )
            entries = _parse_table(rows)
            errors  = [r for r in entries if _trim(r, "ARFCSTATE") == "SYSFAIL"]
            result["outbound_total"]  = len(entries)
            result["outbound_errors"] = len(errors)
        except Exception:
            logger.debug("SMQ1: ARFCSSTATE not readable")

        # Inbound qRFC — SMQ2
        try:
            rows = self.conn.call(
                "RFC_READ_TABLE",
                QUERY_TABLE="ARFCRSTATE",
                DELIMITER="|",
                FIELDS=[
                    {"FIELDNAME": "ARFCIPID"},
                    {"FIELDNAME": "ARFCSTATE"},
                ],
                OPTIONS=[{"TEXT": "ARFCSTATE <> 'executed'"}],
                ROWCOUNT=500,
            )
            entries = _parse_table(rows)
            errors  = [r for r in entries if _trim(r, "ARFCSTATE") == "SYSFAIL"]
            result["inbound_total"]  = len(entries)
            result["inbound_errors"] = len(errors)
        except Exception:
            logger.debug("SMQ2: ARFCRSTATE not readable")

        return result

    def get_background_jobs(self) -> dict[str, Any]:
        """TBTCO — active, scheduled and delayed background jobs."""
        result: dict[str, Any] = {}
        now_date = datetime.now().strftime("%Y%m%d")
        now_time = datetime.now().strftime("%H%M%S")

        # Currently running jobs
        try:
            rows = self.conn.call(
                "RFC_READ_TABLE",
                QUERY_TABLE="TBTCO",
                FIELDS=[{"FIELDNAME": "JOBNAME"}, {"FIELDNAME": "SDLUNAME"}],
                OPTIONS=[{"TEXT": "STATUS = 'R'"}],
                ROWCOUNT=200,
            )
            result["active_count"] = len(_parse_table(rows))
        except Exception:
            logger.debug("BGjobs: TBTCO active not readable")

        # Delayed jobs (scheduled before now, still waiting)
        try:
            rows = self.conn.call(
                "RFC_READ_TABLE",
                QUERY_TABLE="TBTCO",
                FIELDS=[{"FIELDNAME": "JOBNAME"}, {"FIELDNAME": "SDLSTRTDT"},
                        {"FIELDNAME": "SDLSTRTTM"}, {"FIELDNAME": "SDLUNAME"}],
                OPTIONS=[
                    {"TEXT": f"STATUS = 'S'"},
                    {"TEXT": f" AND SDLSTRTDT < '{now_date}'"},
                ],
                ROWCOUNT=200,
            )
            delayed = _parse_table(rows)
            result["delayed_count"] = len(delayed)
            result["delayed_jobs"]  = [
                {
                    "name": _trim(r, "JOBNAME"),
                    "user": _trim(r, "SDLUNAME"),
                    "scheduled": _trim(r, "SDLSTRTDT") + " " + _trim(r, "SDLSTRTTM"),
                }
                for r in delayed[:20]
            ]
        except Exception:
            logger.debug("BGjobs: TBTCO delayed not readable")

        return result

    def get_update_info(self) -> dict[str, Any]:
        """VBHDR — update system errors (SM13)."""
        result: dict[str, Any] = {}
        try:
            rows = self.conn.call(
                "RFC_READ_TABLE",
                QUERY_TABLE="VBHDR",
                FIELDS=[{"FIELDNAME": "VBKEY"}, {"FIELDNAME": "VBMOD"},
                        {"FIELDNAME": "VBCLI"}, {"FIELDNAME": "VBERR"}],
                OPTIONS=[{"TEXT": "VBERR <> ' '"}],
                ROWCOUNT=200,
            )
            result["update_errors"] = len(_parse_table(rows))
        except Exception:
            logger.debug("Update: VBHDR not readable")
        return result

    def get_stms_domain_info(self) -> dict[str, Any]:
        """STMS domain: domain members (TMSYSTEM) and transport routes (TMSROUTE)."""
        result: dict[str, Any] = {}

        # Domain members — which systems are in the same STMS domain + who is DC
        try:
            rows = self.conn.call(
                "RFC_READ_TABLE",
                QUERY_TABLE="TMSYSTEM",
                DELIMITER="|",
                FIELDS=[
                    {"FIELDNAME": "SYSID"},
                    {"FIELDNAME": "DOMCTRL"},
                    {"FIELDNAME": "DOMNAME"},
                    {"FIELDNAME": "SYSTXT"},
                    {"FIELDNAME": "SYSCONDID"},   # consolidation system ID (empty on DC/PRD)
                ],
                ROWCOUNT=50,
            )
            result["domain_systems"] = [
                {
                    "sid":    _trim(r, "SYSID"),
                    "is_dc":  _trim(r, "DOMCTRL") == "X",
                    "domain": _trim(r, "DOMNAME"),
                    "name":   _trim(r, "SYSTXT"),
                    "consolidation_target": _trim(r, "SYSCONDID"),
                }
                for r in _parse_table(rows)
                if _trim(r, "SYSID")
            ]
        except Exception:
            logger.debug("STMS: TMSYSTEM not readable")

        # Transport routes — explicit source → target pairs with route name
        try:
            rows = self.conn.call(
                "RFC_READ_TABLE",
                QUERY_TABLE="TMSROUTE",
                DELIMITER="|",
                FIELDS=[
                    {"FIELDNAME": "SYSNAM"},   # source system SID
                    {"FIELDNAME": "SYSTO"},    # target system SID
                    {"FIELDNAME": "ROUTNAM"},  # route name
                    {"FIELDNAME": "ROUTDSC"},  # route description
                ],
                ROWCOUNT=200,
            )
            result["routes"] = [
                {
                    "from":        _trim(r, "SYSNAM"),
                    "to":          _trim(r, "SYSTO"),
                    "route_name":  _trim(r, "ROUTNAM"),
                    "description": _trim(r, "ROUTDSC"),
                }
                for r in _parse_table(rows)
                if _trim(r, "SYSNAM") and _trim(r, "SYSTO")
            ]
        except Exception:
            logger.debug("STMS: TMSROUTE not readable")

        return result

    def get_spool_info(self) -> dict[str, Any]:
        """TSP01 — pending spool output requests."""
        result: dict[str, Any] = {}
        try:
            rows = self.conn.call(
                "RFC_READ_TABLE",
                QUERY_TABLE="TSP01",
                FIELDS=[{"FIELDNAME": "RQIDENT"}],
                OPTIONS=[{"TEXT": "RQSTATE = 'WAITING'"}],
                ROWCOUNT=500,
            )
            result["pending_count"] = len(_parse_table(rows))
        except Exception:
            logger.debug("Spool: TSP01 not readable")
        return result

    def get_system_messages(self) -> list[dict[str, Any]]:
        """SMSGMESSAGE / SM02 — active system-wide messages."""
        try:
            rows = self.conn.call(
                "RFC_READ_TABLE",
                QUERY_TABLE="SMSGMESSAGE",
                FIELDS=[
                    {"FIELDNAME": "SMSGID"},
                    {"FIELDNAME": "MSGTEXT"},
                    {"FIELDNAME": "EXPDATE"},
                    {"FIELDNAME": "EXPTIME"},
                    {"FIELDNAME": "CREUSER"},
                ],
                ROWCOUNT=20,
            )
            return [
                {
                    "id":      _trim(r, "SMSGID"),
                    "text":    _trim(r, "MSGTEXT"),
                    "expires": _trim(r, "EXPDATE") + " " + _trim(r, "EXPTIME"),
                    "user":    _trim(r, "CREUSER"),
                }
                for r in _parse_table(rows)
                if _trim(r, "MSGTEXT")
            ]
        except Exception:
            logger.debug("System messages: SMSGMESSAGE not readable")
            return []

    def get_health_indicators(self) -> dict[str, Any]:
        """Collect health indicators for the global system health score.

        Each sub-collector is wrapped in its own try/except — a failure
        (permission, DB type incompatibility, etc.) simply omits that
        indicator from the result.  The backend scorer handles missing domains
        gracefully.
        """
        result: dict[str, Any] = {}
        seven_days_ago = (datetime.now() - timedelta(days=7)).strftime("%Y%m%d")

        # Short dumps (ST22) — last 7 days
        try:
            rows = self.conn.call(
                "RFC_READ_TABLE",
                QUERY_TABLE="SNAP",
                FIELDS=[{"FIELDNAME": "DATUM"}],
                OPTIONS=[{"TEXT": f"DATUM >= '{seven_days_ago}'"}],
                ROWCOUNT=500,
            )
            result["dumps_7d"] = len(_parse_table(rows))
        except Exception:
            logger.debug("Health: SNAP table not readable")

        # Background jobs aborted — last 7 days
        try:
            rows = self.conn.call(
                "RFC_READ_TABLE",
                QUERY_TABLE="TBTCO",
                FIELDS=[{"FIELDNAME": "JOBNAME"}],
                OPTIONS=[
                    {"TEXT": f"SDLSTRTDT >= '{seven_days_ago}'"},
                    {"TEXT": " AND STATUS = 'A'"},
                ],
                ROWCOUNT=500,
            )
            result["jobs_aborted_7d"] = len(_parse_table(rows))
        except Exception:
            logger.debug("Health: TBTCO table not readable")

        # Work processes in abnormal state (PRIV / Stopped)
        try:
            wp_result = self.conn.call("TH_WPINFO")
            wplist = wp_result.get("WPLIST", [])
            priv_labels    = {"Hold", "PRIV", "2"}
            stopped_labels = {"Stop", "Stopped", "STOP", "3"}
            result["wp_priv"]    = sum(1 for wp in wplist if str(wp.get("WP_STATUS", "")).strip() in priv_labels)
            result["wp_stopped"] = sum(1 for wp in wplist if str(wp.get("WP_STATUS", "")).strip() in stopped_labels)
        except Exception:
            logger.debug("Health: TH_WPINFO not callable")

        # Asynchronous RFC errors (ARFCSSTATE)
        try:
            rows = self.conn.call(
                "RFC_READ_TABLE",
                QUERY_TABLE="ARFCSSTATE",
                FIELDS=[{"FIELDNAME": "ARFCSTATE"}],
                OPTIONS=[{"TEXT": "ARFCSTATE = 'SYSFAIL'"}],
                ROWCOUNT=200,
            )
            result["trfc_errors"] = len(_parse_table(rows))
        except Exception:
            logger.debug("Health: ARFCSSTATE table not readable")

        # Tablespace fill level (DBSNP — Oracle/DB2 only, silently skipped for HANA)
        try:
            rows = self.conn.call(
                "RFC_READ_TABLE",
                QUERY_TABLE="DBSNP",
                FIELDS=[
                    {"FIELDNAME": "TSNAME"},
                    {"FIELDNAME": "ALLOCATED"},
                    {"FIELDNAME": "USED"},
                ],
                ROWCOUNT=50,
            )
            tablespaces = []
            for row in _parse_table(rows):
                name      = _trim(row, "TSNAME")
                allocated = _trim(row, "ALLOCATED")
                used      = _trim(row, "USED")
                if name and allocated and used:
                    try:
                        pct = round(int(used) / int(allocated) * 100, 1)
                        tablespaces.append({"name": name, "used_pct": pct})
                    except (ValueError, ZeroDivisionError):
                        pass
            if tablespaces:
                result["tablespaces"] = tablespaces
        except Exception:
            logger.debug("Health: DBSNP not readable (non-Oracle DB or insufficient auth)")

        # Locked user accounts (USR02.UFLAG != 0)
        try:
            rows = self.conn.call(
                "RFC_READ_TABLE",
                QUERY_TABLE="USR02",
                FIELDS=[{"FIELDNAME": "BNAME"}],
                OPTIONS=[{"TEXT": "UFLAG <> 0"}],
                ROWCOUNT=500,
            )
            result["users_locked"] = len(_parse_table(rows))
        except Exception:
            logger.debug("Health: USR02 table not readable")

        return result

    # ------------------------------------------------------------------
    # System type detection
    # ------------------------------------------------------------------

    @staticmethod
    def detect_system_type(
        components: list[dict[str, str]],
        system_info: dict[str, Any],
    ) -> str:
        """
        Dérive le type fonctionnel du système SAP depuis la liste de composants
        installés (CVERS) et les infos système RFC.

        Valeurs possibles :
          S/4HANA · BW/4HANA · BW · ECC · CRM · SRM · SolMan · PI/PO
          Fiori · GRC · ABAP · Java · Unknown
        """
        comps = {c.get("component", "").upper() for c in components}
        sid   = system_info.get("rfcsysid", "").upper()
        opsys = system_info.get("rfcopsys", "").upper()

        # ── Détection prioritaire par composant ──────────────────────────
        if "S4CORE" in comps:
            return "S/4HANA"
        if "DW4CORE" in comps:
            return "BW/4HANA"
        if "BW" in comps or "BI_CONT" in comps:
            return "BW"
        if "LCMGT" in comps:          # Landscape Config Management → SolMan
            return "SolMan"
        if "XICORE" in comps or "XI_BASIS" in comps or "XITOOL" in comps:
            return "PI/PO"
        if "BBPCRM" in comps or "CRM_APPLICATION" in comps:
            return "CRM"
        if "SRMSERVER" in comps:
            return "SRM"
        if "GRCFND_A" in comps or "GRC_FOUNDATION" in comps:
            return "GRC"
        if "SAP_GWFND" in comps and "SAP_APPL" not in comps and "S4CORE" not in comps:
            return "Fiori"
        if "SAP_APPL" in comps or "EA-APPL" in comps:
            return "ECC"
        if "SAP_BASIS" in comps:
            return "ABAP"             # BASIS présent mais aucun composant fonctionnel reconnu
        if not comps and "JAVA" in opsys.upper():
            return "Java"

        return "Unknown"

    def get_certificates(self, db_type: str = "") -> dict[str, Any]:
        """SSL/TLS certificate expiry from ABAP PSEs (STRUST) and HANA M_PSE_CERTIFICATES."""
        result: dict[str, Any] = {"abap": [], "hana": []}
        today = datetime.now(timezone.utc).date()

        # ── ABAP: liste des PSEs via SSFR_PSE_LIST, détails via SSFR_PSE_GET ──
        try:
            pse_list = self.conn.call("SSFR_PSE_LIST").get("PSELIST", [])
        except Exception:
            logger.debug("Certificates: SSFR_PSE_LIST not callable")
            pse_list = []

        for pse_entry in pse_list:
            ctx    = str(pse_entry.get("PSE_CONTEXT", "")).strip()
            applic = str(pse_entry.get("PSE_APPLIC",  "")).strip()
            desc   = str(pse_entry.get("DESCRIPTION", "")).strip()
            if not ctx:
                continue
            try:
                info    = self.conn.call("SSFR_PSE_GET", PSE_CONTEXT=ctx, PSE_APPLIC=applic)
                subject = str(info.get("SUBJECT", "")).strip()
                issuer  = str(info.get("ISSUER",  "")).strip()
                begda   = info.get("BEGDA")
                endda   = info.get("ENDDA")
                if not subject or endda is None:
                    continue
                # Skip SAP's "no expiry" sentinel 9999-12-31
                if hasattr(endda, "year") and endda.year >= 9999:
                    continue
                days = _cert_days_remaining(endda, today)
                result["abap"].append({
                    "pse_context":    ctx,
                    "pse_applic":     applic,
                    "description":    desc,
                    "subject":        subject,
                    "issuer":         issuer,
                    "valid_from":     str(begda) if begda else "",
                    "valid_to":       str(endda),
                    "days_remaining": days,
                    "status":         _cert_status(days),
                })
            except Exception:
                logger.debug("Certificates: SSFR_PSE_GET failed for %s/%s", ctx, applic)

        # ── HANA: M_PSE_CERTIFICATES ─────────────────────────────────────────
        if db_type == "HDB":
            try:
                rows = self.conn.call(
                    "RFC_READ_TABLE",
                    QUERY_TABLE="M_PSE_CERTIFICATES",
                    DELIMITER="|",
                    FIELDS=[
                        {"FIELDNAME": "PSE_NAME"},
                        {"FIELDNAME": "SUBJECT"},
                        {"FIELDNAME": "ISSUER"},
                        {"FIELDNAME": "VALID_FROM"},
                        {"FIELDNAME": "VALID_UNTIL"},
                        {"FIELDNAME": "PURPOSE"},
                    ],
                    ROWCOUNT=200,
                )
                for row in _parse_table(rows):
                    valid_until = _trim(row, "VALID_UNTIL").strip()
                    days = _cert_days_remaining(valid_until, today)
                    result["hana"].append({
                        "pse_name":       _trim(row, "PSE_NAME"),
                        "subject":        _trim(row, "SUBJECT"),
                        "issuer":         _trim(row, "ISSUER"),
                        "valid_from":     _trim(row, "VALID_FROM").strip(),
                        "valid_to":       valid_until,
                        "days_remaining": days,
                        "status":         _cert_status(days),
                    })
            except Exception:
                logger.debug("Certificates: M_PSE_CERTIFICATES not readable")

        all_certs = result["abap"] + result["hana"]
        result["summary"] = {
            "total":    len(all_certs),
            "expired":  sum(1 for c in all_certs if c["status"] == "EXPIRED"),
            "critical": sum(1 for c in all_certs if c["status"] == "CRITICAL"),
            "warning":  sum(1 for c in all_certs if c["status"] == "WARNING"),
            "ok":       sum(1 for c in all_certs if c["status"] == "OK"),
        }
        return result

    # ------------------------------------------------------------------
    # Full snapshot
    # ------------------------------------------------------------------

    def collect(self) -> dict[str, Any]:
        """Run all collectors and return a single snapshot dict."""
        collected_at = datetime.now(timezone.utc).isoformat()

        system_info       = self.get_system_info()
        components        = self.get_component_versions()
        system_type       = self.detect_system_type(components, system_info)
        sup_packages      = self.get_support_packages()
        custom_objects    = self.get_custom_objects()
        health_indicators = self.get_health_indicators()
        instances         = self.get_instances()
        security          = self.get_security_info()
        transports        = self.get_transport_info()
        stms_domain       = self.get_stms_domain_info()
        license_info      = self.get_license_info()
        performance       = self.get_performance_stats()
        background_jobs   = self.get_background_jobs()
        profile_params    = self.get_profile_params()
        db_stats          = self.get_db_stats(system_info)
        jobs_error_24h    = self.get_jobs_error_24h()
        sm12_locks        = self.get_sm12_locks()
        st22_24h          = self.get_st22_24h()
        qrfc_queues       = self.get_qrfc_queues()
        update_info       = self.get_update_info()
        spool             = self.get_spool_info()
        system_messages   = self.get_system_messages()
        certificates      = self.get_certificates(system_info.get("rfcdbsys", ""))

        sid = system_info.get("rfcsysid", "?")
        logger.info(
            "SID=%-3s  instances=%d  security_issues=%d  transport_queue=%d",
            sid,
            len(instances),
            len(security.get("default_users_active", [])) + len(security.get("sap_all_users", [])),
            transports.get("import_queue_count", 0),
        )

        return {
            "schema_version":   "2",
            "collected_at":     collected_at,
            "system":           system_info,
            "system_type":      system_type,
            "components":       components,
            "support_packages": sup_packages,
            "custom_objects":   custom_objects,
            "health":           health_indicators,
            "instances":        instances,
            "security":         security,
            "transports":       transports,
            "stms_domain":      stms_domain,
            "license_info":     license_info,
            "performance":      performance,
            "background_jobs":  background_jobs,
            "profile_params":   profile_params,
            "db_stats":         db_stats,
            "jobs_error_24h":   jobs_error_24h,
            "sm12_locks":       sm12_locks,
            "st22_24h":         st22_24h,
            "qrfc_queues":      qrfc_queues,
            "update_info":      update_info,
            "spool":            spool,
            "system_messages":  system_messages,
            "certificates":     certificates,
        }


# ------------------------------------------------------------------
# RFC_READ_TABLE helpers
# ------------------------------------------------------------------

def _parse_table(rfc_result: dict) -> list[dict[str, str]]:
    """
    RFC_READ_TABLE returns DATA as a list of dicts with a single 'WA' key
    (one fixed-width string per row) and FIELDS with name+offset+length.
    Parse each row into a proper {fieldname: value} dict.
    """
    fields = rfc_result.get("FIELDS", [])
    data   = rfc_result.get("DATA", [])

    if not fields:
        return []

    # Build slice specs once
    slices = []
    for f in fields:
        name   = f.get("FIELDNAME", "").strip()
        offset = int(f.get("OFFSET", 0))
        length = int(f.get("LENGTH", 0))
        slices.append((name, offset, offset + length))

    parsed = []
    for row in data:
        wa = row.get("WA", "")
        parsed.append({name: wa[start:end] for name, start, end in slices})

    return parsed


def _trim(row: dict[str, str], key: str) -> str:
    return row.get(key, "").strip()


def _cert_days_remaining(end_date: Any, today: Any) -> int:
    """Days until certificate expiry.

    Accepts a Python datetime.date (pyrfc type D) or a string
    in YYYY-MM-DD[...] (HANA timestamp) or YYYYMMDD (SAP date) format.
    Returns 9999 when the date cannot be parsed.
    """
    from datetime import date as _date
    try:
        if isinstance(end_date, _date):
            return (end_date - today).days
        s = str(end_date).strip()
        if len(s) >= 10 and s[4] == "-":        # YYYY-MM-DD (HANA timestamp)
            d = _date(int(s[:4]), int(s[5:7]), int(s[8:10]))
        elif len(s) == 8 and s.isdigit():        # YYYYMMDD
            d = _date(int(s[:4]), int(s[4:6]), int(s[6:8]))
        else:
            return 9999
        return (d - today).days
    except Exception:
        return 9999


def _cert_status(days: int) -> str:
    if days <= 0:
        return "EXPIRED"
    if days <= 7:
        return "CRITICAL"
    if days <= 30:
        return "WARNING"
    return "OK"
