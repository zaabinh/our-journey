import json
from types import SimpleNamespace

from app.services import mail


def test_resend_delivery_uses_environment_configuration(monkeypatch):
    captured = {}
    config = SimpleNamespace(
        environment="development",
        resend_api_key="resend-test-key",
        smtp_from="ourjourney",
        smtp_host="example.test",
        smtp_username="Our Journey",
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
        captured["payload"] = json.loads(request.data.decode("utf-8"))
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr(mail, "settings", lambda: config)
    monkeypatch.setattr(mail, "urlopen", fake_urlopen)

    mail._deliver(
        "member@example.test",
        "Kỷ niệm mới",
        "Plain text",
        "<p>HTML</p>",
    )

    assert captured["url"] == "https://api.resend.com/emails"
    assert captured["method"] == "POST"
    assert captured["authorization"] == "Bearer resend-test-key"
    assert captured["timeout"] == 30
    assert captured["payload"] == {
        "from": "Our Journey <ourjourney@example.test>",
        "to": ["member@example.test"],
        "subject": "Kỷ niệm mới",
        "html": "<p>HTML</p>",
        "text": "Plain text",
    }
