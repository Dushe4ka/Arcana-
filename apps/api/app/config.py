from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Fails fast at startup if required environment variables are missing or malformed,
    instead of surfacing confusing errors deep inside a request handler later."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str

    jwt_access_secret: str
    jwt_refresh_secret: str
    jwt_access_ttl_minutes: int = 15
    jwt_refresh_ttl_days: int = 30

    port: int = 4000
    environment: str = "development"
    uploads_dir: str = "./uploads"
    # Used to build absolute URLs for uploaded files (e.g. "{public_base_url}/uploads/x.png")
    # returned to the admin panel/mobile app - override in .env once deployed somewhere real.
    public_base_url: str = "http://localhost:4000"
    # YooKassa merchant credentials - empty by default so existing .env files keep working;
    # a real purchase attempt fails cleanly with a YooKassa 401 until these are set to real
    # (or sandbox) values. See https://yookassa.ru/developers/api
    yookassa_shop_id: str = ""
    yookassa_secret_key: str = ""
    # Base URL of the player cabinet site (apps/cabinet, a separate plan) - used to build the
    # `return_url` YooKassa redirects back to after a payment completes.
    cabinet_base_url: str = "http://localhost:3100"


settings = Settings()
