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


async def send_welcome_email(to_email: str, tier: str, client_name: str, agent_token: str) -> None:
    """Envoie l'email de bienvenue après activation du compte (paiement Stripe validé)."""
    if not settings.smtp_host or not settings.smtp_user:
        logger.warning(
            "SMTP non configuré — token agent pour %s : %s", to_email, agent_token
        )
        return

    docs_url   = "https://app.sapscope.com/docs"
    app_url    = settings.app_url or "https://app.sapscope.com"
    tier_label = {"solo": "Solo", "team": "Team", "enterprise": "Enterprise"}.get(tier, tier.capitalize())

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Bienvenue sur SAPscope — votre token agent"
    msg["From"]    = settings.smtp_from
    msg["To"]      = to_email

    text = f"""Bonjour,

Votre compte SAPscope est activé (offre {tier_label}).

Votre token agent (à copier maintenant, il ne sera plus affiché) :
{agent_token}

Pour installer l'agent sur votre serveur SAP :
curl -sSL https://app.sapscope.com/install.sh | sudo bash -s -- --token {agent_token}

Documentation complète : {docs_url}
Accéder à l'application : {app_url}/app

— L'équipe SAPscope
"""

    html = f"""<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px">
      <table width="520" cellpadding="0" cellspacing="0"
             style="background:#141414;border-radius:12px;border:1px solid rgba(255,255,255,.08)">
        <tr><td style="padding:32px 40px">

          <div style="font-size:20px;font-weight:700;color:#f5f5f7;margin-bottom:4px">
            SAP<span style="color:#2997ff">scope</span>
          </div>
          <div style="font-size:12px;color:#6e6e73;margin-bottom:28px">SAP Landscape Intelligence</div>

          <p style="font-size:16px;font-weight:600;color:#f5f5f7;margin:0 0 8px">
            Bienvenue ! Votre compte est activé.
          </p>
          <p style="font-size:14px;color:#a1a1a6;margin:0 0 24px">
            Offre <strong style="color:#2997ff">{tier_label}</strong> — {client_name}
          </p>

          <p style="font-size:13px;color:#a1a1a6;margin:0 0 8px">
            Votre token agent (conservez-le, il ne sera plus affiché) :
          </p>
          <div style="background:#0a0a0a;border:1px solid rgba(255,255,255,.12);border-radius:8px;
                      padding:12px 16px;font-family:monospace;font-size:13px;color:#34d399;
                      word-break:break-all;margin-bottom:24px">
            {agent_token}
          </div>

          <p style="font-size:13px;color:#a1a1a6;margin:0 0 16px">
            Installez l'agent sur votre serveur SAP :
          </p>
          <div style="background:#0a0a0a;border:1px solid rgba(255,255,255,.12);border-radius:8px;
                      padding:12px 16px;font-family:monospace;font-size:12px;color:#a1a1a6;
                      word-break:break-all;margin-bottom:28px">
            curl -sSL https://app.sapscope.com/install.sh | sudo bash -s -- --token {agent_token}
          </div>

          <div style="display:flex;gap:12px;margin-bottom:28px">
            <a href="{app_url}/app"
               style="display:inline-block;background:#2997ff;color:#fff;font-size:13px;
                      font-weight:600;padding:10px 22px;border-radius:8px;text-decoration:none">
              Accéder à l'app →
            </a>
            <a href="{docs_url}"
               style="display:inline-block;background:rgba(255,255,255,.08);color:#f5f5f7;font-size:13px;
                      font-weight:600;padding:10px 22px;border-radius:8px;text-decoration:none">
              Documentation
            </a>
          </div>

          <p style="font-size:12px;color:#6e6e73;margin:0;line-height:1.6">
            Des questions ? Répondez à cet email ou écrivez à
            <a href="mailto:contact@sapscope.com" style="color:#2997ff">contact@sapscope.com</a>
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
        logger.info("Email de bienvenue envoyé à %s (tier=%s)", to_email, tier)
    except Exception:
        logger.exception("Échec d'envoi de l'email de bienvenue à %s", to_email)


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
