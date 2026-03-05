import os
import requests


def send_simple_message():
    mailgun_domain = os.getenv("MAILGUN_DOMAIN", "")
    mailgun_api_key = os.getenv("MAILGUN_API_KEY", "")
    if not mailgun_domain or not mailgun_api_key:
        raise RuntimeError("Configure MAILGUN_DOMAIN e MAILGUN_API_KEY no ambiente")

    response = requests.post(
        f"https://api.mailgun.net/v3/{mailgun_domain}/messages",
        auth=("api", mailgun_api_key),
        data={
            "from": f"Mailgun Sandbox <postmaster@{mailgun_domain}>",
            "to": os.getenv("MAILGUN_TEST_TO", "you@example.com"),
            "subject": "Mailgun test",
            "text": "This is a Mailgun test message."
        }
    )
    print(response.status_code, response.text)

send_simple_message()