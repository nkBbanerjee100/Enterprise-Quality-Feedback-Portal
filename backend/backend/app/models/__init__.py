"""SQLAlchemy ORM Models"""
from sqlalchemy.orm import declarative_base

Base = declarative_base()

from app.models.customer_otp import CustomerOTP  # noqa: E402,F401
