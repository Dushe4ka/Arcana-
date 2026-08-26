import hashlib
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    hash_password,
    new_jti,
    verify_password,
)
from app.models.economy import DailyRewardState, Wallet
from app.models.user import PlayerProfile, RefreshToken, User
from app.schemas.auth import (
    AuthResponse,
    LoginInput,
    PublicUser,
    RegisterInput,
    TokenPair,
)

STARTING_ENERGY = 20
STARTING_SOFT_CURRENCY = 100


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _to_public_user(user: User) -> PublicUser:
    return PublicUser(id=str(user.id), email=user.email, role=user.role.value)


async def _issue_token_pair(db: AsyncSession, user: User) -> TokenPair:
    access_token = create_access_token(str(user.id), user.email, user.role.value)

    jti = new_jti()
    refresh_token, expires_at = create_refresh_token(
        str(user.id), user.email, user.role.value, jti
    )

    db.add(
        RefreshToken(
            id=jti,
            user_id=user.id,
            token_hash=_hash_token(refresh_token),
            expires_at=expires_at,
        )
    )
    await db.commit()

    return TokenPair(access_token=access_token, refresh_token=refresh_token)


async def register(db: AsyncSession, data: RegisterInput) -> AuthResponse:
    existing = await db.scalar(select(User).where(User.email == data.email))
    if existing:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Пользователь с таким email уже зарегистрирован"
        )

    user = User(email=data.email, password_hash=hash_password(data.password))
    db.add(user)
    await db.flush()

    db.add(PlayerProfile(user_id=user.id, display_name=data.display_name))
    db.add(Wallet(user_id=user.id, soft=STARTING_SOFT_CURRENCY, energy=STARTING_ENERGY))
    db.add(DailyRewardState(user_id=user.id))
    await db.commit()

    tokens = await _issue_token_pair(db, user)
    return AuthResponse(user=_to_public_user(user), **tokens.model_dump())


async def login(db: AsyncSession, data: LoginInput) -> AuthResponse:
    user = await db.scalar(select(User).where(User.email == data.email))
    if not user or not verify_password(user.password_hash, data.password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Неверный email или пароль")

    tokens = await _issue_token_pair(db, user)
    return AuthResponse(user=_to_public_user(user), **tokens.model_dump())


async def refresh(db: AsyncSession, refresh_token: str) -> TokenPair:
    payload = decode_refresh_token(refresh_token)
    if payload is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Недействительный refresh-токен"
        )

    stored = await db.get(RefreshToken, payload["jti"])
    token_hash = _hash_token(refresh_token)
    now = datetime.now(UTC)
    if (
        not stored
        or stored.revoked_at is not None
        or stored.expires_at < now
        or stored.token_hash != token_hash
    ):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Refresh-токен отозван или истёк"
        )

    # Rotate: revoke the used token and issue a fresh pair.
    stored.revoked_at = now
    await db.commit()

    user = await db.get(User, payload["sub"])
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Пользователь не найден")
    return await _issue_token_pair(db, user)


async def logout(db: AsyncSession, refresh_token: str) -> None:
    payload = decode_refresh_token(refresh_token)
    if payload is None:
        return  # Already invalid/expired - nothing to revoke, logout is idempotent either way.

    stored = await db.get(RefreshToken, payload["jti"])
    if stored and stored.revoked_at is None:
        stored.revoked_at = datetime.now(UTC)
        await db.commit()


async def me(db: AsyncSession, user_id: str) -> PublicUser:
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Пользователь не найден")
    return _to_public_user(user)
