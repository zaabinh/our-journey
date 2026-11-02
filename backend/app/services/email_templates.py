"""Branded, email-client-friendly templates for Our Journey emails.

`render_email` is the single layout; `build(kind, context)` maps each event to its copy.
Body text uses web-safe fonts: Gmail ignores web fonts, and Georgia lacks stacked
Vietnamese glyphs (ế, ầ, ấ), so the Dancing Script wordmark ships as a header image.
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from html import escape

SERIF = "Times New Roman,Times,serif"
SANS = "Arial,Helvetica,sans-serif"
VIETNAM = timezone(timedelta(hours=7))  # No DST in Vietnam.
ROLE_LABELS = {"owner": "chủ album", "contributor": "người đóng góp", "viewer": "người xem"}


@dataclass
class Email:
    subject: str
    title: str
    paragraphs: list[str]
    action_label: str | None = None
    # Path on the web app, or a full URL (account and invite links).
    action: str | None = None
    footer_note: str | None = None
    quote: str | None = None
    preheader: str = ""
    extra: dict = field(default_factory=dict)


def role_label(role: str) -> str:
    return ROLE_LABELS.get(role, role)


def format_expiry(value: datetime | str) -> str:
    if isinstance(value, str):
        value = datetime.fromisoformat(value)
    return value.astimezone(VIETNAM).strftime("%H:%M ngày %d/%m/%Y (giờ Việt Nam)")


def excerpt(text: str, limit: int = 280) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def render_email(
    email: Email,
    *,
    name: str | None,
    action_url: str | None,
    header_url: str,
) -> tuple[str, str]:
    """Return (html, text). Every dynamic value is escaped here, never by callers."""
    clean_name = (name or "").strip()
    greeting_html = (
        f"Chào bạn, <strong>{escape(clean_name)}</strong>" if clean_name else "Chào bạn,"
    )
    greeting_text = f"Chào bạn, {clean_name}" if clean_name else "Chào bạn,"
    p_style = f"margin:0 0 16px;color:#590d22;font:16px/1.65 {SANS}"
    small = f"color:#762239;font:13px/1.6 {SANS}"
    body = f'<p style="{p_style}">{greeting_html}</p>' + "".join(
        f'<p style="{p_style}">{escape(text)}</p>' for text in email.paragraphs
    )
    if email.quote:
        body += (
            '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px">'
            '<tr><td style="padding:12px 16px;background:#fff0f3;border-left:4px solid #b6465f;border-radius:8px;'
            f'color:#590d22;font:italic 15px/1.6 {SANS}">{escape(email.quote)}</td></tr></table>'
        )
    action = ""
    if email.action_label and action_url:
        safe_url = escape(action_url, quote=True)
        action = (
            '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 22px"><tr>'
            '<td bgcolor="#6a1e1e" style="border-radius:12px;text-align:center">'
            f'<a href="{safe_url}" style="display:inline-block;padding:15px 26px;border:1px solid #6a1e1e;border-radius:12px;'
            f'color:#fff8e7;font:bold 16px/1 {SANS};text-decoration:none">{escape(email.action_label)}</a>'
            "</td></tr></table>"
            f'<p style="margin:0 0 8px;{small}">Nếu nút không hoạt động, hãy mở liên kết này:</p>'
            f'<p style="margin:0 0 22px;word-break:break-all;{small}"><a href="{safe_url}" style="color:#762239">{safe_url}</a></p>'
        )
    note = (
        f'<p style="margin:0;{small}">{escape(email.footer_note)}</p>' if email.footer_note else ""
    )
    preheader = email.preheader or email.title
    html = f"""<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>{escape(email.title)}</title></head>
