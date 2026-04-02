"""
Envoi d'emails transactionnels via SMTP (OVH Zimbra ou tout autre serveur).
On utilise aiosmtplib pour ne pas bloquer la boucle asyncio.
"""

import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib

from .settings import settings

logger = logging.getLogger(__name__)


async def send_reset_email(to_email: str, reset_url: str) -> None:
    """Envoie le lien de réinitialisation de mot de passe."""
    if not settings.smtp_host or not settings.smtp_user:
        # En dev sans SMTP configuré, on log juste le lien pour pouvoir tester
        logger.warning("SMTP non configuré — lien de reset : %s", reset_url)
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Réinitialisation de votre mot de passe SAPscope"
    msg["From"]    = settings.smtp_from
    msg["To"]      = to_email

    # Version texte brut (fallback)
    text = f"""Bonjour,

Vous avez demandé la réinitialisation de votre mot de passe SAPscope.

Cliquez sur ce lien pour choisir un nouveau mot de passe (valable 1 heure) :
{reset_url}

Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.

— L'équipe SAPscope
"""

    # Version HTML
    html = f"""<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px">
      <table width="480" cellpadding="0" cellspacing="0"
             style="background:#141414;border-radius:12px;border:1px solid rgba(255,255,255,.08)">
        <tr><td style="padding:32px 40px">

          <div style="font-size:20px;font-weight:700;color:#f5f5f7;margin-bottom:4px">
            SAP<span style="color:#2997ff">scope</span>
          </div>
          <div style="font-size:12px;color:#6e6e73;margin-bottom:32px">SAP Landscape Intelligence</div>

          <p style="font-size:15px;color:#a1a1a6;line-height:1.6;margin:0 0 24px">
            Vous avez demandé la réinitialisation de votre mot de passe.<br>
            Ce lien est valable <strong style="color:#f5f5f7">1 heure</strong>.
          </p>

          <a href="{reset_url}"
             style="display:inline-block;background:#2997ff;color:#fff;font-size:14px;
                    font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none">
            Réinitialiser mon mot de passe →
          </a>

          <p style="font-size:12px;color:#6e6e73;margin:28px 0 0;line-height:1.6">
            Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.<br>
            Votre mot de passe ne sera pas modifié.
          </p>

        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""

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
        logger.info("Email de reset envoyé à %s", to_email)
    except Exception:
        # On log l'erreur mais on ne la propage pas — l'utilisateur verra toujours "email envoyé"
        # pour éviter d'exposer des infos sur l'infrastructure mail
        logger.exception("Échec d'envoi du mail de reset à %s", to_email)
