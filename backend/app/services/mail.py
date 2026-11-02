"""Resend HTTP delivery. Account links are sent directly; activity goes through the outbox."""

import json
import logging
from email.utils import formataddr
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from ..config import settings
from ..errors import fail
from .email_templates import build, render_email

logger = logging.getLogger(__name__)


def _deliver(
    address: str, subject: str, text: str, html: str, idempotency_key: str | None = None
) -> None:
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
    headers = {
        "Authorization": f"Bearer {config.resend_api_key}",
        "Content-Type": "application/json",
        "User-Agent": "OurJourney/1.0",
    }
    if idempotency_key:
        # Resend drops a repeat with the same key, so an outbox retry cannot double-send.
        headers["Idempotency-Key"] = idempotency_key
    request = Request("https://api.resend.com/emails", data=payload, headers=headers, method="POST")
    try:
        with urlopen(request, timeout=30) as response:
            response.read()
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        logger.warning("Resend email delivery failed: %s", type(exc).__name__)
        fail(503, "EMAIL_UNAVAILABLE", "Email delivery is temporarily unavailable")


def absolute_url(action: str | None) -> str | None:
    if not action or action.startswith("https://") or action.startswith("http://"):
        return action
    return f"{settings().public_web_url.rstrip('/')}/{action.lstrip('/')}"


def send_email(
    address: str,
    kind: str,
    context: dict,
    *,
    name: str | None,
    idempotency_key: str | None = None,
) -> None:
    """Render and deliver one email; raises on delivery failure."""
    email = build(kind, context)
    html, text = render_email(
        email,
        name=name,
        action_url=absolute_url(email.action),
        header_url=settings().header_image_url(),
    )
    _deliver(address, email.subject, text, html, idempotency_key)


def send_account_link(address: str, purpose: str, token: str, name: str | None = None) -> None:
    # Raw tokens exist only in this email, never in the database or the outbox.
    path = "verify-email" if purpose == "verify_email" else "reset-password"
    url = f"{settings().public_web_url.rstrip('/')}/{path}?{urlencode({'token': token})}"
    send_email(address, purpose, {"url": url}, name=name)


def send_best_effort(address: str, kind: str, context: dict, *, name: str | None = None) -> bool:
    """Notices that must not break the user operation (invites, upload failures)."""
    try:
        send_email(address, kind, context, name=name)
        return True
    except Exception as exc:
        # Never include recipient addresses, message bodies, or links in logs.
        logger.warning("Email %s failed: %s", kind, type(exc).__name__)
        return False
