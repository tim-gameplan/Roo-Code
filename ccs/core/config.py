from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    APP_NAME: str = "Central Communication Server"
    DEBUG: bool = True # Set to True for development to enable init_db()
    SECRET_KEY: str = "your-secret-key"  # CHANGE THIS!
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Corrected DATABASE_URL with a placeholder numeric port
    DATABASE_URL: str = "postgresql://user:password@host:5432/dbname"

    # Optional Redis settings for caching/presence
    REDIS_HOST: Optional[str] = None
    REDIS_PORT: int = 6379

    class Config:
        env_file = ".env" # If you want to use a .env file
        env_file_encoding = 'utf-8'

settings = Settings()

# Example usage:
# from ccs.core.config import settings
# print(settings.DATABASE_URL)
