"""Allow audit log entity fields to be omitted for auth events.

Revision ID: 002_audit_log_nullable_entities
Revises: 001_cycle_project_enrollments
Create Date: 2026-07-15
"""
from alembic import op
import sqlalchemy as sa

revision = '002_audit_log_nullable_entities'
down_revision = '001_cycle_project_enrollments'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == 'mysql':
        op.execute("ALTER TABLE audit_logs MODIFY COLUMN entity_type VARCHAR(60) NULL")
        op.execute("ALTER TABLE audit_logs MODIFY COLUMN entity_id VARCHAR(60) NULL")
    else:
        op.alter_column('audit_logs', 'entity_type', existing_type=sa.String(length=60), nullable=True)
        op.alter_column('audit_logs', 'entity_id', existing_type=sa.String(length=60), nullable=True)


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == 'mysql':
        op.execute("ALTER TABLE audit_logs MODIFY COLUMN entity_type VARCHAR(60) NOT NULL")
        op.execute("ALTER TABLE audit_logs MODIFY COLUMN entity_id VARCHAR(60) NOT NULL")
    else:
        op.alter_column('audit_logs', 'entity_type', existing_type=sa.String(length=60), nullable=False)
        op.alter_column('audit_logs', 'entity_id', existing_type=sa.String(length=60), nullable=False)
