import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from jose import JWTError, jwt

from app.config import settings

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def create_access_token(user_id: str, email: str, role: str) -> str:
    expire = datetime.now(UTC) + timedelta(
        minutes=settings.jwt_access_ttl_minutes
    )
    payload = {"sub": user_id, "email": email, "role": role, "exp": expire}
    return jwt.encode(payload, settings.jwt_access_secret, algorithm="HS256")


def create_refresh_token(
    user_id: str, email: str, role: str, jti: str
) -> tuple[str, datetime]:
    expire = datetime.now(UTC) + timedelta(days=settings.jwt_refresh_ttl_days)
    payload = {"sub": user_id, "email": email, "role": role, "jti": jti, "exp": expire}
    token = jwt.encode(payload, settings.jwt_refresh_secret, algorithm="HS256")
    return token, expire


def decode_access_token(token: str) -> dict[str, Any] | None:
    try:
        return jwt.decode(token, settings.jwt_access_secret, algorithms=["HS256"])
    except JWTError:
        return None


def decode_refresh_token(token: str) -> dict[str, Any] | None:
    try:
        return jwt.decode(token, settings.jwt_refresh_secret, algorithms=["HS256"])
    except JWTError:
        return None


def new_jti() -> str:
    return str(uuid.uuid4())
