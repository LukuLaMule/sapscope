"""
Génère un PDF professionnel "SAP Basis Health Report" pour les clients ESN.
Utilise WeasyPrint (HTML → PDF) avec des templates Jinja2 inline.
"""

import logging
from datetime import datetime, timezone

from jinja2 import Environment, BaseLoader

logger = logging.getLogger(__name__)

# ── Couleurs RAG ──────────────────────────────────────────────────────────────

_RAG_COLOR = {
    "OK":       "#16a34a",
    "WARNING":  "#d97706",
    "CRITICAL": "#dc2626",
    "UNKNOWN":  "#6b7280",
}

_RAG_BG = {
    "OK":       "#dcfce7",
    "WARNING":  "#fef3c7",
    "CRITICAL": "#fee2e2",
    "UNKNOWN":  "#f3f4f6",
}

_STATUS_LABEL = {
    "fr": {"OK": "OK", "WARNING": "Attention", "CRITICAL": "Critique", "UNKNOWN": "Inconnu"},
    "en": {"OK": "OK", "WARNING": "Warning",   "CRITICAL": "Critical", "UNKNOWN": "Unknown"},
}

_DOMAIN_LABEL = {
    "fr": {
        "stability":     "Stabilité",
        "performance":   "Performance",
        "connectivity":  "Connectivité",
        "infrastructure":"Infrastructure",
        "security":      "Sécurité",
        "security_ops":  "Sécurité Ops",
        "transports":    "Transports",
    },
    "en": {
        "stability":     "Stability",
        "performance":   "Performance",
        "connectivity":  "Connectivity",
        "infrastructure":"Infrastructure",
        "security":      "Security",
        "security_ops":  "Security Ops",
        "transports":    "Transports",
    },
}

_METRIC_LABEL = {
    "fr": {
        "dumps_7d":            "Dumps ABAP (7j)",
        "jobs_aborted_7d":     "Jobs en erreur (7j)",
        "wp_priv":             "Work processes privés",
        "wp_stopped":          "Work processes arrêtés",
        "trfc_errors":         "Erreurs tRFC/qRFC",
        "max_used_pct":        "Tablespace max utilisé (%)",
        "users_locked":        "Utilisateurs verrouillés",
        "sap_all_count":       "Utilisateurs SAP_ALL",
        "import_queue_count":  "File d'import transports",
    },
    "en": {
        "dumps_7d":            "ABAP Dumps (7d)",
        "jobs_aborted_7d":     "Aborted jobs (7d)",
        "wp_priv":             "Private work processes",
        "wp_stopped":          "Stopped work processes",
        "trfc_errors":         "tRFC/qRFC errors",
        "max_used_pct":        "Max tablespace used (%)",
        "users_locked":        "Locked users",
        "sap_all_count":       "SAP_ALL users",
        "import_queue_count":  "Transport import queue",
    },
}

DOMAIN_ORDER = [
    "stability", "performance", "connectivity",
    "infrastructure", "security", "security_ops", "transports",
]

# ── Helpers ───────────────────────────────────────────────────────────────────

def _score_color(score: int | None) -> str:
    if score is None:
        return _RAG_COLOR["UNKNOWN"]
    if score >= 80:
        return _RAG_COLOR["OK"]
    if score >= 50:
        return _RAG_COLOR["WARNING"]
    return _RAG_COLOR["CRITICAL"]


def _status_color(status: str) -> str:
    return _RAG_COLOR.get(status, _RAG_COLOR["UNKNOWN"])


def _status_bg(status: str) -> str:
    return _RAG_BG.get(status, _RAG_BG["UNKNOWN"])


def _avg(scores: list[int]) -> int:
    return round(sum(scores) / len(scores)) if scores else 0


