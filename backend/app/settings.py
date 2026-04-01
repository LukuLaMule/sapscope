from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    debug: bool = False
    token_min_length: int = 32
    allowed_origins: list[str] = ["https://app.sapscope.io"]
    env: str = "production"   # "development" active le SQL echo

    # SaaS : True (anyone can self-register)
    # Self-hosted : False (admin creates accounts manually)
    registration_enabled: bool = True

    # Self-hosted license key (JWT signed by Sapscope)
    # Absent → SaaS mode (no license check)
    license_key: str | None = None

    # Stripe (SaaS billing)
    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    stripe_price_solo: str | None = None   # price_xxx
    stripe_price_team: str | None = None   # price_xxx


settings = Settings()
