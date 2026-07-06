import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
 
from typing import List, Optional
from app.config import settings
 
 
class EmailSender:
 
    @staticmethod
    def send_email(
        to: str,
        subject: str,
        body: str,
        html_content: Optional[str] = None,
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None,
    ) -> bool:
 
        try:
 
            message = MIMEMultipart("alternative")
 
            message["From"] = settings.smtp_user
            message["To"] = to
            message["Subject"] = subject
 
 
            if cc:
                message["Cc"] = ",".join(cc)
 
 
            message.attach(
                MIMEText(body, "plain")
            )
 
 
            if html_content:
 
                message.attach(
                    MIMEText(
                        html_content,
                        "html"
                    )
                )
 
 
            recipients = [to]
 
 
            if cc:
                recipients += cc
 
 
            if bcc:
                recipients += bcc
 
 
 
            server = smtplib.SMTP(
                settings.smtp_server,
                settings.smtp_port
            )
 
 
            server.starttls()
 
 
            server.login(
                settings.smtp_user,
                settings.smtp_password
            )
 
 
            server.sendmail(
                settings.smtp_user,
                recipients,
                message.as_string()
            )
 
 
            server.quit()
 
 
            return True
 
 
        except Exception as e:
 
            print("SMTP ERROR:", e)
 
            return False
 