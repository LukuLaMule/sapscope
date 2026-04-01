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


settings = Settings()
