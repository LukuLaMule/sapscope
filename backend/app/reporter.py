"""
Rapport journalier automatique — envoyé chaque matin à tous les utilisateurs.

Pour chaque utilisateur : liste de ses clients, avec le dernier snapshot
de chaque système SAP collecté dans les dernières 36h.
Chaque système est présenté avec son score santé RAG + les indicateurs critiques.
"""

import logging
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from .database import SessionLocal
from .models import Client, Snapshot, HealthCheck, User, UserClient
from .settings import settings

logger = logging.getLogger(__name__)

# ── Couleurs RAG ──────────────────────────────────────────────────────────────

_STATUS_COLOR = {
    "OK":       "#2dd4a0",
    "WARNING":  "#f59e0b",
    "CRITICAL": "#ef4444",
    "UNKNOWN":  "#6b7280",
}

_STATUS_BG = {
    "OK":       "rgba(45,212,160,.12)",
    "WARNING":  "rgba(245,158,11,.12)",
    "CRITICAL": "rgba(239,68,68,.12)",
    "UNKNOWN":  "rgba(107,114,128,.12)",
}

_STATUS_LABEL_FR = {
    "OK":       "OK",
    "WARNING":  "Attention",
    "CRITICAL": "Critique",
    "UNKNOWN":  "Inconnu",
}


# ── Requête principale ────────────────────────────────────────────────────────

async def _get_latest_snapshots_per_sid(
    db: AsyncSession, client_id: str, since: datetime
) -> list[tuple[Snapshot, HealthCheck | None]]:
    """Retourne le dernier snapshot par SID pour un client, depuis `since`."""

    # Sous-requête : max(received_at) par SID dans la fenêtre
    subq = (
        select(
            Snapshot.system_sid,
            Snapshot.received_at.label("max_recv"),
        )
        .where(
            Snapshot.client_id == client_id,
            Snapshot.received_at >= since,
        )
        .group_by(Snapshot.system_sid)
        .subquery()
    )

    # Jointure pour récupérer les lignes complètes
    q = (
        select(Snapshot, HealthCheck)
        .outerjoin(HealthCheck, HealthCheck.snapshot_id == Snapshot.id)
        .join(
            subq,
            (Snapshot.system_sid == subq.c.system_sid)
            & (Snapshot.received_at == subq.c.max_recv),
        )
        .where(Snapshot.client_id == client_id)
        .order_by(Snapshot.system_sid)
    )

    rows = await db.execute(q)
    return list(rows.tuples())


# ── Construction du rapport ───────────────────────────────────────────────────

def _format_indicator(indicators: dict) -> list[str]:
    """Extrait les alertes notables des indicateurs de santé."""
    alerts = []

    stab = indicators.get("stability", {})
    if stab.get("dumps_7d", 0) > 0:
        alerts.append(f"{stab['dumps_7d']} dump(s) ABAP")
    if stab.get("jobs_aborted_7d", 0) > 0:
        alerts.append(f"{stab['jobs_aborted_7d']} job(s) en erreur")

    perf = indicators.get("performance", {})
    total_wp = perf.get("wp_priv", 0) + perf.get("wp_stopped", 0)
    if total_wp > 0:
        alerts.append(f"{total_wp} work process(es) bloqué(s)")

    conn = indicators.get("connectivity", {})
    if conn.get("trfc_errors", 0) > 0:
        alerts.append(f"{conn['trfc_errors']} erreur(s) tRFC/qRFC")

    infra = indicators.get("infrastructure", {})
    for ts in infra.get("critical", []):
        alerts.append(f"Tablespace {ts} > 90%")
    for ts in infra.get("warning", []):
        alerts.append(f"Tablespace {ts} > 80%")

    sec = indicators.get("security_ops", {})
    for u in sec.get("default_users_active", []):
        alerts.append(f"Utilisateur par défaut actif : {u}")
    if sec.get("sap_all_count", 0) > 0:
        alerts.append(f"{sec['sap_all_count']} utilisateur(s) SAP_ALL")

    trans = indicators.get("transports", {})
    q = trans.get("import_queue_count", 0)
    if q > 50:
        alerts.append(f"File d'import : {q} transport(s)")

    return alerts


