"""Helpers for generating and validating OTP codes."""
import hashlib
import secrets
from hmac import compare_digest


def generate_otp() -> str:
    """Generate a random 6-digit OTP."""
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_otp(otp: str) -> str:
    """Hash an OTP before storing it."""
    return hashlib.sha256(otp.encode("utf-8")).hexdigest()


def verify_otp_hash(otp: str, otp_hash: str) -> bool:
    """Compare an OTP against a stored hash."""
    return compare_digest(hash_otp(otp), otp_hash)
