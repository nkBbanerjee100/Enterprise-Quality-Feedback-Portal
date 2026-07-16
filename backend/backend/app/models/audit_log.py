"""
AuditLog — append-only event trail.

Distinct from csat_users.last_login_at (which only ever holds the MOST
RECENT login per user). This table stores every significant event as its
own row, so the Audit Logs page can show a real history instead of a
single current snapshot.

Keep writes to this table fire-and-forget from the caller's perspective:
service functions should never let an audit-log failure block the
underlying action (see services/audit_service.py — it swallows and logs
its own errors rather than raising).
"""
from datetime import datetime
from sqlalchemy import String, Text, DateTime, Index, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # Plain string column, NOT a SQLAlchemy ForeignKey(). csat_users is never
    # ORM-mapped in this codebase (see app/core/dependencies.py, app/routers/
    # auth.py — always raw text() SQL), so there's no Table object for
    # SQLAlchemy to resolve "csat_users.EmpId" against. Declaring
    # ForeignKey("csat_users.EmpId") here blows up at flush time with
    # NoReferencedTableError, because SQLAlchemy tries to topologically sort
    # tables by their FK dependencies and can't find a mapped `csat_users`
    # table to sort against.
    #
    # The actual FK constraint still exists at the DB level (added directly
    # via migrations/add_audit_logs.sql), which is all that's needed for
    # referential integrity — SQLAlchemy just doesn't need to be aware of it.
    actor_emp_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    actor_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    actor_role: Mapped[str | None] = mapped_column(String(30), nullable=True)

    # What happened. Keep this an open string (not a DB enum) so new action
    # types can ship without a migration — validate the value set in the
    # Pydantic schema / AuditAction constants instead.
    action: Mapped[str] = mapped_column(String(60), index=True)

    # What it happened to, if applicable.
    entity_type: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)
    entity_id: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)

    # Free-form context: before/after values, remarks, reason, etc.
    # Stored as a JSON string (MySQL TEXT rather than a JSON column keeps
    # this portable across MySQL versions that predate JSON support).
    details: Mapped[str | None] = mapped_column(Text, nullable=True)

    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)  # IPv6-safe
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Whether the action succeeded — lets failed logins live in the same
    # table as everything else instead of a separate "security events" list.
    success: Mapped[bool] = mapped_column(default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)

    # No relationship() here on purpose: csat_users isn't ORM-mapped in this
    # codebase (it's queried via raw text() SQL — see app/routers/auth.py,
    # app/core/dependencies.py). A relationship("CsatUser", ...) would raise
    # InvalidRequestError the first time this mapper gets configured, since
    # no such class exists. The FK constraint itself still works fine at the
    # DB level without an ORM-side relationship.

    __table_args__ = (
        # Most common query shape is "recent events, optionally filtered by
        # action type" — composite index keeps that fast without a full scan.
        Index("ix_audit_logs_action_created", "action", "created_at"),
    )