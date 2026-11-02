import unicodedata
from datetime import UTC, datetime

import pytest

from app.services.email_templates import Email, build, render_email

HEADER = "https://journey.example.test/brand/email-header.png"
SAMPLE = {
    "url": "https://journey.example.test/verify-email?token=t&x=1",
    "inviter": "Bình",
    "album_title": "Đà Lạt",
    "role": "contributor",
    "expires_at": "2026-11-03T05:00:00+00:00",
    "member": "An",
    "album_id": "a1",
    "memory_id": "m1",
    "memory_title": "Hồ Xuân Hương",
    "author": "An",
    "commenter": "An",
    "excerpt": "Đẹp quá!",
    "old_role": "viewer",
    "new_role": "contributor",
    "new_email": "new@example.test",
    "old_name": "Bình",
    "new_name": "Bình Đoàn",
    "at": "2026-11-02T10:00:00+00:00",
    "target": "đại diện",
    "path": "/profile",
}
KINDS = [
    "verify_email",
    "reset_password",
    "invite",
    "invite_accepted",
    "memory_published",
    "comment_new",
    "comment_mention",
    "comment_reply",
    "member_role_changed",
    "member_removed",
    "member_left",
    "password_changed",
    "email_changed",
    "profile_updated",
    "suspicious_login",
    "storage_failure",
]


def render(email, name="Bình", url="https://journey.example.test/x"):
    return render_email(email, name=name, action_url=url, header_url=HEADER)


@pytest.mark.parametrize("kind", KINDS)
def test_every_kind_renders_branded_html_and_text(kind):
    email = build(kind, SAMPLE)
    html, text = render(email)
    assert 'lang="vi"' in html and f'src="{HEADER}"' in html
    assert "#6a1e1e" in html and "#f1e4f3" in html
    assert "Chào bạn, <strong>Bình</strong>" in html
    assert text.startswith(email.title) and "Chào bạn, Bình" in text
    assert email.subject.endswith("| Our Journey")
    # Georgia lacks stacked Vietnamese glyphs; copy must stay NFC so clients compose correctly.
    assert "Georgia" not in html
    assert unicodedata.is_normalized("NFC", html + text)


def test_greeting_escapes_name_and_falls_back_without_one():
    email = Email(subject="s", title="t", paragraphs=[])
    html, text = render(email, name='<img src=x onerror="1">')
    assert "<strong>&lt;img src=x onerror=&quot;1&quot;&gt;</strong>" in html
    assert "<img src=x" not in html.replace(f'<img src="{HEADER}"', "")
    assert 'Chào bạn, <img src=x onerror="1">' in text  # plain text needs no escaping
    for missing in (None, "", "   "):
        html, text = render(email, name=missing)
        assert "Chào bạn,</p>" in html and "<strong>" not in html
        assert "Chào bạn," in text


def test_user_content_and_links_are_escaped():
    context = {
        **SAMPLE,
        "commenter": "<b>An</b>",
        "memory_title": "A & B",
        "excerpt": "<script>x</script>",
    }
    html, text = render(build("comment_new", context), url="https://e.test/p?a=1&b=2")
    assert "&lt;b&gt;An&lt;/b&gt;" in html and "A &amp; B" in html
    assert "&lt;script&gt;x&lt;/script&gt;" in html and "<script>" not in html
    assert 'href="https://e.test/p?a=1&amp;b=2"' in html
    assert "https://e.test/p?a=1&b=2" in text


def test_invite_shows_role_and_expiry_in_vietnam_time():
    email = build(
        "invite", {**SAMPLE, "expires_at": datetime(2026, 11, 3, 5, 0, tzinfo=UTC).isoformat()}
    )
    html, text = render(email)
    assert "người đóng góp" in text
    assert "12:00 ngày 03/11/2026 (giờ Việt Nam)" in text
    assert "Xem lời mời" in html


def test_cta_is_optional():
    html, text = render(build("email_changed", SAMPLE), url=None)
    assert "Nếu nút không hoạt động" not in html
    assert "new@example.test" in text