def _system_row_html(snap: Snapshot, hc: HealthCheck | None) -> str:
    status  = hc.status if hc else "UNKNOWN"
    score   = hc.score if hc else "—"
    color   = _STATUS_COLOR[status]
    bg      = _STATUS_BG[status]
    label   = _STATUS_LABEL_FR[status]
    indics  = hc.indicators if hc else {}
    alerts  = _format_indicator(indics)

    alert_html = ""
    if alerts:
        items = "".join(
            f'<li style="margin:2px 0;color:#a1a1a6;font-size:12px">{a}</li>'
            for a in alerts
        )
        alert_html = f'<ul style="margin:6px 0 0 0;padding-left:16px">{items}</ul>'

    sys_info = snap.payload.get("system", {})
    release  = sys_info.get("rfcsaprl", "")
    host     = snap.system_host

    return f"""
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.06);vertical-align:top">
        <div style="font-size:14px;font-weight:700;color:#f5f5f7;letter-spacing:.05em">
          {snap.system_sid}
        </div>
        <div style="font-size:11px;color:#6e6e73;margin-top:2px">{host}{' · ' + release if release else ''}</div>
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.06);vertical-align:top;text-align:center">
        <span style="display:inline-block;padding:4px 12px;border-radius:6px;
                     background:{bg};color:{color};font-size:12px;font-weight:700;
                     border:1px solid {color}33">
          {label}
        </span>
        <div style="font-size:11px;color:#6e6e73;margin-top:4px">Score {score}/100</div>
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.06);vertical-align:top">
        {'<span style="color:#2dd4a0;font-size:12px">Aucune alerte</span>' if not alerts else alert_html}
      </td>
    </tr>"""


