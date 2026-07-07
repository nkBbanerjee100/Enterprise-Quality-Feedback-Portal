"""Feedback Request Service"""
from sqlalchemy.orm import Session


class FeedbackRequestService:
    """Manage feedback requests"""

    def __init__(self, db: Session):
        self.db = db

    def create_request(self, cycle_id: int, project_id: int, recipient_email: str, recipient_name: str):
        """Create a new feedback request"""
        # TODO: Implement feedback request creation
        pass

    def send_request(self, request_id: int):
        """Send feedback request to recipient"""
        # TODO: Implement sending logic
        pass

    def send_reminders(self):
        """Send reminder emails for pending requests"""
        # TODO: Implement reminder sending
        pass

    def get_pending_requests(self, cycle_id: int):
        """Get pending feedback requests"""
        # TODO: Implement pending requests retrieval
        pass
