from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass
class AuthenticatedUser:
    user_id: str
    email: str
    role: str


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthenticatedUser:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Не авторизован")

    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Недействительный или истёкший токен")

    return AuthenticatedUser(
        user_id=payload["sub"], email=payload["email"], role=payload["role"]
    )


def require_roles(*roles: str):
    async def checker(
        user: AuthenticatedUser = Depends(get_current_user),
    ) -> AuthenticatedUser:
        if user.role not in roles:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, "Недостаточно прав для этого действия")
        return user

    return checker
