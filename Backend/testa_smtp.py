import requests
import os

# Configurações do Mailgun
MAILGUN_API_KEY = os.getenv("MAILGUN_API_KEY", "")
MAILGUN_DOMAIN = os.getenv("MAILGUN_DOMAIN", "")

FROM = f"Mailgun Sandbox <postmaster@{MAILGUN_DOMAIN}>"
TO = os.getenv("MAILGUN_TEST_TO", "you@example.com")
SUBJECT = "Mailgun test"
BODY = "This is a Mailgun test message."

print(f"[DEBUG] MAILGUN_DOMAIN={MAILGUN_DOMAIN}")

if not MAILGUN_API_KEY or not MAILGUN_DOMAIN:
    raise RuntimeError("Configure MAILGUN_API_KEY e MAILGUN_DOMAIN antes de executar")

try:
    response = requests.post(
        f"https://api.mailgun.net/v3/{MAILGUN_DOMAIN}/messages",
        auth=("api", MAILGUN_API_KEY),
        data={
            "from": FROM,
            "to": TO,
            "subject": SUBJECT,
            "text": BODY
        }
    )
    response.raise_for_status()
    print(f"[DEBUG] Email enviado para: {TO}")
    print(f"[DEBUG] Resposta Mailgun: {response.text}")
except Exception as e:
    import traceback
    print(f"[ERRO] Falha ao enviar email: {e}")
    traceback.print_exc()
