"""Email sending utilities"""
from typing import List, Optional


class EmailSender:
    """Send emails"""

    @staticmethod
    def send_email(
        to: str,
        subject: str,
        body: str,
        html_content: Optional[str] = None,
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None,
    ) -> bool:
        """Send email"""
        # TODO: Implement email sending
        pass

    @staticmethod
    def send_template_email(
        to: str,
        template_name: str,
        context: dict,
        cc: Optional[List[str]] = None,
    ) -> bool:
        """Send templated email"""
        # TODO: Implement templated email
        pass