<body style="margin:0;padding:0;background:#f1e4f3;font-family:{SANS}"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">{escape(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f1e4f3"><tr><td align="center" style="padding:32px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px">
<tr><td style="padding:0 0 16px;text-align:center"><img src="{escape(header_url, quote=True)}" width="326" height="80" alt="Our Journey" style="display:inline-block;width:326px;max-width:100%;height:auto;border:0;border-radius:14px;background:#812039;color:#fff8f4;font:bold 28px/80px {SERIF}"></td></tr>
<tr><td style="padding:0;background:#fff7f4;border:1px solid #e8a2b3;border-radius:18px;overflow:hidden"><div style="height:8px;background:#6a1e1e;font-size:0;line-height:0">&nbsp;</div><div style="padding:34px 36px 30px"><h1 style="margin:0 0 20px;color:#4a1020;font:bold 27px/1.25 {SERIF}">{escape(email.title)}</h1>{body}{action}{note}</div></td></tr>
<tr><td style="padding:19px 14px 0;text-align:center;color:#762239;font:12px/1.6 {SANS}">Email tự động từ Our Journey. Vui lòng không trả lời email này.<br>Lưu những khoảnh khắc bên nhau.</td></tr>
</table></td></tr></table></body></html>"""
    text_parts = [email.title, greeting_text, *email.paragraphs]
    if email.quote:
        text_parts.append(f"“{email.quote}”")
    if action_url:
        text_parts.append(f"{email.action_label or 'Mở liên kết'}: {action_url}")
    if email.footer_note:
        text_parts.append(email.footer_note)
    text_parts.append("Email tự động từ Our Journey. Vui lòng không trả lời email này.")
    return html, "\n\n".join(text_parts)


def _memory_path(c):
    return f"/albums/{c['album_id']}/memories/{c['memory_id']}"


def build(kind: str, c: dict) -> Email:
    """Copy for each email kind. `c` holds plain values only (names, titles, ids, roles)."""
    match kind:
        case "verify_email":
            return Email(
                subject="Xác minh email | Our Journey",
                preheader="Xác minh địa chỉ email để bắt đầu lưu giữ hành trình của bạn.",
                title="Xác minh email của bạn",
                paragraphs=[
                    "Cảm ơn bạn đã tạo tài khoản Our Journey. Hãy xác minh email để hoàn tất đăng ký."
                ],
                action_label="Xác minh email",
                action=c["url"],
                footer_note="Liên kết chỉ dùng một lần và hết hạn sau 1 giờ. Nếu bạn không tạo tài khoản, hãy bỏ qua email này.",
            )
        case "reset_password":
            return Email(
                subject="Đặt lại mật khẩu | Our Journey",
                preheader="Liên kết đặt lại mật khẩu Our Journey.",
                title="Đặt lại mật khẩu",
                paragraphs=["Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn."],
                action_label="Đặt lại mật khẩu",
                action=c["url"],
                footer_note="Liên kết chỉ dùng một lần và hết hạn sau 1 giờ. Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.",
            )
        case "invite":
            return Email(
                subject=f"{c['inviter']} mời bạn tham gia album | Our Journey",
                title="Bạn được mời tham gia một album",
                paragraphs=[
                    f"{c['inviter']} mời bạn tham gia album “{c['album_title']}” trên Our Journey.",
                    f"Quyền của bạn: {role_label(c['role'])}.",
                    f"Lời mời hết hạn lúc {format_expiry(c['expires_at'])}.",
                ],
                action_label="Xem lời mời",
                action=c["url"],
                footer_note="Bạn cần đăng nhập hoặc tạo tài khoản để tham gia. Nếu bạn không biết người gửi, hãy bỏ qua email này.",
            )
        case "invite_accepted":
            return Email(
                subject="Thành viên mới tham gia album | Our Journey",
                title="Có thành viên mới trong album",
                paragraphs=[
                    f"{c['member']} đã tham gia album “{c['album_title']}” với quyền {role_label(c['role'])}."
                ],
                action_label="Quản lý thành viên",
                action=f"/albums/{c['album_id']}/settings",
            )
        case "memory_published":
            return Email(
                subject=f"Kỷ niệm mới trong “{c['album_title']}” | Our Journey",
                title="Một kỷ niệm mới vừa được chia sẻ",
                paragraphs=[
                    f"{c['author']} đã đăng kỷ niệm “{c['memory_title']}” trong album “{c['album_title']}”."
                ],
                action_label="Xem kỷ niệm",
                action=_memory_path(c),
            )
        case "comment_new":
            return Email(
                subject="Bình luận mới về kỷ niệm của bạn | Our Journey",
                title="Có bình luận mới",
                paragraphs=[
                    f"{c['commenter']} đã bình luận về kỷ niệm “{c['memory_title']}” trong album “{c['album_title']}”."
                ],
                quote=c["excerpt"],
                action_label="Xem bình luận",
                action=_memory_path(c),
            )
        case "comment_mention":
            return Email(
                subject="Bạn được nhắc đến trong một bình luận | Our Journey",
                title="Bạn được nhắc đến",
                paragraphs=[
                    f"{c['commenter']} đã nhắc đến bạn trong kỷ niệm “{c['memory_title']}”."
                ],
                quote=c["excerpt"],
                action_label="Xem bình luận",
                action=_memory_path(c),
            )
        case "comment_reply":
            # Template only: comments are flat, so no reply event exists yet.
            return Email(
                subject="Có phản hồi mới trong cuộc trò chuyện | Our Journey",
                title="Có phản hồi mới",
                paragraphs=[
                    f"{c['commenter']} đã trả lời trong cuộc trò chuyện về kỷ niệm “{c['memory_title']}”."
                ],
                quote=c["excerpt"],
                action_label="Xem phản hồi",
                action=_memory_path(c),
            )
        case "member_role_changed":
            return Email(
                subject="Quyền của bạn trong album đã thay đổi | Our Journey",
                title="Quyền thành viên đã thay đổi",
                paragraphs=[
                    f"Quyền của bạn trong album “{c['album_title']}” đã đổi từ {role_label(c['old_role'])} "
                    f"thành {role_label(c['new_role'])}."
                ],
                action_label="Mở album",
                action=f"/albums/{c['album_id']}",
            )
        case "member_removed":
            return Email(
                subject="Bạn đã được gỡ khỏi album | Our Journey",
                title="Thay đổi thành viên album",
                paragraphs=[f"Bạn không còn là thành viên của album “{c['album_title']}”."],
                action_label="Xem album của bạn",
                action="/albums",
            )
        case "member_left":
            return Email(
                subject="Thành viên rời khỏi album | Our Journey",
                title="Một thành viên đã rời album",
                paragraphs=[f"{c['member']} đã rời khỏi album “{c['album_title']}”."],
                action_label="Quản lý thành viên",
                action=f"/albums/{c['album_id']}/settings",
            )
        case "password_changed":
            return Email(
                subject="Mật khẩu đã được cập nhật | Our Journey",
                title="Mật khẩu đã được cập nhật",
                paragraphs=[
                    "Mật khẩu Our Journey của bạn vừa được đặt lại. Tất cả phiên đăng nhập cũ đã bị đăng xuất."
                ],
                footer_note="Nếu bạn không thực hiện thay đổi này, hãy đặt lại mật khẩu ngay.",
                action_label="Đăng nhập",
                action="/login",
            )
        case "email_changed":
            # Template only: there is no change-email endpoint yet.
            return Email(
                subject="Email tài khoản đã thay đổi | Our Journey",
                title="Email tài khoản đã thay đổi",
                paragraphs=[f"Email đăng nhập của bạn đã được đổi thành {c['new_email']}."],
                footer_note="Nếu bạn không thực hiện thay đổi này, hãy đặt lại mật khẩu ngay.",
            )
        case "profile_updated":
            return Email(
                subject="Hồ sơ đã được cập nhật | Our Journey",
                title="Tên hiển thị đã thay đổi",
                paragraphs=[
                    f"Tên hiển thị của bạn đã đổi từ “{c['old_name']}” thành “{c['new_name']}”."
                ],
                footer_note="Nếu bạn không thực hiện thay đổi này, hãy đặt lại mật khẩu ngay.",
                action_label="Xem hồ sơ",
                action="/profile",
            )
        case "suspicious_login":
            # Template only: there is no login-risk detection yet.
            return Email(
                subject="Phát hiện đăng nhập bất thường | Our Journey",
                title="Có đăng nhập bất thường",
                paragraphs=[
                    f"Chúng tôi phát hiện một lần đăng nhập bất thường vào lúc {format_expiry(c['at'])}."
                ],
                footer_note="Nếu đó không phải bạn, hãy đặt lại mật khẩu ngay.",
                action_label="Đặt lại mật khẩu",
                action="/forgot-password",
            )
        case "storage_failure":
            return Email(
                subject="Tải ảnh chưa thành công | Our Journey",
                title="Tải ảnh chưa thành công",
                paragraphs=[
                    f"Hệ thống chưa thể lưu ảnh {c['target']}. Ảnh chưa được lưu; vui lòng thử tải lại sau ít phút."
                ],
                action_label="Thử lại",
                action=c["path"],
            )
    raise ValueError(f"Unknown email kind: {kind}")
