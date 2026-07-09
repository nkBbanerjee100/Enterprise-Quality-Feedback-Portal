"""Add cycle_project_enrollments table

Revision ID: 001_cycle_project_enrollments
Revises:
Create Date: 2025-06-25
"""
from alembic import op
import sqlalchemy as sa

revision = '001_cycle_project_enrollments'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'cycle_project_enrollments',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('cycle_id', sa.Integer(), sa.ForeignKey('csat_cycles.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('project_id', sa.Integer(), sa.ForeignKey('dim_projects.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('eligibility_status', sa.String(30), nullable=False, default='eligible'),
        sa.Column('exemption_reason', sa.Text(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('enrolled_by', sa.String(50), nullable=True),
        sa.Column('enrolled_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), onupdate=sa.func.now()),
        sa.Column('approval_requested_at', sa.DateTime(), nullable=True),
        sa.Column('approval_requested_by', sa.String(50), nullable=True),
        sa.Column('approved_or_declined_by', sa.String(50), nullable=True),
        sa.Column('approved_or_declined_at', sa.DateTime(), nullable=True),
        sa.Column('manager_remarks', sa.Text(), nullable=True),
    )
    # Unique constraint: one enrollment per project per cycle
    op.create_unique_constraint(
        'uq_cycle_project', 'cycle_project_enrollments', ['cycle_id', 'project_id']
    )


def downgrade() -> None:
    op.drop_table('cycle_project_enrollments')
