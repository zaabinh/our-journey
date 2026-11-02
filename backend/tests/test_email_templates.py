from types import SimpleNamespace

from app.services import mail
from app.services.email_templates import render_notification_email, render_password_reset_email


def test_notification_template_uses_branding_and_escapes_dynamic_content():
    html = render_notification_email(
        preheader="Thông báo <an toàn>",
        title="Chào <bạn>",
        paragraphs=["Nội dung & chi tiết"],
        action_label="Mở liên kết",
        action_url="https://example.test/path?a=1&b=2",
        footer_note="Một ghi chú.",
    )

    assert 'lang="vi"' in html
    assert "#6a1e1e" in html and "#fff7f4" in html
    assert "Chào &lt;bạn&gt;" in html
    assert "Nội dung &amp; chi tiết" in html
    assert "https://example.test/path?a=1&amp;b=2" in html
    assert "Thông báo &lt;an toàn&gt;" in html


def test_account_links_share_html_shell_and_keep_text_fallback(monkeypatch):
    sent = []
    config = SimpleNamespace(public_web_url="https://journey.example.test")
    monkeypatch.setattr(mail, "settings", lambda: config)
    monkeypatch.setattr(mail, "_deliver", lambda address, subject, text, html: sent.append((address, subject, text, html)))

    mail.send_account_link("member@example.test", "verify_email", "verify-token")
    mail.send_account_link("member@example.test", "reset_password", "reset-token")

    assert sent[0][1] == "Xác minh email | Our Journey"
    assert "verify-email?token=verify-token" in sent[0][2]
    assert "Xác minh email" in sent[0][3]
    assert sent[1][1] == "Đặt lại mật khẩu | Our Journey"
    assert "reset-password?token=reset-token" in sent[1][2]
    assert "Đặt lại mật khẩu" in sent[1][3]
    assert "lang=\"vi\"" in sent[1][3]


def test_password_reset_template_escapes_link():
    html = render_password_reset_email("https://example.test/reset?a=1&b=2")

    assert "Đặt lại mật khẩu" in html
    assert "https://example.test/reset?a=1&amp;b=2" in html


def test_noncritical_notification_failure_does_not_raise(monkeypatch):
    def unavailable(*_args, **_kwargs):
        raise RuntimeError("SMTP unavailable")

    monkeypatch.setattr(mail, "_deliver", unavailable)

    assert mail.send_notification(
        "member@example.test",
        subject="Thông báo",
        title="Đã có cập nhật",
        paragraphs=["Nội dung"],
    ) is False