def _extract_key_metrics(indicators: dict, language: str = "fr") -> list[dict]:
    """
    Extrait les métriques clés depuis le dict indicators JSONB.
    Structure connue :
      stability:     {dumps_7d, jobs_aborted_7d}
      performance:   {wp_priv, wp_stopped}
      connectivity:  {trfc_errors}
      infrastructure:{max_used_pct, warning:[], critical:[]}
      security:      {users_locked, sap_all_count?}
      security_ops:  {default_users_active:[], sap_all_count?}
      transports:    {import_queue_count?}
    """
    labels = _METRIC_LABEL.get(language, _METRIC_LABEL["fr"])
    metrics = []

    def _add(key: str, value, alert: bool = False):
        if value is not None:
            metrics.append({"label": labels.get(key, key), "value": value, "alert": alert})

    stab = indicators.get("stability", {})
    dumps = stab.get("dumps_7d")
    if dumps is not None:
        _add("dumps_7d", dumps, dumps > 0)
    jobs_err = stab.get("jobs_aborted_7d")
    if jobs_err is not None:
        _add("jobs_aborted_7d", jobs_err, jobs_err > 0)

    perf = indicators.get("performance", {})
    wp_priv = perf.get("wp_priv")
    if wp_priv is not None:
        _add("wp_priv", wp_priv, wp_priv > 0)
    wp_stop = perf.get("wp_stopped")
    if wp_stop is not None:
        _add("wp_stopped", wp_stop, wp_stop > 0)

    conn = indicators.get("connectivity", {})
    trfc = conn.get("trfc_errors")
    if trfc is not None:
        _add("trfc_errors", trfc, trfc > 0)

    infra = indicators.get("infrastructure", {})
    pct = infra.get("max_used_pct")
    if pct is not None:
        _add("max_used_pct", f"{pct:.1f}%", pct > 80)

    sec = indicators.get("security", {})
    locked = sec.get("users_locked")
    if locked is not None:
        _add("users_locked", locked, locked > 0)

    sec_ops = indicators.get("security_ops", {})
    sap_all = sec_ops.get("sap_all_count") or sec.get("sap_all_count")
    if sap_all is not None:
        _add("sap_all_count", sap_all, sap_all > 0)

    trans = indicators.get("transports", {})
    q = trans.get("import_queue_count")
    if q is not None:
        _add("import_queue_count", q, q > 50)

    return metrics


def _build_domain_rows(indicators: dict, language: str = "fr") -> list[dict]:
    """Retourne les lignes pour le tableau Health by Domain."""
    dlabels = _DOMAIN_LABEL.get(language, _DOMAIN_LABEL["fr"])
    slabels = _STATUS_LABEL.get(language, _STATUS_LABEL["fr"])
    rows = []
    for domain in DOMAIN_ORDER:
        data = indicators.get(domain)
        if data is None:
            continue
        score  = data.get("score", 0)
        status = data.get("status", "UNKNOWN")
        rows.append({
            "domain":       dlabels.get(domain, domain.capitalize()),
            "score":        score,
            "status":       status,
            "status_label": slabels.get(status, status),
            "color":        _status_color(status),
            "bg":           _status_bg(status),
        })
    return rows


def _truncate_words(text: str, max_words: int = 300) -> str:
    words = text.split()
    if len(words) <= max_words:
        return text
    return " ".join(words[:max_words]) + "…"


# ── Template HTML ─────────────────────────────────────────────────────────────

_HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="{{ language }}">
<head>
<meta charset="UTF-8">
<style>
  @page {
    size: A4;
    margin: 15mm;
    @bottom-left   { content: "{{ client_name }}"; font-size: 8pt; color: #6b7280; font-family: sans-serif; }
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
    background: #0f1117;
    color: #f5f5f7;
    min-height: 257mm;  /* A4 minus margins */
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    page-break-after: always;
    padding: 20mm 15mm;
    position: relative;
  }

  .cover-logo {
    position: absolute;
    top: 20mm;
    right: 20mm;
  }
  .cover-logo img {
    max-height: 28mm;
    max-width: 60mm;
    object-fit: contain;
  }
  .cover-brand {
    font-size: 22pt;
    font-weight: 700;
    color: #f5f5f7;
    letter-spacing: 0.05em;
  }
  .cover-brand span { color: #3b82f6; }

  .cover-client {
    font-size: 28pt;
    font-weight: 800;
    color: #ffffff;
    margin: 16mm 0 8mm;
    letter-spacing: 0.02em;
  }

  .cover-score {
    font-size: 72pt;
    font-weight: 900;
    line-height: 1;
    margin-bottom: 4mm;
  }

  .cover-score-label {
    font-size: 12pt;
    color: #9ca3af;
    margin-bottom: 12mm;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .cover-date {
    font-size: 11pt;
    color: #6b7280;
    margin-bottom: 4mm;
  }

  .cover-confidential {
    font-size: 9pt;
    color: #4b5563;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    border-top: 1px solid #374151;
    padding-top: 4mm;
    margin-top: 8mm;
    width: 100%;
    text-align: center;
  }

  /* ── System sections ── */
  .system-section {
    margin-bottom: 14mm;
    page-break-inside: avoid;
  }

  .system-header {
    display: flex;
    align-items: center;
    gap: 8mm;
    margin-bottom: 5mm;
    padding-bottom: 3mm;
    border-bottom: 2px solid #e5e7eb;
  }

  .system-sid {
    font-size: 20pt;
    font-weight: 800;
    color: #1a1a2e;
    letter-spacing: 0.05em;
  }

  .status-badge {
    padding: 1.5mm 4mm;
    border-radius: 4mm;
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .system-score {
    margin-left: auto;
    font-size: 16pt;
    font-weight: 800;
  }

  .trend {
    font-size: 9pt;
    font-weight: 600;
    margin-left: 2mm;
  }

  /* ── Tables ── */
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 5mm;
    font-size: 9pt;
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
    border-bottom: 1px solid #d1d5db;
  }

  tbody tr:nth-child(even) { background: #f9fafb; }
  tbody tr:nth-child(odd)  { background: #ffffff; }

  tbody td {
    padding: 2mm 3mm;
    border-bottom: 1px solid #f3f4f6;
    vertical-align: middle;
  }

  /* ── Progress bar ── */
  .progress-wrap {
    background: #e5e7eb;
    border-radius: 2mm;
    height: 3mm;
    width: 40mm;
    overflow: hidden;
    display: inline-block;
    vertical-align: middle;
  }
  .progress-bar {
    height: 100%;
    border-radius: 2mm;
  }

  .score-num {
    font-weight: 700;
    font-size: 9pt;
    display: inline-block;
    width: 10mm;
    text-align: right;
    margin-right: 2mm;
    vertical-align: middle;
  }

  /* ── Alert values ── */
  .alert-val { color: #dc2626; font-weight: 700; }
  .ok-val    { color: #16a34a; font-weight: 600; }

  /* ── Section titles ── */
  .section-title {
    font-size: 9pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #6b7280;
    margin: 4mm 0 2mm;
  }

  /* ── AI assessment ── */
  .ai-box {
    background: #f8fafc;
    border-left: 3px solid #3b82f6;
    padding: 3mm 4mm;
    margin-top: 4mm;
    font-size: 9pt;
    color: #374151;
    line-height: 1.6;
  }

  .ai-box .ai-title {
    font-weight: 700;
    color: #1e40af;
    font-size: 9pt;
    margin-bottom: 2mm;
  }
</style>
</head>
<body>

<!-- ═══════════════════════════════════════════════
     COVER PAGE
════════════════════════════════════════════════ -->
<div class="cover">

  <!-- Logo ESN -->
  <div class="cover-logo">
    {% if logo_b64 %}
    <img src="data:image/png;base64,{{ logo_b64 }}" alt="{{ client_name }}">
    {% else %}
    <div class="cover-brand">SAP<span>scope</span></div>
    {% endif %}
  </div>

  <!-- Brand watermark (only when logo present) -->
  {% if logo_b64 %}
  <div class="cover-brand" style="margin-bottom: 0;">SAP<span>scope</span></div>
  {% endif %}

  <!-- Client name / custom title -->
  <div class="cover-client">{{ report_title or client_name }}</div>

  <!-- Global health score -->
  <div class="cover-score" style="color: {{ global_score_color }};">{{ global_score }}</div>
  <div class="cover-score-label">
    {% if language == "fr" %}Score de santé global / 100{% else %}Global health score / 100{% endif %}
  </div>

  <!-- Systems count -->
  <div class="cover-date" style="margin-bottom: 3mm;">
    {% if language == "fr" %}
    {{ systems_count }} système{% if systems_count > 1 %}s{% endif %} SAP analysé{% if systems_count > 1 %}s{% endif %}
    {% else %}
    {{ systems_count }} SAP system{% if systems_count > 1 %}s{% endif %} analysed
    {% endif %}
  </div>

  <!-- Report date -->
  <div class="cover-date">{{ report_date }}</div>

  <div class="cover-confidential">
    SAP Basis Health Report — {% if language == "fr" %}Confidentiel{% else %}Confidential{% endif %}
  </div>
</div>


<!-- ═══════════════════════════════════════════════
     SYSTEM SECTIONS
════════════════════════════════════════════════ -->
{% for sys in systems %}
<div class="system-section">

  <!-- System header -->
  <div class="system-header">
    <div class="system-sid">{{ sys.sid }}</div>

    <span class="status-badge"
          style="background: {{ sys.status_bg }}; color: {{ sys.status_color }}; border: 1px solid {{ sys.status_color }};">
      {{ sys.status_label }}
    </span>

    <div class="system-score" style="color: {{ sys.score_color }};">
      {{ sys.score }}<span style="font-size:10pt;color:#6b7280;">/100</span>
      {% if sys.trend %}
      <span class="trend" style="color: {{ sys.trend_color }};">{{ sys.trend }}</span>
      {% endif %}
    </div>
  </div>

  <!-- Health by domain -->
  {% if sys.show_health_domains and sys.domain_rows %}
  <div class="section-title">
    {% if language == "fr" %}Santé par domaine{% else %}Health by domain{% endif %}
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:35%">{% if language == "fr" %}Domaine{% else %}Domain{% endif %}</th>
        <th style="width:45%">Score</th>
        <th style="width:20%">{% if language == "fr" %}Statut{% else %}Status{% endif %}</th>
      </tr>
    </thead>
    <tbody>
      {% for row in sys.domain_rows %}
      <tr>
        <td style="font-weight: 600;">{{ row.domain }}</td>
        <td>
          <span class="score-num" style="color: {{ row.color }};">{{ row.score }}</span>
          <span class="progress-wrap">
            <span class="progress-bar"
                  style="width: {{ row.score }}%; background: {{ row.color }};"></span>
          </span>
        </td>
        <td>
          <span class="status-badge"
                style="background: {{ row.bg }}; color: {{ row.color }}; padding: 0.8mm 2.5mm; font-size: 8pt;">
            {{ row.status_label }}
          </span>
        </td>
      </tr>
      {% endfor %}
    </tbody>
  </table>
  {% endif %}

  <!-- Key metrics -->
  {% if sys.show_key_metrics and sys.metrics %}
  <div class="section-title">
    {% if language == "fr" %}Indicateurs clés{% else %}Key metrics{% endif %}
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:60%">{% if language == "fr" %}Indicateur{% else %}Metric{% endif %}</th>
        <th style="width:40%">{% if language == "fr" %}Valeur{% else %}Value{% endif %}</th>
      </tr>
    </thead>
    <tbody>
      {% for m in sys.metrics %}
      <tr>
        <td>{{ m.label }}</td>
        <td>
          {% if m.alert %}
          <span class="alert-val">{{ m.value }}</span>
          {% else %}
          <span class="ok-val">{{ m.value }}</span>
          {% endif %}
        </td>
      </tr>
      {% endfor %}
    </tbody>
  </table>
  {% endif %}

  <!-- AI Assessment -->
  {% if sys.show_ai_analysis and sys.analysis %}
  <div class="ai-box">
    <div class="ai-title">
      {% if language == "fr" %}Analyse IA{% else %}AI Assessment{% endif %}
    </div>
    {{ sys.analysis }}
  </div>
  {% endif %}

</div>

{% if not loop.last %}
<div style="page-break-after: always;"></div>
{% endif %}
{% endfor %}

</body>
</html>"""


# ── Public API ────────────────────────────────────────────────────────────────

async def generate_client_pdf(
    client,          # Client ORM object (name, logo_b64)
    snapshots_data: list[dict],
    # Each item: {sid, score, status, indicators, analysis, snapshot_date, prev_score}
    language: str = "fr",
    report_date: str | None = None,
    report_title: str | None = None,
    sections: dict | None = None,
) -> bytes:
    """
    Génère un PDF professionnel pour un client ESN.
    Retourne les bytes du PDF.
    """
    try:
        from weasyprint import HTML as WeasyprintHTML
    except ImportError:
        raise RuntimeError("weasyprint n'est pas installé — vérifiez les dépendances")

    if report_date is None:
        report_date = datetime.now(timezone.utc).strftime("%d/%m/%Y")

    sec = sections or {}
    show_health_domains = sec.get("health_domains", True)
    show_key_metrics    = sec.get("key_metrics",    True)
    show_ai_analysis    = sec.get("ai_analysis",    True)

    slabels = _STATUS_LABEL.get(language, _STATUS_LABEL["fr"])

    # Calcul du score global
    scores = [s["score"] for s in snapshots_data if s.get("score") is not None]
    global_score = _avg(scores)
    global_score_color = _score_color(global_score)

    # Préparation des données systèmes
    systems_ctx = []
    for s in snapshots_data:
        sid        = s.get("sid", "UNK")
        score      = s.get("score") or 0
        status     = s.get("status", "UNKNOWN")
        indicators = s.get("indicators") or {}
        analysis   = s.get("analysis")
        prev_score = s.get("prev_score")

        # Trend
        trend = None
        trend_color = "#6b7280"
        if prev_score is not None:
            diff = score - prev_score
            if diff > 0:
                trend = f"↑ +{diff} pts"
                trend_color = _RAG_COLOR["OK"]
            elif diff < 0:
                trend = f"↓ {diff} pts"
                trend_color = _RAG_COLOR["CRITICAL"]

        # Truncate analysis
        if analysis:
            analysis = _truncate_words(analysis, 300)

        systems_ctx.append({
            "sid":          sid,
            "score":        score,
            "score_color":  _score_color(score),
            "status":       status,
            "status_label": slabels.get(status, status),
            "status_color": _status_color(status),
            "status_bg":    _status_bg(status),
            "domain_rows":  _build_domain_rows(indicators, language) if show_health_domains else [],
            "metrics":      _extract_key_metrics(indicators, language) if show_key_metrics else [],
            "analysis":     analysis if show_ai_analysis else None,
            "trend":        trend,
            "trend_color":  trend_color,
            "show_health_domains": show_health_domains,
            "show_key_metrics":    show_key_metrics,
            "show_ai_analysis":    show_ai_analysis,
        })

    # Extraire logo_b64 (sans le préfixe data:... s'il est présent)
    logo_b64 = client.logo_b64 or ""
    if logo_b64.startswith("data:"):
        # Extraire la partie base64 pure
        try:
            logo_b64 = logo_b64.split(",", 1)[1]
        except IndexError:
            logo_b64 = ""

    # Rendu Jinja2
    env = Environment(loader=BaseLoader())
    template = env.from_string(_HTML_TEMPLATE)
    html_str = template.render(
        client_name=client.name,
        report_title=report_title or "",
        logo_b64=logo_b64,
        global_score=global_score,
        global_score_color=global_score_color,
        systems_count=len(systems_ctx),
        systems=systems_ctx,
        report_date=report_date,
        language=language,
    )

    # Génération PDF
    pdf_bytes = WeasyprintHTML(string=html_str).write_pdf()
    return pdf_bytes
