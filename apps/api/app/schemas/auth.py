from pydantic import EmailStr, Field

from app.schemas.base import CamelModel


class RegisterInput(CamelModel):
    email: EmailStr
    password: str = Field(min_length=8, description="Минимум 8 символов")
    display_name: str = Field(min_length=2, max_length=40)


class LoginInput(CamelModel):
    email: EmailStr
    password: str = Field(min_length=1)


class RefreshTokenInput(CamelModel):
    refresh_token: str = Field(min_length=1)


class PublicUser(CamelModel):
    id: str
    email: str
    role: str


class TokenPair(CamelModel):
    access_token: str
    refresh_token: str


class AuthResponse(TokenPair):
    user: PublicUser
