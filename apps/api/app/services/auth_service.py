import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import rate_limit
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    hash_password,
    new_jti,
    verify_password,
)
from app.models.economy import DailyRewardState, Wallet
from app.models.enums import UserRole
from app.models.user import CabinetLinkToken, PlayerProfile, RefreshToken, User
from app.schemas.auth import (
    AuthResponse,
    ChangePasswordInput,
    CreateStaffUserInput,
    LoginInput,
    PublicUser,
    RegisterInput,
    TokenPair,
)

STARTING_ENERGY = 20
STARTING_SOFT_CURRENCY = 100
CABINET_LINK_TOKEN_TTL_SECONDS = 60


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _to_public_user(user: User, display_name: str) -> PublicUser:
    return PublicUser(
        id=str(user.id),
        email=user.email,
        display_name=display_name,
        role=user.role.value,
    )


async def _get_display_name(db: AsyncSession, user_id) -> str:
    profile = await db.scalar(select(PlayerProfile).where(PlayerProfile.user_id == user_id))
    return profile.display_name if profile else ""


async def _issue_token_pair(db: AsyncSession, user: User) -> TokenPair:
    access_token = create_access_token(str(user.id), user.email, user.role.value)

    jti = new_jti()
    refresh_token, expires_at = create_refresh_token(str(user.id), user.email, user.role.value, jti)

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


async def create_cabinet_link_token(db: AsyncSession, user_id: str) -> str:
    now = datetime.now(UTC)
    await db.execute(delete(CabinetLinkToken).where(CabinetLinkToken.expires_at < now))
    code = secrets.token_urlsafe(32)
    expires_at = now + timedelta(seconds=CABINET_LINK_TOKEN_TTL_SECONDS)
    db.add(
        CabinetLinkToken(
            user_id=user_id,
            token_hash=_hash_token(code),
            expires_at=expires_at,
        )
    )
    await db.commit()
    return code


async def exchange_cabinet_link_token(db: AsyncSession, code: str) -> AuthResponse:
    token_hash = _hash_token(code)
    stored = await db.scalar(
        select(CabinetLinkToken).where(CabinetLinkToken.token_hash == token_hash).with_for_update()
    )
    now = datetime.now(UTC)
    if not stored or stored.used_at is not None or stored.expires_at < now:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Ссылка недействительна или уже использована")

    stored.used_at = now
    await db.commit()

    user = await db.get(User, stored.user_id)
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Пользователь не найден")

    display_name = await _get_display_name(db, user.id)
    tokens = await _issue_token_pair(db, user)
    return AuthResponse(user=_to_public_user(user, display_name), **tokens.model_dump())


async def register(db: AsyncSession, data: RegisterInput) -> AuthResponse:
    existing = await _find_user_by_email(db, data.email)
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Пользователь с таким email уже зарегистрирован")

    user = User(email=data.email, password_hash=hash_password(data.password))
    db.add(user)
    await db.flush()

    db.add(PlayerProfile(user_id=user.id, display_name=data.display_name))
    db.add(Wallet(user_id=user.id, soft=STARTING_SOFT_CURRENCY, energy=STARTING_ENERGY))
    db.add(DailyRewardState(user_id=user.id))
    await db.commit()

    tokens = await _issue_token_pair(db, user)
    return AuthResponse(user=_to_public_user(user, data.display_name), **tokens.model_dump())


async def create_staff_user(db: AsyncSession, data: CreateStaffUserInput) -> PublicUser:
    """ADMIN-only account creation for WRITER/EDITOR/ADMIN staff - the admin panel's "create
    employee" screen. Gives the new account the same profile/wallet/daily-reward rows every
    user gets (mirrors register() and seed.py's seed_admin_user) so nothing downstream has to
    special-case a walletless account; staff simply never use the wallet-facing endpoints."""
    existing = await _find_user_by_email(db, data.email)
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Пользователь с таким email уже зарегистрирован")

    user = User(email=data.email, password_hash=hash_password(data.password), role=UserRole(data.role))
    db.add(user)
    await db.flush()

    db.add(PlayerProfile(user_id=user.id, display_name=data.display_name))
    db.add(Wallet(user_id=user.id))
    db.add(DailyRewardState(user_id=user.id))
    await db.commit()

    return _to_public_user(user, data.display_name)


