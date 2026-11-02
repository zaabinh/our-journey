import getpass
import json
import urllib.error
import urllib.request
from dotenv import load_dotenv
import os

load_dotenv()
api_key = os.getenv("OJ_RESEND_API_KEY")
recipient = "your_email_here"

sender = os.getenv("OJ_SMTP_FROM")
display_name = os.getenv("OJ_SMTP_USERNAME")
host = os.getenv("OJ_SMTP_HOST")

payload = {
    "from": f"{display_name} <{sender}@{host}>",
    "to": [recipient],
    "subject": f"[Local test] Email từ {display_name}",
    "html": (
        f"<h2>Xin chào từ {display_name}!</h2>"
        "<p>Email thử nghiệm được gửi từ máy local qua Resend.</p>"
    ),
    "text": f"Email thử nghiệm từ {display_name}, gửi qua Resend.",
}

request = urllib.request.Request(
    "https://api.resend.com/emails",
    data=json.dumps(payload).encode("utf-8"),
    headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "LocalEmailTest/1.0",
    },
    method="POST",
)

try:
    with urllib.request.urlopen(request, timeout=30) as response:
        result = json.loads(response.read().decode("utf-8"))
        print("Resend đã tiếp nhận yêu cầu. Email ID:", result["id"])
except urllib.error.HTTPError as error:
    print("HTTP:", error.code)
    print(error.read().decode("utf-8"))
except urllib.error.URLError as error:
    print("Không kết nối được Resend:", error.reason)