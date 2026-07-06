"""Role-Based Access Control (RBAC)"""


# Matches the exact enum values in csat_users.role column
ROLE_PERMISSIONS: dict[str, list[str]] = {
    "QUALITY": [
        "VIEW_PROJECTS", "SEND_FEEDBACK", "RESEND_FEEDBACK",
        "VIEW_REPORTS", "EXPORT_REPORTS", "MANAGE_USERS",
        "VIEW_AUDIT_LOGS", "MANAGE_SETTINGS",
    ],
    "MANAGEMENT": [
        "VIEW_PROJECTS", "SEND_FEEDBACK", "RESEND_FEEDBACK",
        "VIEW_REPORTS", "EXPORT_REPORTS", "MANAGE_USERS",
        "VIEW_AUDIT_LOGS", "MANAGE_SETTINGS",
    ],
    "MANAGER": [
        "VIEW_PROJECTS", "SEND_FEEDBACK", "RESEND_FEEDBACK",
        "VIEW_REPORTS", "EXPORT_REPORTS", "MANAGE_USERS",
        "VIEW_AUDIT_LOGS", "MANAGE_SETTINGS",
    ],
    "DELIVERY": [
        "VIEW_PROJECTS", "SEND_FEEDBACK",
        "VIEW_REPORTS", "EXPORT_REPORTS",
    ],
    "SALES": [
        "VIEW_PROJECTS", "SEND_FEEDBACK",
        "VIEW_REPORTS", "EXPORT_REPORTS",
    ],
    "CUSTOMER": [
        "SUBMIT_FEEDBACK",
    ],
}


def has_permission(role: str, permission: str) -> bool:
    """Check if a role has a specific permission."""
    return permission in ROLE_PERMISSIONS.get(role, [])


def get_permissions(role: str) -> list[str]:
    """Get all permissions for a role."""
    return ROLE_PERMISSIONS.get(role, [])