"""
Password reset OTPs.

A short-lived (10 min), single-use, 6-digit code emailed to the user when
they request a password reset. Only the SHA-256 hash of the OTP is stored —
never the plaintext code — same reasoning as never storing a plaintext
password. A fast hash (not bcrypt) is fine here specifically because the
OTP itself is short-lived and rate-limited (max 5 attempts before it's
locked), unlike a real password which has no expiry and needs a slow hash
to resist offline brute-forcing.
"""
from sqlalchemy import Column, Integer, String, DateTime, Boolean
from sqlalchemy.sql import func
from app.models import Base


class PasswordResetOTP(Base):
    __tablename__ = "password_reset_otps"

    id = Column(Integer, primary_key=True)
    email = Column(String(150), nullable=False, index=True)
    otp_hash = Column(String(64), nullable=False)   # sha256 hex digest
    expires_at = Column(DateTime, nullable=False)
    attempts = Column(Integer, default=0, nullable=False)
    is_used = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    def __repr__(self):
        return f"<PasswordResetOTP {self.email} used={self.is_used}>"
