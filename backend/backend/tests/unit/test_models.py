"""Unit tests for audit log model behavior."""

from app.models.audit_log import AuditLog


def test_audit_log_allows_null_entity_fields(db_session):
    """Authentication events can be logged without an entity reference."""
    entry = AuditLog(
        action="LOGIN_SUCCESS",
        actor_emp_id="1001",
        actor_name="Test User",
        actor_role="QUALITY",
        entity_type=None,
        entity_id=None,
        success=True,
    )

    db_session.add(entry)
    db_session.commit()

    saved = db_session.query(AuditLog).filter_by(action="LOGIN_SUCCESS").one()
    assert saved.entity_type is None
    assert saved.entity_id is None
