import smtplib
import os
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables
env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

logger = logging.getLogger(__name__)

MAIL_USERNAME = os.getenv("MAIL_USERNAME")
MAIL_PASSWORD = os.getenv("MAIL_PASSWORD")
MAIL_SERVER = "smtp.gmail.com"  # Assuming Gmail based on password format in .env
MAIL_PORT = 587

def send_invitation_email(recipient_email: str, portfolio_name: str, invite_link: str):
    """Sends an invitation email using SMTP."""
    if not MAIL_USERNAME or not MAIL_PASSWORD:
        logger.error("❌ Email credentials missing in environment variables")
        return False

    msg = MIMEMultipart()
    msg['From'] = MAIL_USERNAME
    msg['To'] = recipient_email
    msg['Subject'] = f"Invitation to join Portfolio: {portfolio_name}"

    body = f"""
    <html>
    <body>
        <h2>You've been invited!</h2>
        <p>You have been invited to collaborate on the portfolio <strong>{portfolio_name}</strong> on VoC Intelligence.</p>
        <p>To accept the invitation and set up your account, please click the link below:</p>
        <p><a href="{invite_link}" style="padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Accept Invitation</a></p>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p>{invite_link}</p>
        <p>This invitation will expire in 48 hours.</p>
        <br>
        <p>Best regards,<br>VoC Intelligence Team</p>
    </body>
    </html>
    """
    msg.attach(MIMEText(body, 'html'))

    try:
        server = smtplib.SMTP(MAIL_SERVER, MAIL_PORT)
        server.starttls()
        server.login(MAIL_USERNAME, MAIL_PASSWORD)
        server.send_message(msg)
        server.quit()
        logger.info(f"✅ Invitation email sent to {recipient_email}")
        return True
    except Exception as e:
        logger.error(f"❌ Failed to send invitation email to {recipient_email}: {e}")
        return False
