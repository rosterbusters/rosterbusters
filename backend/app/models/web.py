"""
Shared web schemas.

- Token/TokenPayload: JWT authentication
- UpdatePassword / NewPassword: password change schemas
- Message: generic API response
"""

from sqlmodel import Field, SQLModel


class UpdatePassword(SQLModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


# Generic message
class Message(SQLModel):
    message: str


# JSON payload containing access token
class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"


# Contents of JWT token
class TokenPayload(SQLModel):
    sub: str | None = None
    token_use: str = "access"


class LoginAccessTokenResponse(SQLModel):
    access_token: str | None = None
    token_type: str = "bearer"
    must_change_password: bool = False
    two_factor_required: bool = False
    two_factor_token: str | None = None


class LoginEmail2FAVerify(SQLModel):
    two_factor_token: str
    code: str = Field(min_length=6, max_length=6)


class LoginEmail2FAResend(SQLModel):
    two_factor_token: str


class NewPassword(SQLModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)
