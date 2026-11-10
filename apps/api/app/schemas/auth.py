from typing import Literal

from pydantic import EmailStr, Field, field_validator

from app.schemas.base import CamelModel


def _normalize_email(value: str) -> str:
    # One account per mailbox regardless of how the address was typed.
    return value.strip().lower()


class _EmailModel(CamelModel):
    @field_validator("email", mode="after", check_fields=False)
    @classmethod
    def _lowercase_email(cls, value: str) -> str:
        return _normalize_email(value)


class RegisterInput(_EmailModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128, description="Минимум 8 символов")
    display_name: str = Field(min_length=2, max_length=40)


class CreateStaffUserInput(_EmailModel):
    """ADMIN-only: create a WRITER/EDITOR/ADMIN account. PLAYER accounts are never created
    here - they go through the public POST /auth/register instead."""

    email: EmailStr
    password: str = Field(min_length=8, max_length=128, description="Минимум 8 символов")
    display_name: str = Field(min_length=2, max_length=40)
    role: Literal["WRITER", "EDITOR", "ADMIN"]


class LoginInput(_EmailModel):
    email: EmailStr
    password: str = Field(min_length=1)


class ChangePasswordInput(CamelModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=128, description="Минимум 8 символов")


class ResetPasswordInput(CamelModel):
    """ADMIN-only: set a new password for a staff account that lost access."""

    new_password: str = Field(min_length=8, max_length=128, description="Минимум 8 символов")


class RefreshTokenInput(CamelModel):
    refresh_token: str = Field(min_length=1)


class CabinetExchangeInput(CamelModel):
    code: str = Field(min_length=1)


class CabinetLinkTokenOut(CamelModel):
    code: str
    expires_in_seconds: int


class PublicUser(CamelModel):
    id: str
    email: str
    display_name: str
    role: str


class TokenPair(CamelModel):
    access_token: str
    refresh_token: str


class AuthResponse(TokenPair):
    user: PublicUser
