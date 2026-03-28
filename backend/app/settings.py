from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    debug: bool = False
    token_min_length: int = 32
    allowed_origins: list[str] = ["https://app.sapscope.io"]
    env: str = "production"   # "development" active le SQL echo


settings = Settings()
