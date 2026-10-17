"""
dependencies.py — Reusable FastAPI dependencies

get_current_user  — extracts the logged-in user from JWT in the request header
require_admin     — same, but also checks the user is an admin
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from auth_utils import decode_token
from database import fetch_one

# FastAPI reads the "Authorization: Bearer <token>" header automatically
_bearer = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    """
    Validate JWT and return the full user row from the database.
    Raises 401 if the token is missing, invalid, or the user doesn't exist.
    """
    token = credentials.credentials
    user_id = decode_token(token)

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user = fetch_one(
        "SELECT * FROM users WHERE id = %s AND is_active = 1",
        (user_id,),
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    return user


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """Same as get_current_user but also enforces admin role."""
    if user["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user
