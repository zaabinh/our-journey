"""SMTP delivery for one-time account links. Tokens are never logged or persisted raw."""

from email.message import EmailMessage
import smtplib
import ssl

from ..config import settings
from ..errors import fail


def send_account_link(address: str, purpose: str, token: str) -> None:
    config = settings()
    if config.environment == "test":
        return
    if not all((config.smtp_host, config.smtp_from)):
        fail(503, "EMAIL_NOT_CONFIGURED", "Email delivery is not configured")
    action = "verify-email" if purpose == "verify_email" else "reset-password"
    url = f"{config.public_web_url.rstrip('/')}/{action}?token={token}"
    message = EmailMessage()
    message["Subject"] = (
        "Xác minh email Our Journey"
        if purpose == "verify_email"
        else "Đặt lại mật khẩu Our Journey"
    )
    message["From"] = config.smtp_from
    message["To"] = address
    message.set_content(
        f"Mở liên kết sau để tiếp tục. Liên kết chỉ dùng một lần và sẽ hết hạn sau một giờ:\n\n{url}\n"
    )
    try:
        with smtplib.SMTP(config.smtp_host, config.smtp_port, timeout=10) as client:
            client.ehlo()
            if config.smtp_starttls:
                client.starttls(context=ssl.create_default_context())
                client.ehlo()
            if config.smtp_username:
                client.login(config.smtp_username, config.smtp_password)
            client.send_message(message)
    except (OSError, smtplib.SMTPException):
        fail(503, "EMAIL_UNAVAILABLE", "Email delivery is temporarily unavailable")
