from datetime import datetime, timedelta, timezone
from typing import Any

import secrets
import string
import base64
import hashlib

import jwt
from passlib.context import CryptContext
from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


ALGORITHM = "HS256"


def create_access_token(
    subject: str | Any,
    expires_delta: timedelta,
    token_use: str = "access",
    extra_claims: dict[str, Any] | None = None,
) -> str:
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode = {"exp": expire, "sub": str(subject), "token_use": token_use}
    if extra_claims:
        to_encode.update(extra_claims)
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def generate_random_password() -> str:
    alphabet = string.ascii_letters + string.digits + string.punctuation
    return ''.join(secrets.choice(alphabet) for _ in range(12))


def _derive_default_password_key(secret: str) -> bytes:
    digest = hashlib.sha256(secret.encode()).digest()
    return base64.urlsafe_b64encode(digest)


def _get_default_password_fernet() -> Fernet:
    key = settings.DEFAULT_PASSWORD_ENCRYPTION_KEY
    if key:
        return Fernet(key.encode())
    return Fernet(_derive_default_password_key(settings.SECRET_KEY))


def encrypt_default_password(value: str) -> str:
    fernet = _get_default_password_fernet()
    return fernet.encrypt(value.encode()).decode()


def decrypt_default_password(token: str) -> str | None:
    fernet = _get_default_password_fernet()
    try:
        return fernet.decrypt(token.encode()).decode()
    except InvalidToken:
        return None
