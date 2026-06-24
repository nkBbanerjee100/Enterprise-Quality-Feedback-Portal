"""Configuration and environment variables"""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # Database
    LOCAL_DATABASE_URL: str = "mysql+pymysql://csat_user:B%40B%40n2001@localhost:3306/csat_tool_db"
    TMS_DATABASE_URL: str =  "mysql+pymysql://root:Mind@123@172.16.5.115:3306/tmstestdb1"
    
    # JWT
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int
    refresh_token_expire_days: int = 7
    
    # Application
    app_name: str = "CSAT Tool"
    app_version: str = "1.0.0"
    debug: bool = False
    
    # Email (placeholder)
    smtp_server: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    
    
    class Config:
        env_file = ".env"
        case_sensitive = False
        extra = "ignore"

settings = Settings()
