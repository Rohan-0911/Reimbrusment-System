"""
auth_utils.py — Password hashing and JWT token helpers

Two simple jobs:
  1. Hash / verify passwords using bcrypt
  2. Create / decode JWT tokens for user sessions
"""

import os
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
import bcrypt
from jose import jwt, JWTError

load_dotenv()

# ─── Password hashing ─────────────────────────────────────────
def hash_password(plain: str) -> str:
    """Turn a plain-text password into a secure bcrypt hash."""
    pwd_bytes = plain.encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Check if a plain password matches the stored bcrypt hash."""
    try:
        pwd_bytes = plain.encode("utf-8")[:72]
        hash_bytes = hashed.encode("utf-8")
        return bcrypt.checkpw(pwd_bytes, hash_bytes)
    except Exception:
        return False


# ─── JWT tokens ──────────────────────────────────────────────
SECRET_KEY = os.getenv("SECRET_KEY", "change-me")
ALGORITHM  = "HS256"
TOKEN_EXPIRE_DAYS = 7          # token valid for 7 days


def create_token(user_id: str) -> str:
    """Create a JWT that contains the user's ID and an expiry."""
    expire = datetime.now(timezone.utc) + timedelta(days=TOKEN_EXPIRE_DAYS)
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> str | None:
    """
    Decode a JWT and return the user_id (sub).
    Returns None if the token is invalid or expired.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None
