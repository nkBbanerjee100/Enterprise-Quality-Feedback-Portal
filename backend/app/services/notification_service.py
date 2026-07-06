"""Notification Service"""
from sqlalchemy.orm import Session
from app.utils.email import EmailSender
 
 
class NotificationService:
    """Handle email notifications and reminders"""
 
    def __init__(self, db: Session):
        self.db = db
 
    def send_feedback_request_email(
        self,
        recipient_email: str,
        feedback_url: str
    ):
        subject = "Customer Satisfaction Feedback Request"
 
        html = f"""
        <h2>Customer Feedback Request</h2>
        <p>Hello,</p>
        <p>Please provide your feedback for our project.</p>
        <a href="{feedback_url}">
            Click Here To Submit Feedback
        </a>
        <br><br>
        Thanks
        """
 
        return EmailSender.send_email(
            to=recipient_email,
            subject=subject,
            body="Please submit feedback",
            html_content=html
        )
 
    def send_reminder_email(self, recipient_email: str):
        """Send reminder email for pending feedback"""
        # TODO: Implement reminder email
        pass
 
    def send_summary_email(self, recipient_email: str, cycle_id: int):
        """Send cycle summary email"""
        # TODO: Implement summary email
        pass
 
    def send_alert_email(self, recipient_email: str, alert_type: str, details: dict):
        """Send alert emails"""
        # TODO: Implement alert email
        pass
 