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
        """RFC_SYSTEM_INFO — SID, hostname, OS, DB, kernel version."""
        logger.debug("Calling RFC_SYSTEM_INFO")
        result = self.conn.call("RFC_SYSTEM_INFO")
        ri = result.get("RFCSI_EXPORT", {})
        return {
            "rfchost":     ri.get("RFCHOST", ""),
            "rfcsysid":    ri.get("RFCSYSID", ""),
            "rfcdbhost":   ri.get("RFCDBHOST", ""),
            "rfcdbsys":    ri.get("RFCDBSYS", ""),
            "rfcsaprl":    ri.get("RFCSAPRL", ""),   # SAP release (e.g. 740)
            "rfckernrl":   ri.get("RFCKERNRL", ""),  # kernel release
            "rfcmach":     ri.get("RFCMACH", ""),    # machine type
            "rfcopsys":    ri.get("RFCOPSYS", ""),   # OS
            "rfctzone":    ri.get("RFCTZONE", ""),
            "rfcdayst":    ri.get("RFCDAYST", ""),
            "rfcipaddr":   ri.get("RFCIPADDR", ""),
            "rfcipv6addr": ri.get("RFCIPV6ADDR", ""),
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
    # Full snapshot
    # ------------------------------------------------------------------

    def collect(self) -> dict[str, Any]:
        """Run all collectors and return a single snapshot dict."""
        collected_at = datetime.now(timezone.utc).isoformat()

        system_info       = self.get_system_info()
        components        = self.get_component_versions()
        sup_packages      = self.get_support_packages()
        custom_objects    = self.get_custom_objects()
        health_indicators = self.get_health_indicators()

        return {
            "schema_version": "1",
            "collected_at": collected_at,
            "system": system_info,
            "components": components,
            "support_packages": sup_packages,
            "custom_objects": custom_objects,
            "health": health_indicators,
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
