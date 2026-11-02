"""Resend delivery for account links and best-effort product notifications."""

import logging
import json
from email.utils import formataddr
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from urllib.parse import urlencode

from ..config import settings
from ..errors import fail
from .email_templates import render_notification_email, render_password_reset_email, render_verification_email

logger = logging.getLogger(__name__)


def _deliver(address: str, subject: str, text: str, html: str) -> None:
    config = settings()
    if config.environment == "test":
        return
    if not all((config.resend_api_key, config.smtp_host, config.smtp_from)):
        fail(503, "EMAIL_NOT_CONFIGURED", "Email delivery is not configured")

    sender_address = config.smtp_from.strip()
    if "@" not in sender_address:
        sender_address = f"{sender_address}@{config.smtp_host.strip()}"
    sender = formataddr((config.smtp_username.strip(), sender_address))
    payload = json.dumps(
        {
            "from": sender,
            "to": [address],
            "subject": subject,
            "html": html,
            "text": text,
        },
        ensure_ascii=False,
    ).encode("utf-8")
    request = Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {config.resend_api_key}",
            "Content-Type": "application/json",
            "User-Agent": "OurJourney/1.0",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=30) as response:
            response.read()
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        logger.warning("Resend email delivery failed: %s", type(exc).__name__)
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
