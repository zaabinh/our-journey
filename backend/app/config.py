from functools import lru_cache
from urllib.parse import urlsplit

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="OJ_", env_file=".env", extra="ignore")
    database_url: str = "postgresql+psycopg://journey:journey@localhost:5432/journey"
    environment: str = "development"
    allowed_origins: list[str] = ["http://localhost:5173", "http://localhost:8000"]
    storage_driver: str = "local"
    local_storage_path: str = "../.private-data/uploads"
    r2_endpoint: str = ""
    r2_bucket: str = ""
    r2_access_key: str = ""
    r2_secret_key: str = ""
    session_hours: int = 168
    max_upload_bytes: int = 15 * 1024 * 1024
    max_image_pixels: int = 40_000_000
    public_web_url: str = "http://localhost:5173"
    smtp_host: str = ""
    smtp_username: str = ""
    smtp_from: str = ""
    resend_api_key: str = ""
    # Public HTTPS URL of the email header PNG; defaults to the frontend copy under /brand.
    email_header_url: str = ""

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        # Render supplies a standard Postgres URL, but this project installs psycopg 3.
        # Replace only the leading scheme; preserve credentials and query parameters.
        for prefix in ("postgresql://", "postgres://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value[len(prefix) :]
        return value

    def header_image_url(self) -> str:
        return self.email_header_url or f"{self.public_web_url.rstrip('/')}/brand/email-header.png"

    def validate_runtime(self):
        if self.storage_driver not in {"local", "r2"}:
            raise ValueError("Unsupported storage driver")
        if self.environment == "production":
            if self.storage_driver != "r2":
                raise ValueError("Production requires private object storage")
            if any(not x.startswith("https://") for x in self.allowed_origins):
                raise ValueError("Production origins require HTTPS")
            web_url = urlsplit(self.public_web_url)
            if (
                web_url.scheme != "https"
                or not web_url.hostname
                or web_url.hostname.lower() in {"localhost", "127.0.0.1", "::1"}
            ):
                raise ValueError(
                    "Production requires OJ_PUBLIC_WEB_URL to be the HTTPS frontend URL"
                )
            if not self.header_image_url().startswith("https://"):
                raise ValueError("Production requires OJ_EMAIL_HEADER_URL to be a public HTTPS URL")
        if self.storage_driver == "r2" and not all(
            [self.r2_endpoint, self.r2_bucket, self.r2_access_key, self.r2_secret_key]
        ):
            raise ValueError("Missing R2 configuration")


@lru_cache
def settings():
    return Settings()
