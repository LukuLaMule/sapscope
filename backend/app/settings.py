from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    debug: bool = False
    token_min_length: int = 32
    allowed_origins: list[str] = ["https://app.sapscope.com", "https://sapscope.com"]
    env: str = "production"   # "development" active le SQL echo

    # SaaS : True (anyone can self-register)
    # Self-hosted : False (admin creates accounts manually)
    registration_enabled: bool = True

    # Stripe (SaaS billing)
    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    stripe_price_solo: str | None = None        # price_xxx
    stripe_price_team: str | None = None        # price_xxx
    stripe_price_enterprise: str | None = None  # price_xxx

    # SMTP (reset de mot de passe)
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str = "noreply@sapscope.com"
    app_url: str = "https://app.sapscope.com"

    # Compte admin créé automatiquement au premier démarrage (self-hosted)
    admin_email: str | None = None
    admin_password: str | None = None

    # Rapport journalier automatique
    report_enabled: bool = True
    report_hour: int = 7       # heure d'envoi (UTC)
    report_tz: str = "UTC"     # ex: "Europe/Paris"


settings = Settings()
