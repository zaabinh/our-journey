"""Branded, email-client-friendly templates for Our Journey notifications."""

from html import escape


def render_notification_email(
    *,
    preheader: str,
    title: str,
    paragraphs: list[str],
    action_label: str | None = None,
    action_url: str | None = None,
    footer_note: str | None = None,
) -> str:
    body = "".join(
        f'<p style="margin:0 0 16px;color:#590d22;font:16px/1.65 Arial,Helvetica,sans-serif">{escape(text)}</p>'
        for text in paragraphs
    )
    action = ""
    if action_label and action_url:
        safe_url = escape(action_url, quote=True)
        action = (
            '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 22px"><tr><td bgcolor="#6a1e1e" style="border-radius:12px;text-align:center">'
            f'<a href="{safe_url}" style="display:inline-block;padding:15px 26px;border:1px solid #6a1e1e;border-radius:12px;color:#fff8e7;font:bold 15px/1 Arial,Helvetica,sans-serif;text-decoration:none">{escape(action_label)}</a>'
            "</td></tr></table>"
            f'<p style="margin:0 0 8px;color:#762239;font:13px/1.5 Arial,Helvetica,sans-serif">Nếu nút không hoạt động, hãy mở liên kết này:</p><p style="margin:0 0 22px;word-break:break-all;font:13px/1.6 Arial,Helvetica,sans-serif"><a href="{safe_url}" style="color:#762239">{safe_url}</a></p>'
        )
    note = (
        f'<p style="margin:0;color:#762239;font:13px/1.6 Arial,Helvetica,sans-serif">{escape(footer_note)}</p>'
        if footer_note
        else ""
    )
    return f'''<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>{escape(title)}</title></head>
<body style="margin:0;padding:0;background:#f1e4f3"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">{escape(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f1e4f3"><tr><td align="center" style="padding:32px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px">
<tr><td style="padding:0 0 16px;text-align:center"><span style="display:inline-block;width:34px;height:34px;margin-right:8px;border-radius:50%;background:#6a1e1e;color:#fff8e7;font:bold 19px/34px Georgia,serif;vertical-align:middle">&#9829;</span><span style="color:#590d22;font:bold 19px/34px Georgia,'Times New Roman',serif;vertical-align:middle">Our Journey</span></td></tr>
<tr><td style="padding:0;background:#fff7f4;border:1px solid #b6465f55;border-radius:18px;overflow:hidden"><div style="height:8px;background:#6a1e1e;font-size:0;line-height:0">&nbsp;</div><div style="padding:34px 36px 30px"><p style="margin:0 0 10px;color:#852d47;font:bold 11px/1.4 Arial,Helvetica,sans-serif;letter-spacing:2px;text-transform:uppercase">OUR JOURNEY</p><h1 style="margin:0 0 20px;color:#4a1020;font:bold 27px/1.25 Georgia,'Times New Roman',serif">{escape(title)}</h1>{body}{action}{note}</div></td></tr>
<tr><td style="padding:19px 14px 0;text-align:center;color:#762239;font:12px/1.6 Arial,Helvetica,sans-serif">Email tự động từ Our Journey. Vui lòng không trả lời email này.<br>Lưu những khoảnh khắc bên nhau.</td></tr>
</table></td></tr></table></body></html>'''


def render_verification_email(url: str) -> str:
    return render_notification_email(
        preheader="Xác minh địa chỉ email để bắt đầu lưu giữ hành trình của bạn.",
        title="Xác minh email của bạn",
        paragraphs=["Chào bạn,", "Cảm ơn bạn đã tạo tài khoản Our Journey. Hãy xác minh email để hoàn tất đăng ký."],
        action_label="Xác minh email",
        action_url=url,
        footer_note="Liên kết chỉ dùng một lần và hết hạn sau 1 giờ. Nếu bạn không tạo tài khoản, hãy bỏ qua email này.",
    )


def render_password_reset_email(url: str) -> str:
    return render_notification_email(
        preheader="Liên kết đặt lại mật khẩu Our Journey.",
        title="Đặt lại mật khẩu",
        paragraphs=["Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn."],
        action_label="Đặt lại mật khẩu",
        action_url=url,
        footer_note="Liên kết chỉ dùng một lần và hết hạn sau 1 giờ. Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.",
    )
