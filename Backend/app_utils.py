import hashlib
import json
import os
import re
from datetime import datetime, timedelta, timezone

import jwt
import bcrypt as _bcrypt

EMAIL_REGEX = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"

# ---------------------------------------------------------------------------
# JWT configuration
# ---------------------------------------------------------------------------
JWT_SECRET = os.getenv("JWT_SECRET", "bp-company-dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_ACCESS_EXPIRE_MIN", "1440"))
JWT_REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("JWT_REFRESH_EXPIRE_DAYS", "7"))


def now_iso() -> str:
    return datetime.now().isoformat()


def hash_password(password: str) -> str:
    """Legacy SHA256 hash — kept for backward-compatibility checks."""
    return hashlib.sha256(password.encode()).hexdigest()


def hash_password_bcrypt(password: str) -> str:
    """Secure bcrypt hash for new passwords."""
    return _bcrypt.hashpw(password.encode(), _bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a password against a hash (bcrypt or legacy SHA256)."""
    # Bcrypt hashes always start with $2b$ (or $2a$, $2y$)
    if hashed.startswith(("$2b$", "$2a$", "$2y$")):
        return _bcrypt.checkpw(plain.encode(), hashed.encode())
    # Fallback: legacy SHA256
    return hashlib.sha256(plain.encode()).hexdigest() == hashed


def create_access_token(data: dict, expires_minutes: int | None = None) -> str:
    """Create a signed JWT access token."""
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=expires_minutes or JWT_ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {**data, "exp": expire, "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(data: dict, expires_days: int | None = None) -> str:
    """Create a signed JWT refresh token (longer-lived)."""
    expire = datetime.now(timezone.utc) + timedelta(
        days=expires_days or JWT_REFRESH_TOKEN_EXPIRE_DAYS
    )
    payload = {**data, "exp": expire, "type": "refresh"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_jwt(token: str) -> dict | None:
    """Decode and validate a JWT. Returns payload dict or None on failure."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


# ---------------------------------------------------------------------------
# Role / permission system
# ---------------------------------------------------------------------------
ROLE_PERMISSIONS: dict[str, list[str]] = {
    "admin": [
        "users:read", "users:create", "users:update", "users:delete",
        "opportunities:read", "opportunities:create", "opportunities:update", "opportunities:delete",
        "workflows:read", "workflows:manage",
        "tasks:read", "tasks:create", "tasks:complete", "tasks:assign",
        "bpmn:read", "bpmn:edit",
        "entities:read", "entities:create", "entities:update", "entities:delete",
        "reports:read",
    ],
    "gestor": [
        "users:read",
        "opportunities:read", "opportunities:create", "opportunities:update",
        "workflows:read", "workflows:manage",
        "tasks:read", "tasks:create", "tasks:complete", "tasks:assign",
        "bpmn:read", "bpmn:edit",
        "entities:read", "entities:create", "entities:update",
        "reports:read",
    ],
    "analista": [
        "users:read",
        "opportunities:read", "opportunities:create", "opportunities:update",
        "workflows:read",
        "tasks:read", "tasks:complete",
        "bpmn:read",
        "entities:read",
    ],
    "user": [
        "opportunities:read",
        "workflows:read",
        "tasks:read", "tasks:complete",
        "bpmn:read",
        "entities:read",
    ],
}


def get_role_permissions(role: str) -> list[str]:
    """Return the permission list for a given role."""
    return ROLE_PERMISSIONS.get(role, ROLE_PERMISSIONS["user"])


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
