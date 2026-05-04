"""
Génère un PDF "SAP Security Compliance Report" par système.
Utilise WeasyPrint (HTML → PDF) avec un template Jinja2 inline.
Inspiré des contrôles du SAP Security Guide.
"""

import logging
from datetime import datetime, timezone
from typing import Any

from jinja2 import BaseLoader, Environment

logger = logging.getLogger(__name__)

# ── Définition des contrôles de conformité ────────────────────────────────────

CHECKS = [
    # (id, catégorie, description, sévérité si KO)
    ("SEC-001", "Comptes par défaut",  "SAP* désactivé ou verrouillé",                          "CRITICAL"),
    ("SEC-002", "Comptes par défaut",  "DDIC désactivé ou verrouillé",                          "CRITICAL"),
    ("SEC-003", "Comptes par défaut",  "EARLYWATCH désactivé ou verrouillé",                    "HIGH"),
    ("SEC-004", "Autorisations",       "Aucun utilisateur avec SAP_ALL en production",           "CRITICAL"),
    ("SEC-005", "Autorisations",       "Aucun utilisateur avec SAP_NEW",                         "HIGH"),
    ("SEC-006", "Connexions RFC",      "Destinations RFC type-3 avec utilisateur logon défini",  "HIGH"),
    ("SEC-007", "Connexions RFC",      "Connexions RFC de confiance (TRUSTED) minimales (<5)",   "MEDIUM"),
    ("SEC-008", "Gestion des comptes", "Utilisateurs inactifs >90j : moins de 20",               "MEDIUM"),
    ("SEC-009", "Gestion des comptes", "Utilisateurs jamais connectés : moins de 10",            "MEDIUM"),
    ("SEC-010", "Gestion des comptes", "Comptes verrouillés <50% du total utilisateurs",         "LOW"),
]

_SEVERITY_ORDER = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}

_SEVERITY_COLOR = {
    "CRITICAL": "#dc2626",
    "HIGH":     "#ea580c",
    "MEDIUM":   "#d97706",
    "LOW":      "#2563eb",
    "PASS":     "#16a34a",
}

_SEVERITY_BG = {
    "CRITICAL": "#fee2e2",
    "HIGH":     "#ffedd5",
    "MEDIUM":   "#fef3c7",
    "LOW":      "#dbeafe",
    "PASS":     "#dcfce7",
}


# ── Logique d'évaluation ──────────────────────────────────────────────────────