async def list_staff_users(db: AsyncSession) -> list[PublicUser]:
    """Everyone except PLAYER accounts - the admin panel's employee list. Filtered so this
    stays a short staff roster rather than loading the entire player base."""
    users = await db.scalars(select(User).where(User.role != UserRole.PLAYER))
    result = []
    for user in users:
        display_name = await _get_display_name(db, user.id)
        result.append(_to_public_user(user, display_name))
    return result


async def _find_user_by_email(db: AsyncSession, email: str) -> User | None:
    # Case-insensitive so accounts created before addresses were normalised still match.
    return await db.scalar(select(User).where(func.lower(User.email) == email.lower()))


async def revoke_all_sessions(db: AsyncSession, user_id) -> None:
    """Ends every session of an account by deleting its refresh tokens outright. They are
    deleted rather than marked revoked on purpose: a *revoked* row means "spent by rotation",
    and seeing one again is treated as theft (see refresh) - an old device simply retrying
    after a password change must get a plain 401, not trigger that alarm."""
    await db.execute(delete(RefreshToken).where(RefreshToken.user_id == user_id))


async def login(db: AsyncSession, data: LoginInput, client_ip: str | None = None) -> AuthResponse:
    email_key = data.email.lower()
    ip_key = client_ip or "unknown"
    for limiter, key in ((rate_limit.login_by_email, email_key), (rate_limit.login_by_ip, ip_key)):
        if limiter.is_blocked(key):
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                {
                    "message": "Слишком много попыток входа. Попробуйте позже.",
                    "retryAfterSeconds": limiter.retry_after(key),
                },
            )

    user = await _find_user_by_email(db, data.email)
    if not user or not verify_password(user.password_hash, data.password):
        rate_limit.login_by_email.hit(email_key)
        rate_limit.login_by_ip.hit(ip_key)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Неверный email или пароль")

    rate_limit.login_by_email.reset(email_key)
    display_name = await _get_display_name(db, user.id)
    tokens = await _issue_token_pair(db, user)
    return AuthResponse(user=_to_public_user(user, display_name), **tokens.model_dump())


async def change_password(db: AsyncSession, user_id: str, data: ChangePasswordInput) -> TokenPair:
    """Changing the password signs every other device out: all refresh tokens are revoked
    and the caller gets one fresh pair."""
    user = await db.get(User, user_id)
    if not user or not verify_password(user.password_hash, data.current_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Текущий пароль указан неверно")
    if data.new_password == data.current_password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Новый пароль должен отличаться от текущего")
    user.password_hash = hash_password(data.new_password)
    await revoke_all_sessions(db, user.id)
    await db.commit()
    return await _issue_token_pair(db, user)


async def admin_reset_password(db: AsyncSession, target_user_id: str, new_password: str) -> None:
    """ADMIN resets a staff member's password. Player accounts are out of scope on purpose:
    an admin panel that can take over any player's account is a liability, not a feature."""
    try:
        user = await db.get(User, target_user_id)
    except Exception as exc:  # noqa: BLE001 - malformed uuid
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Сотрудник не найден") from exc
    if not user or user.role == UserRole.PLAYER:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Сотрудник не найден")
    user.password_hash = hash_password(new_password)
    await revoke_all_sessions(db, user.id)
    await db.commit()


async def logout_everywhere(db: AsyncSession, user_id: str) -> None:
    await revoke_all_sessions(db, user_id)
    await db.commit()


async def refresh(db: AsyncSession, refresh_token: str) -> TokenPair:
    payload = decode_refresh_token(refresh_token)
    if payload is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Недействительный refresh-токен")

    stored = await db.scalar(select(RefreshToken).where(RefreshToken.id == payload["jti"]).with_for_update())
    token_hash = _hash_token(refresh_token)
    now = datetime.now(UTC)
    if stored and stored.revoked_at is not None and stored.token_hash == token_hash:
        # A refresh token is single-use. Seeing a spent one again means it was copied:
        # either the thief or the owner is replaying it, and we cannot tell which - so
        # every session of this account ends and the real owner signs in again.
        await revoke_all_sessions(db, stored.user_id)
        await db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Сессия завершена из соображений безопасности")
    if not stored or stored.expires_at < now or stored.token_hash != token_hash:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh-токен отозван или истёк")

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
    display_name = await _get_display_name(db, user.id)
    return _to_public_user(user, display_name)
