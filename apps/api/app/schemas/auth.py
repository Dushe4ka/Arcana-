from typing import Literal

from pydantic import EmailStr, Field

from app.schemas.base import CamelModel


class RegisterInput(CamelModel):
    email: EmailStr
    password: str = Field(min_length=8, description="Минимум 8 символов")
    display_name: str = Field(min_length=2, max_length=40)


class CreateStaffUserInput(CamelModel):
    """ADMIN-only: create a WRITER/EDITOR/ADMIN account. PLAYER accounts are never created
    here - they go through the public POST /auth/register instead."""

    email: EmailStr
    password: str = Field(min_length=8, description="Минимум 8 символов")
    display_name: str = Field(min_length=2, max_length=40)
    role: Literal["WRITER", "EDITOR", "ADMIN"]


class LoginInput(CamelModel):
    email: EmailStr
    password: str = Field(min_length=1)


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