def _build_html(user_email: str, client_sections: list[dict], report_date: str) -> str:
    """Construit l'email HTML complet du rapport journalier."""

    sections_html = ""
    for section in client_sections:
        client_name = section["client_name"]
        rows        = section["rows"]
        has_crit    = any(r["status"] == "CRITICAL" for r in section["statuses"])
        badge_color = "#ef4444" if has_crit else "#2dd4a0"
        badge_text  = "ALERTE" if has_crit else "OK"

        rows_html = "".join(rows)

        sections_html += f"""
        <div style="margin-bottom:28px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
            <span style="font-size:13px;font-weight:700;color:#f5f5f7">{client_name}</span>
            <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;
                         background:{badge_color}22;color:{badge_color};border:1px solid {badge_color}44">
              {badge_text}
            </span>
          </div>
          <table width="100%" cellpadding="0" cellspacing="0"
                 style="background:#0d1627;border:1px solid rgba(255,255,255,.08);border-radius:8px;overflow:hidden">
            <thead>
              <tr style="background:rgba(255,255,255,.04)">
                <th style="padding:8px 16px;text-align:left;font-size:11px;color:#6e6e73;font-weight:600;letter-spacing:.08em;text-transform:uppercase">
                  Système
                </th>
                <th style="padding:8px 16px;text-align:center;font-size:11px;color:#6e6e73;font-weight:600;letter-spacing:.08em;text-transform:uppercase;width:130px">
                  Santé
                </th>
                <th style="padding:8px 16px;text-align:left;font-size:11px;color:#6e6e73;font-weight:600;letter-spacing:.08em;text-transform:uppercase">
                  Alertes
                </th>
              </tr>
            </thead>
            <tbody>{rows_html}</tbody>
          </table>
        </div>"""

    app_url = settings.app_url or "https://app.sapscope.com"

    return f"""<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#060e1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px">
      <table width="600" cellpadding="0" cellspacing="0">

        <!-- Header -->
        <tr><td style="padding-bottom:24px">
          <div style="font-size:22px;font-weight:700;color:#f5f5f7">
            SAP<span style="color:#4a9eff">scope</span>
          </div>
          <div style="font-size:11px;color:#4a7ab5;letter-spacing:.1em;text-transform:uppercase;margin-top:2px">
            SAP Landscape Intelligence
          </div>
        </td></tr>

        <!-- Title -->
        <tr><td style="padding-bottom:20px;border-bottom:1px solid rgba(255,255,255,.06)">
          <div style="font-size:18px;font-weight:700;color:#f5f5f7">
            Rapport journalier — {report_date}
          </div>
          <div style="font-size:13px;color:#6e6e73;margin-top:4px">
            Résumé de santé de vos paysages SAP
          </div>
        </td></tr>

        <!-- Content -->
        <tr><td style="padding:24px 0">
          {sections_html}
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding-top:8px;padding-bottom:32px;text-align:center">
          <a href="{app_url}/app"
             style="display:inline-block;background:#4a9eff;color:#fff;font-size:13px;
                    font-weight:600;padding:10px 24px;border-radius:8px;text-decoration:none">
            Ouvrir SAPscope →
          </a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="border-top:1px solid rgba(255,255,255,.06);padding-top:20px">
          <p style="font-size:11px;color:#3d3d42;margin:0;line-height:1.6;text-align:center">
            Vous recevez ce rapport car votre compte SAPscope est actif.<br>
            Pour modifier la fréquence ou vous désabonner, contactez votre administrateur.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""


# ── Envoi ─────────────────────────────────────────────────────────────────────

async def _send_report_email(to_email: str, html: str, report_date: str) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"SAPscope · Rapport journalier {report_date}"
    msg["From"]    = settings.smtp_from
    msg["To"]      = to_email

    text = f"Rapport journalier SAPscope — {report_date}\nOuvrez cet email dans un client compatible HTML pour voir le rapport complet.\n{settings.app_url}/app"
    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user,
            password=settings.smtp_password,
            start_tls=True,
        )
        logger.info("Rapport journalier envoyé à %s", to_email)
    except Exception:
        logger.exception("Échec d'envoi du rapport à %s", to_email)


# ── Point d'entrée appelé par le scheduler ────────────────────────────────────

async def send_daily_reports() -> None:
    """Génère et envoie le rapport journalier à tous les utilisateurs actifs."""
    if not settings.smtp_host or not settings.smtp_user:
        logger.info("SMTP non configuré — rapport journalier ignoré")
        return

    since        = datetime.now(timezone.utc) - timedelta(hours=36)
    report_date  = datetime.now(timezone.utc).strftime("%d/%m/%Y")

    logger.info("Génération du rapport journalier (%s)…", report_date)

    async with SessionLocal() as db:
        # Récupère tous les utilisateurs
        users_res = await db.execute(select(User))
        users     = list(users_res.scalars())

        for user in users:
            # Clients visibles par cet utilisateur
            if user.is_admin:
                clients_res = await db.execute(select(Client).order_by(Client.name))
                clients = list(clients_res.scalars())
            else:
                clients_res = await db.execute(
                    select(Client)
                    .join(UserClient, UserClient.client_id == Client.id)
                    .where(UserClient.user_id == user.id)
                    .order_by(Client.name)
                )
                clients = list(clients_res.scalars())

            if not clients:
                continue

            client_sections = []
            has_any_system  = False

            for client in clients:
                pairs = await _get_latest_snapshots_per_sid(db, client.id, since)
                if not pairs:
                    continue

                has_any_system = True
                rows     = []
                statuses = []

                for snap, hc in pairs:
                    rows.append(_system_row_html(snap, hc))
                    statuses.append({"status": hc.status if hc else "UNKNOWN"})

                client_sections.append({
                    "client_name": client.name,
                    "rows":        rows,
                    "statuses":    statuses,
                })

            if not has_any_system:
                # Pas de données récentes → pas de rapport
                continue

            html = _build_html(user.email, client_sections, report_date)
            await _send_report_email(user.email, html, report_date)

    logger.info("Rapport journalier terminé")
