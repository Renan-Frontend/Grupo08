import hashlib
import json
import os
import re
from datetime import datetime

EMAIL_REGEX = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


def now_iso() -> str:
    return datetime.now().isoformat()


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def is_valid_email(email: str) -> bool:
    return bool(re.match(EMAIL_REGEX, email))


def paginated_users_response(data: list, total: int, page: int, limit: int) -> dict:
    start = (page - 1) * limit
    end = start + limit
    return {
        "data": data,
        "total": total,
        "page": page,
        "limit": limit,
        "has_next": end < total,
        "has_prev": start > 0,
    }


def load_json(filename: str, default):
    if os.path.exists(filename):
        try:
            with open(filename, "r", encoding="utf-8") as file:
                return json.load(file)
        except Exception:
            return default
    return default


def save_json(filename: str, data) -> None:
    with open(filename, "w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)
