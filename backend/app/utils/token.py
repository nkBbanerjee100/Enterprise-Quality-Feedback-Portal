"""Token generation and validation utilities"""
import secrets
import hashlib


class TokenGenerator:
    """Generate and manage secure tokens"""

    @staticmethod
    def generate_secure_token(length: int = 32) -> str:
        """Generate a secure random token"""
        return secrets.token_urlsafe(length)

    @staticmethod
    def hash_token(token: str) -> str:
        """Hash a token for storage"""
        return hashlib.sha256(token.encode()).hexdigest()

    @staticmethod
    def verify_token_hash(token: str, token_hash: str) -> bool:
        """Verify token against hash"""
        return TokenGenerator.hash_token(token) == token_hash
