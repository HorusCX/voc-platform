import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
import logging

logger = logging.getLogger(__name__)

def send_email_gmail(to_email, subject, body, html_body=None):
    """
    Sends an email using Gmail SMTP.
    """
    smtp_server = "smtp.gmail.com"
    smtp_port = 587
    sender_email = os.getenv("MAIL_USERNAME")
    sender_password = os.getenv("MAIL_PASSWORD")

    if not sender_email or not sender_password:
        logger.error("❌ Gmail credentials not configured (MAIL_USERNAME, MAIL_PASSWORD).")
        return False

    try:
        msg = MIMEMultipart()
        msg['From'] = sender_email
        msg['To'] = to_email
        msg['Subject'] = subject

        # Attach text body
        msg.attach(MIMEText(body, 'plain'))
        
        # Attach HTML body if provided
        if html_body:
            msg.attach(MIMEText(html_body, 'html'))

        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(sender_email, sender_password)
            server.send_message(msg)
            
        logger.info(f"✅ Email sent to {to_email}")
        return True

    except Exception as e:
        logger.error(f"❌ Failed to send email: {e}")
        return False
