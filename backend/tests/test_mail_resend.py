import json
from types import SimpleNamespace

import pytest

from app.config import Settings
from app.services import mail


@pytest.fixture
def captured(monkeypatch):
    captured = {}
    config = SimpleNamespace(
        environment="development",
        resend_api_key="resend-test-key",
        smtp_from="ourjourney",
        smtp_host="example.test",
        smtp_username="Our Journey",
        public_web_url="https://journey.example.test",
        header_image_url=lambda: "https://cdn.example.test/header.png",
    )

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return b'{"id":"email_123"}'

    def fake_urlopen(request, timeout):
        captured["url"] = request.full_url
        captured["method"] = request.get_method()
        captured["authorization"] = request.get_header("Authorization")
        captured["idempotency"] = request.get_header("Idempotency-key")
        captured["payload"] = json.loads(request.data.decode("utf-8"))
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr(mail, "settings", lambda: config)
    monkeypatch.setattr(mail, "urlopen", fake_urlopen)
    return captured


def test_resend_delivery_uses_environment_configuration(captured):
    mail._deliver("member@example.test", "Kỷ niệm mới", "Plain text", "<p>HTML</p>", "outbox-1")

    assert captured["url"] == "https://api.resend.com/emails"
    assert captured["method"] == "POST"
    assert captured["authorization"] == "Bearer resend-test-key"
    assert captured["idempotency"] == "outbox-1"
    assert captured["timeout"] == 30
    assert captured["payload"] == {
        "from": "Our Journey <ourjourney@example.test>",
        "to": ["member@example.test"],
        "subject": "Kỷ niệm mới",
        "html": "<p>HTML</p>",
        "text": "Plain text",
    }


def test_account_link_is_personalized_and_uses_configured_header(captured):
    mail.send_account_link("member@example.test", "verify_email", "raw-token", "Bình")

    payload = captured["payload"]
    assert payload["subject"] == "Xác minh email | Our Journey"
    assert "Chào bạn, <strong>Bình</strong>" in payload["html"]
    assert 'src="https://cdn.example.test/header.png"' in payload["html"]
    assert "https://journey.example.test/verify-email?token=raw-token" in payload["text"]
    assert captured["idempotency"] is None


def test_best_effort_send_swallows_failures_without_logging_details(monkeypatch, caplog):
    def unavailable(*_args, **_kwargs):
        raise RuntimeError("secret detail member@example.test")

    monkeypatch.setattr(mail, "send_email", unavailable)

    assert mail.send_best_effort("member@example.test", "storage_failure", {}) is False
    assert "member@example.test" not in caplog.text and "secret detail" not in caplog.text


def test_header_url_defaults_to_frontend_and_production_requires_https():
    assert (
        Settings(_env_file=None, public_web_url="https://journey.example.test/").header_image_url()
        == "https://journey.example.test/brand/email-header.png"
    )
    production = dict(
        _env_file=None,
        environment="production",
        storage_driver="r2",
        allowed_origins=["https://journey.example.test"],
        public_web_url="https://journey.example.test",
        r2_endpoint="https://r2.example.test",
        r2_bucket="journey",
        r2_access_key="key",
        r2_secret_key="secret",
    )
    Settings(**production).validate_runtime()
    with pytest.raises(ValueError, match="OJ_EMAIL_HEADER_URL"):
        Settings(**production, email_header_url="http://cdn.example.test/h.png").validate_runtime()
