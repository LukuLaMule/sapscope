"""
Health score computation from agent-collected indicators.

Score: 0–100 (weighted average over available domains)
Status: OK (≥80) | WARNING (≥50) | CRITICAL (<50) | UNKNOWN (no data)

Domains and weights:
  stability      20%  — ABAP dumps + aborted jobs (last 7 days)
  performance    20%  — work processes in PRIV/Stopped state
  connectivity   15%  — tRFC/qRFC errors in ARFCSSTATE
  infrastructure 15%  — tablespace fill level
  security_ops   20%  — default users, SAP_ALL, RFC sans logon (v2)
  security_users  5%  — locked user accounts
  transports      5%  — import queue size (v2)

Missing domains are excluded from the weighted average rather than penalised.
"""

from typing import Any

_WEIGHTS: dict[str, float] = {
    "stability":      0.20,
    "performance":    0.20,
    "connectivity":   0.15,
    "infrastructure": 0.15,
    "security_ops":   0.20,   # v2 — default users, SAP_ALL, RFC
    "security":       0.05,   # locked users (informative)
    "transports":     0.05,   # import queue
    "hsr":            0.15,   # HANA System Replication — only scored when configured
    "certificates":   0.10,   # SSL/TLS expiry — only scored when PSEs readable
}


def compute(health_data: dict[str, Any] | None,
            security_data: dict[str, Any] | None = None,
            transport_data: dict[str, Any] | None = None,
            db_stats_data: dict[str, Any] | None = None,
            cert_data: dict[str, Any] | None = None) -> dict[str, Any]:
    """
    Compute global score + per-domain indicators from the 'health' key of a snapshot payload.
    Returns a dict ready to be stored in health_checks.indicators.
    """
    if not health_data:
        return {"score": 0, "status": "UNKNOWN", "indicators": {}}

    domain_scores: dict[str, int] = {}
    indicators: dict[str, Any] = {}

    # ── Stability: dumps + aborted jobs ──────────────────────────────────────
    dumps         = health_data.get("dumps_7d")
    jobs_aborted  = health_data.get("jobs_aborted_7d")
    if dumps is not None or jobs_aborted is not None:
        d = dumps or 0
        j = jobs_aborted or 0
        worst = max(d, j)
        if worst == 0:
            s = 100
        elif worst <= 2:
            s = 80
        elif worst <= 5:
            s = 50
        else:
            s = 20
        domain_scores["stability"] = s
        indicators["stability"] = {
            "status":          _label(s),
            "score":           s,
            "dumps_7d":        d,
            "jobs_aborted_7d": j,
        }

    # ── Performance: work processes in abnormal state ─────────────────────────
    wp_priv    = health_data.get("wp_priv")
    wp_stopped = health_data.get("wp_stopped")
    if wp_priv is not None or wp_stopped is not None:
        total = (wp_priv or 0) + (wp_stopped or 0)
        if total == 0:
            s = 100
        elif total == 1:
            s = 70
        elif total <= 3:
            s = 40
        else:
            s = 10
        domain_scores["performance"] = s
        indicators["performance"] = {
            "status":     _label(s),
            "score":      s,
            "wp_priv":    wp_priv or 0,
            "wp_stopped": wp_stopped or 0,
        }

    # ── Connectivity: tRFC/qRFC errors ───────────────────────────────────────
    trfc_errors = health_data.get("trfc_errors")
    if trfc_errors is not None:
        if trfc_errors == 0:
            s = 100
        elif trfc_errors <= 5:
            s = 80
        elif trfc_errors <= 20:
            s = 50
        else:
            s = 20
        domain_scores["connectivity"] = s
        indicators["connectivity"] = {
            "status":      _label(s),
            "score":       s,
            "trfc_errors": trfc_errors,
        }

    # ── Infrastructure: tablespace fill level ────────────────────────────────
    tablespaces = health_data.get("tablespaces")
    if tablespaces:
        max_pct     = max((ts.get("used_pct", 0) for ts in tablespaces), default=0)
        critical_ts = [ts["name"] for ts in tablespaces if ts.get("used_pct", 0) >= 90]
        warning_ts  = [ts["name"] for ts in tablespaces if 80 <= ts.get("used_pct", 0) < 90]
        if max_pct < 75:
            s = 100
        elif max_pct < 85:
            s = 75
        elif max_pct < 92:
            s = 40
        else:
            s = 10
        domain_scores["infrastructure"] = s
        indicators["infrastructure"] = {
            "status":       _label(s),
            "score":        s,
            "max_used_pct": max_pct,
            "critical":     critical_ts,
            "warning":      warning_ts,
        }

    # ── Security: locked users (informative — low weight) ───────────────────
    users_locked = health_data.get("users_locked")
    if users_locked is not None:
        if users_locked <= 3:
            s = 100
        elif users_locked <= 10:
            s = 80
        else:
            s = 60
        domain_scores["security"] = s
        indicators["security"] = {
            "status":       _label(s),
            "score":        s,
            "users_locked": users_locked,
        }

    # ── Security ops: default users, SAP_ALL, RFC sans logon (v2) ──────────────
    if security_data:
        default_users       = security_data.get("default_users_active", [])
        sap_all             = security_data.get("sap_all_users", [])
        rfc_no_logon        = security_data.get("rfc_no_logon_count", 0)
        inactive_users      = security_data.get("inactive_users_count", 0) or 0
        never_logged_in     = security_data.get("never_logged_in_count", 0) or 0
        sap_new_count       = security_data.get("sap_new_count", 0) or 0

        if default_users:          # SAP* ou DDIC actif → critique
            s = 10
        elif sap_all:              # utilisateurs SAP_ALL
            s = 30 if len(sap_all) > 3 else 50
        elif rfc_no_logon > 10:
            s = 60
        elif rfc_no_logon > 3:
            s = 80
        else:
            s = 100

        # Additional penalties — applied after base score calculation
        if inactive_users > 50:
            s = max(0, s - 10)
        elif inactive_users > 20:
            s = max(0, s - 5)
        if never_logged_in > 10:
            s = max(0, s - 3)
        if sap_new_count > 0:
            s = max(0, s - 5)

        domain_scores["security_ops"] = s
        indicators["security_ops"] = {
            "status":               _label(s),
            "score":                s,
            "default_users_active": default_users,
            "sap_all_count":        len(sap_all),
            "rfc_no_logon_count":   rfc_no_logon,
            "inactive_users_count": inactive_users,
            "never_logged_in_count": never_logged_in,
            "sap_new_count":        sap_new_count,
        }

    # ── Transports: import queue size (v2) ───────────────────────────────────
    if transport_data:
        queue = transport_data.get("import_queue_count", 0)
        if queue == 0:
            s = 100
        elif queue <= 10:
            s = 90
        elif queue <= 50:
            s = 70
        elif queue <= 200:
            s = 50
        else:
            s = 20
        domain_scores["transports"] = s
        indicators["transports"] = {
            "status":             _label(s),
            "score":              s,
            "import_queue_count": queue,
            "recent_imports_count": transport_data.get("recent_imports_count", 0),
        }

    # ── HANA System Replication (HSR) ────────────────────────────────────────
    if db_stats_data:
        hsr = db_stats_data.get("hsr", {})
        if hsr and hsr.get("configured"):
            hsr_status = hsr.get("status", "UNKNOWN")
            if hsr_status == "ACTIVE":
                s = 100
            elif hsr_status in ("SYNCING", "INITIALIZING"):
                s = 60
            else:
                s = 10
            sites = hsr.get("sites", [])
            secondary_host = sites[0].get("secondary_host", "") if sites else ""
            domain_scores["hsr"] = s
            indicators["hsr"] = {
                "status":               _label(s),
                "score":                s,
                "replication_status":   hsr_status,
                "replication_mode":     hsr.get("mode", ""),
                "secondary_host":       secondary_host,
            }

    # ── Certificates: SSL/TLS expiry ────────────────────────────────────────
    if cert_data:
        summary = cert_data.get("summary", {})
        total    = summary.get("total", 0)
        expired  = summary.get("expired", 0)
        critical = summary.get("critical", 0)
        warning  = summary.get("warning", 0)
        if total > 0:
            if expired > 0:
                s = 10
            elif critical > 0:
                s = 30
            elif warning > 0:
                s = 70
            else:
                s = 100
            domain_scores["certificates"] = s
            indicators["certificates"] = {
                "status":   _label(s),
                "score":    s,
                "total":    total,
                "expired":  expired,
                "critical": critical,
                "warning":  warning,
                "ok":       summary.get("ok", 0),
            }

    if not domain_scores:
        return {"score": 0, "status": "UNKNOWN", "indicators": {}}

    # Weighted average — only over domains that were collected
    total_weight  = sum(_WEIGHTS[k] for k in domain_scores if k in _WEIGHTS)
    global_score  = round(
        sum(domain_scores[k] * _WEIGHTS[k] for k in domain_scores if k in _WEIGHTS)
        / total_weight
    )

    return {
        "score":      global_score,
        "status":     _label(global_score),
        "indicators": indicators,
    }


def _label(score: int) -> str:
    if score >= 80:
        return "OK"
    elif score >= 50:
        return "WARNING"
    return "CRITICAL"