def _evaluate_checks(
    security_data: dict[str, Any],
    connectivity_data: dict[str, Any],
) -> list[dict]:
    """
    Évalue chaque contrôle et retourne une liste de résultats.
    Chaque item : {id, category, description, severity, result, detail}
    result = "PASS" | "FAIL" | "UNKNOWN"
    """
    default_active: list = security_data.get("default_users_active", [])
    sap_all_users:  list = security_data.get("sap_all_users", [])
    sap_new_count:  int  = security_data.get("sap_new_count", 0) or 0
    rfc_no_logon:   int  = security_data.get("rfc_no_logon_count", 0) or 0
    rfc_trusted:    int  = security_data.get("rfc_trusted_count", 0) or 0
    inactive_users: int  = security_data.get("inactive_users_count", 0) or 0
    never_logged:   int  = security_data.get("never_logged_in_count", 0) or 0
    users_locked:   int  = connectivity_data.get("users_locked", 0) or 0

    results = []

    def _add(check_id: str, passed: bool | None, detail: str = ""):
        cat_map = {c[0]: (c[1], c[2], c[3]) for c in CHECKS}
        category, description, severity = cat_map[check_id]
        if passed is None:
            result = "UNKNOWN"
            effective_severity = "LOW"
        elif passed:
            result = "PASS"
            effective_severity = "PASS"
        else:
            result = "FAIL"
            effective_severity = severity
        results.append({
            "id":          check_id,
            "category":    category,
            "description": description,
            "severity":    effective_severity,
            "result":      result,
            "detail":      detail,
        })

    # SEC-001 : SAP* absent des utilisateurs actifs par défaut
    if default_active:
        passed = "SAP*" not in default_active and "SAP" not in default_active
        detail = "SAP* présent dans les comptes par défaut actifs" if not passed else ""
    else:
        passed = None
        detail = "Données non disponibles"
    _add("SEC-001", passed, detail)

    # SEC-002 : DDIC
    if default_active:
        passed = "DDIC" not in default_active
        detail = "DDIC présent dans les comptes par défaut actifs" if not passed else ""
    else:
        passed = None
        detail = "Données non disponibles"
    _add("SEC-002", passed, detail)

    # SEC-003 : EARLYWATCH
    if default_active:
        passed = "EARLYWATCH" not in default_active
        detail = "EARLYWATCH présent dans les comptes par défaut actifs" if not passed else ""
    else:
        passed = None
        detail = "Données non disponibles"
    _add("SEC-003", passed, detail)

    # SEC-004 : SAP_ALL
    passed = len(sap_all_users) == 0
    detail = f"{len(sap_all_users)} utilisateur(s) avec SAP_ALL : {', '.join(sap_all_users[:5])}" if not passed else ""
    _add("SEC-004", passed, detail)

    # SEC-005 : SAP_NEW
    passed = sap_new_count == 0
    detail = f"{sap_new_count} utilisateur(s) avec SAP_NEW" if not passed else ""
    _add("SEC-005", passed, detail)

    # SEC-006 : Destinations RFC sans utilisateur logon
    passed = rfc_no_logon == 0
    detail = f"{rfc_no_logon} destination(s) RFC type-3 sans utilisateur logon défini" if not passed else ""
    _add("SEC-006", passed, detail)

    # SEC-007 : Connexions RFC de confiance < 5
    passed = rfc_trusted < 5
    detail = f"{rfc_trusted} connexion(s) RFC de confiance (TRUSTED)" if not passed else ""
    _add("SEC-007", passed, detail)

    # SEC-008 : Utilisateurs inactifs < 20
    passed = inactive_users < 20
    detail = f"{inactive_users} utilisateur(s) inactifs depuis >90 jours" if not passed else ""
    _add("SEC-008", passed, detail)

    # SEC-009 : Jamais connectés < 10
    passed = never_logged < 10
    detail = f"{never_logged} utilisateur(s) jamais connectés" if not passed else ""
    _add("SEC-009", passed, detail)

    # SEC-010 : Verrouillés < 50 (valeur absolue)
    passed = users_locked < 50
    detail = f"{users_locked} compte(s) verrouillé(s)" if not passed else ""
    _add("SEC-010", passed, detail)

    return results


# ── Template HTML ─────────────────────────────────────────────────────────────

_HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
  @page {
    size: A4;
    margin: 15mm;
    @bottom-left   { content: "{{ client_name }} — {{ sid }}"; font-size: 8pt; color: #6b7280; font-family: sans-serif; }
    @bottom-center { content: "{{ report_date }}"; font-size: 8pt; color: #6b7280; font-family: sans-serif; }
    @bottom-right  { content: counter(page) " / " counter(pages) "  ·  Powered by SAPscope"; font-size: 7pt; color: #9ca3af; font-family: sans-serif; }
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif;
    color: #1a1a2e;
    font-size: 10pt;
    line-height: 1.5;
  }

  /* ── Cover page ── */
  .cover {
    background: #0d1f38;
    color: #f5f5f7;
    min-height: 257mm;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    page-break-after: always;
    padding: 20mm 15mm;
    position: relative;
  }

  .cover-brand {
    font-size: 22pt;
    font-weight: 700;
    color: #f5f5f7;
    letter-spacing: 0.05em;
    margin-bottom: 6mm;
  }
  .cover-brand span { color: #3b82f6; }

  .cover-title {
    font-size: 16pt;
    font-weight: 600;
    color: #cbd5e1;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-bottom: 10mm;
  }

  .cover-sid {
    font-size: 48pt;
    font-weight: 900;
    color: #ffffff;
    letter-spacing: 0.08em;
    margin-bottom: 4mm;
  }

  .cover-client {
    font-size: 16pt;
    font-weight: 600;
    color: #94a3b8;
    margin-bottom: 10mm;
  }

  .cover-date {
    font-size: 11pt;
    color: #6b7280;
    margin-bottom: 10mm;
  }

  .cover-footer {
    font-size: 8pt;
    color: #4b5563;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    border-top: 1px solid #1e3a5f;
    padding-top: 4mm;
    margin-top: 8mm;
    width: 100%;
    text-align: center;
  }

  /* ── Summary box ── */
  .summary-section {
    margin: 8mm 0 10mm;
    page-break-inside: avoid;
  }

  .summary-title {
    font-size: 13pt;
    font-weight: 700;
    color: #1a1a2e;
    margin-bottom: 5mm;
    padding-bottom: 2mm;
    border-bottom: 2px solid #e5e7eb;
  }

  .summary-grid {
    display: flex;
    gap: 4mm;
    flex-wrap: wrap;
    margin-bottom: 6mm;
  }

  .summary-card {
    flex: 1;
    min-width: 28mm;
    padding: 4mm 5mm;
    border-radius: 3mm;
    text-align: center;
    border: 1.5px solid;
  }

  .summary-card .count {
    font-size: 22pt;
    font-weight: 900;
    line-height: 1;
  }

  .summary-card .label {
    font-size: 8pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    margin-top: 1.5mm;
  }

  /* ── Checks table ── */
  .checks-title {
    font-size: 11pt;
    font-weight: 700;
    color: #1a1a2e;
    margin: 6mm 0 3mm;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 8.5pt;
  }

  thead th {
    background: #f3f4f6;
    padding: 2.5mm 3mm;
    text-align: left;
    font-weight: 700;
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #4b5563;
    border-bottom: 1.5px solid #d1d5db;
  }

  tbody tr { vertical-align: top; }

  tbody td {
    padding: 2.5mm 3mm;
    border-bottom: 1px solid #f3f4f6;
  }

  .badge {
    display: inline-block;
    padding: 0.8mm 3mm;
    border-radius: 3mm;
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .detail-text {
    font-size: 8pt;
    color: #6b7280;
    margin-top: 1mm;
  }

  /* ── Compliance footer note ── */
  .compliance-footer {
    margin-top: 10mm;
    font-size: 8pt;
    color: #9ca3af;
    text-align: center;
    border-top: 1px solid #e5e7eb;
    padding-top: 4mm;
  }
</style>
</head>
<body>

<!-- ═══════════════════════════════════════════════
     COVER PAGE
════════════════════════════════════════════════ -->
<div class="cover">
  <div class="cover-brand">SAP<span>scope</span></div>
  <div class="cover-title">Security Compliance Report</div>
  <div class="cover-sid">{{ sid }}</div>
  <div class="cover-client">{{ client_name }}</div>
  <div class="cover-date">{{ report_date }}</div>
  <div class="cover-footer">
    Basé sur le SAP Security Guide · Confidentiel
  </div>
</div>


<!-- ═══════════════════════════════════════════════
     SUMMARY
════════════════════════════════════════════════ -->
<div class="summary-section">
  <div class="summary-title">Synthèse des contrôles</div>

  <div class="summary-grid">
    {% if counts.CRITICAL > 0 %}
    <div class="summary-card"
         style="background: #fee2e2; border-color: #dc2626; color: #dc2626;">
      <div class="count">{{ counts.CRITICAL }}</div>
      <div class="label">Critique</div>
    </div>
    {% endif %}

    {% if counts.HIGH > 0 %}
    <div class="summary-card"
         style="background: #ffedd5; border-color: #ea580c; color: #ea580c;">
      <div class="count">{{ counts.HIGH }}</div>
      <div class="label">Élevé</div>
    </div>
    {% endif %}

    {% if counts.MEDIUM > 0 %}
    <div class="summary-card"
         style="background: #fef3c7; border-color: #d97706; color: #d97706;">
      <div class="count">{{ counts.MEDIUM }}</div>
      <div class="label">Moyen</div>
    </div>
    {% endif %}

    {% if counts.LOW > 0 %}
    <div class="summary-card"
         style="background: #dbeafe; border-color: #2563eb; color: #2563eb;">
      <div class="count">{{ counts.LOW }}</div>
      <div class="label">Faible</div>
    </div>
    {% endif %}

    <div class="summary-card"
         style="background: #dcfce7; border-color: #16a34a; color: #16a34a;">
      <div class="count">{{ counts.PASS }}</div>
      <div class="label">Conforme</div>
    </div>
  </div>
</div>


<!-- ═══════════════════════════════════════════════
     CHECKS TABLE
════════════════════════════════════════════════ -->
<div class="checks-title">Détail des contrôles</div>

<table>
  <thead>
    <tr>
      <th style="width: 12%">ID</th>
      <th style="width: 22%">Catégorie</th>
      <th style="width: 40%">Contrôle</th>
      <th style="width: 10%">Résultat</th>
      <th style="width: 16%">Détail</th>
    </tr>
  </thead>
  <tbody>
    {% for check in checks %}
    <tr style="background: {{ check.bg }};">
      <td style="font-weight: 700; color: {{ check.color }}; font-size: 8pt;">{{ check.id }}</td>
      <td style="color: #374151;">{{ check.category }}</td>
      <td style="color: #1a1a2e; font-weight: {% if check.result != 'PASS' %}600{% else %}400{% endif %};">
        {{ check.description }}
      </td>
      <td>
        <span class="badge"
              style="background: {{ check.color }}; color: #ffffff;">
          {{ check.result }}
        </span>
      </td>
      <td>
        {% if check.detail %}
        <span class="detail-text">{{ check.detail }}</span>
        {% else %}
        <span style="color: #9ca3af; font-size: 8pt;">—</span>
        {% endif %}
      </td>
    </tr>
    {% endfor %}
  </tbody>
</table>

<div class="compliance-footer">
  Basé sur le SAP Security Guide · Généré par SAPscope
</div>

</body>
</html>"""


# ── Couleurs helper ───────────────────────────────────────────────────────────

def _check_color(severity: str) -> str:
    return _SEVERITY_COLOR.get(severity, "#6b7280")


def _check_bg(severity: str) -> str:
    return _SEVERITY_BG.get(severity, "#f9fafb")


# ── Public API ────────────────────────────────────────────────────────────────

def generate_compliance_pdf(
    snapshot_payload: dict[str, Any],
    health_indicators: dict[str, Any],
    system_info: dict[str, Any],
) -> bytes:
    """
    Génère le PDF de conformité sécurité pour un système SAP.

    Args:
        snapshot_payload : payload JSONB du snapshot (snapshot.payload)
        health_indicators: dict indicators du health_check (health_checks.indicators)
        system_info      : dict avec {sid, client_name, report_date (optionnel)}

    Returns:
        bytes du PDF généré par WeasyPrint
    """
    try:
        from weasyprint import HTML as WeasyprintHTML
    except ImportError:
        raise RuntimeError("weasyprint n'est pas installé — vérifiez les dépendances")

    sid         = system_info.get("sid", "UNK").upper()
    client_name = system_info.get("client_name", "")
    report_date = system_info.get("report_date") or datetime.now(timezone.utc).strftime("%d/%m/%Y")

    # Extraire les données depuis le payload
    security_data     = snapshot_payload.get("security", {}) or {}
    connectivity_data = snapshot_payload.get("connectivity", {}) or {}

    # Évaluer les contrôles
    raw_results = _evaluate_checks(security_data, connectivity_data)

    # Trier : FAIL CRITICAL en premier, puis HIGH/MEDIUM/LOW, puis PASS
    def _sort_key(r: dict) -> tuple:
        sev = r["severity"]
        if r["result"] == "PASS":
            return (1, 0)
        return (0, _SEVERITY_ORDER.get(sev, 9))

    raw_results.sort(key=_sort_key)

    # Enrichir avec couleurs pour le template
    checks_ctx = []
    for r in raw_results:
        checks_ctx.append({
            **r,
            "color": _check_color(r["severity"]),
            "bg":    _check_bg(r["severity"]),
        })

    # Compter par catégorie
    counts: dict[str, int] = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0, "PASS": 0, "UNKNOWN": 0}
    for r in raw_results:
        if r["result"] == "PASS":
            counts["PASS"] += 1
        elif r["result"] == "UNKNOWN":
            counts["UNKNOWN"] += 1
        else:
            counts[r["severity"]] = counts.get(r["severity"], 0) + 1

    # Rendu Jinja2
    env = Environment(loader=BaseLoader())
    template = env.from_string(_HTML_TEMPLATE)
    html_str = template.render(
        sid=sid,
        client_name=client_name,
        report_date=report_date,
        checks=checks_ctx,
        counts=counts,
    )

    # Génération PDF
    return WeasyprintHTML(string=html_str).write_pdf()
