"""Create customer_otp table for survey OTP verification.

Revision ID: 003_create_customer_otp
Revises: 002_audit_log_nullable_entities
Create Date: 2026-07-22
"""
from alembic import op
import sqlalchemy as sa

revision = "003_create_customer_otp"
down_revision = "002_audit_log_nullable_entities"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "customer_otp",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("otp_hash", sa.String(length=255), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("verified", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("idx_customer_otp_email", "customer_otp", ["email"])


def downgrade() -> None:
    op.drop_index("idx_customer_otp_email", table_name="customer_otp")
    op.drop_table("customer_otp")
