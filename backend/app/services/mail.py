"""SMTP delivery for account links and best-effort product notifications."""

import logging
from email.message import EmailMessage
import smtplib
import ssl
from urllib.parse import urlencode

from ..config import settings
from ..errors import fail
from .email_templates import render_notification_email, render_password_reset_email, render_verification_email

logger = logging.getLogger(__name__)


def _deliver(address: str, subject: str, text: str, html: str) -> None:
    config = settings()
    if config.environment == "test":
        return
    if not all((config.smtp_host, config.smtp_from)):
        fail(503, "EMAIL_NOT_CONFIGURED", "Email delivery is not configured")
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = config.smtp_from
    message["To"] = address
    message.set_content(text, charset="utf-8")
    message.add_alternative(html, subtype="html", charset="utf-8")
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


def send_account_link(address: str, purpose: str, token: str) -> None:
    config = settings()
    verify = purpose == "verify_email"
    path = "verify-email" if verify else "reset-password"
    url = f"{config.public_web_url.rstrip('/')}/{path}?{urlencode({'token': token})}"
    title = "Xác minh email | Our Journey" if verify else "Đặt lại mật khẩu | Our Journey"
    html = render_verification_email(url) if verify else render_password_reset_email(url)
    text = (
        f"Our Journey: {title}. Mở liên kết này để tiếp tục: {url}\n"
        "Liên kết chỉ dùng một lần và hết hạn sau 1 giờ."
    )
    _deliver(address, title, text, html)


def send_notification(
    address: str,
    *,
    subject: str,
    title: str,
    paragraphs: list[str],
    action_label: str | None = None,
    action_url: str | None = None,
) -> bool:
    """Send a non-critical event email without breaking the user operation."""
    try:
        html = render_notification_email(
            preheader=subject,
            title=title,
            paragraphs=paragraphs,
            action_label=action_label,
            action_url=action_url,
        )
        text = "\n\n".join([title, *paragraphs, action_url or ""])
        _deliver(address, subject, text, html)
        return True
    except Exception as exc:
        # Never include recipient addresses, message bodies, or account links in logs.
        logger.warning("Notification email failed (%s): %s", subject[:80], type(exc).__name__)
        return False
