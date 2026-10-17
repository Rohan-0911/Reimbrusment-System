"""
routes/auth.py — Login, Signup, and Get Current User

POST /api/auth/signup  → create company + admin account
POST /api/auth/login   → return JWT token
GET  /api/auth/me      → return current user info
"""

import os
import sys
import uuid
import httpx

# Ensure backend root is on sys.path for direct imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from auth_utils import hash_password, verify_password, create_token
from database import fetch_one, execute
from dependencies import get_current_user

router = APIRouter()

# ─── Default categories created for every new company ─────────
DEFAULT_CATEGORIES = [
    "Travel",
    "Accommodation",
    "Meals & Entertainment",
    "Office Supplies",
    "Software & Subscriptions",
    "Training & Education",
    "Marketing",
    "Miscellaneous",
]


# ─── Pydantic models (request body shapes) ────────────────────

class SignupRequest(BaseModel):
    companyName: str
    country: str
    adminName: str
    adminEmail: str
    adminPassword: str


class LoginRequest(BaseModel):
    email: str
    password: str


# ─── Helper: get currency for a country ───────────────────────

COUNTRY_CURRENCY_MAP = {
    "india": ("INR", "₹"),
    "in": ("INR", "₹"),
    "bharat": ("INR", "₹"),
    "united states": ("USD", "$"),
    "usa": ("USD", "$"),
    "us": ("USD", "$"),
    "united kingdom": ("GBP", "£"),
    "uk": ("GBP", "£"),
    "european union": ("EUR", "€"),
    "germany": ("EUR", "€"),
    "france": ("EUR", "€"),
    "japan": ("JPY", "¥"),
    "united arab emirates": ("AED", "AED"),
    "uae": ("AED", "AED"),
    "dubai": ("AED", "AED"),
    "singapore": ("SGD", "S$"),
    "canada": ("CAD", "CA$"),
    "australia": ("AUD", "A$"),
}

async def get_currency_for_country(country_name: str) -> tuple[str, str]:
    """
    Find the base currency code and symbol for a country.
    Defaults and falls back to INR (₹) for India.
    """
    normalized = (country_name or "").strip().lower()
    if not normalized or normalized in COUNTRY_CURRENCY_MAP:
        return COUNTRY_CURRENCY_MAP.get(normalized, ("INR", "₹"))

    try:
        url = f"https://restcountries.com/v3.1/name/{country_name}?fields=currencies"
        async with httpx.AsyncClient(timeout=5) as client:
            res = await client.get(url)
            data = res.json()
            currencies = data[0].get("currencies", {})
            code = list(currencies.keys())[0]
            symbol = currencies[code].get("symbol", code)
            return code, symbol
    except Exception:
        return "INR", "₹"          # Default fallback for base ledger


# ─── Routes ───────────────────────────────────────────────────

@router.post("/signup", status_code=201)
async def signup(body: SignupRequest):
    """
    Create a new company and its first admin user.
    Also seeds the default expense categories.
    """
    # Check email not already used
    existing = fetch_one("SELECT id FROM users WHERE email = %s", (body.adminEmail,))
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    # Get currency from country name
    currency_code, currency_symbol = await get_currency_for_country(body.country)

    # Create company
    company_id = str(uuid.uuid4())
    execute(
        "INSERT INTO companies (id, name, country, currency_code, currency_symbol) VALUES (%s,%s,%s,%s,%s)",
        (company_id, body.companyName, body.country, currency_code, currency_symbol),
    )

    # Create admin user
    admin_id = str(uuid.uuid4())
    password_hash = hash_password(body.adminPassword)
    execute(
        "INSERT INTO users (id, company_id, name, email, password_hash, role) VALUES (%s,%s,%s,%s,%s,'admin')",
        (admin_id, company_id, body.adminName, body.adminEmail, password_hash),
    )

    # Seed default categories
    for cat_name in DEFAULT_CATEGORIES:
        execute(
            "INSERT INTO expense_categories (id, company_id, name) VALUES (%s,%s,%s)",
            (str(uuid.uuid4()), company_id, cat_name),
        )

    # Return token + user + company (same shape as login)
    token = create_token(admin_id)
    user = fetch_one(
        "SELECT id, name, email, role, company_id, is_active, created_at FROM users WHERE id = %s",
        (admin_id,),
    )
    company = fetch_one("SELECT * FROM companies WHERE id = %s", (company_id,))

    return {"token": token, "user": user, "company": company}


@router.post("/login")
async def login(body: LoginRequest):
    """Check credentials and return a JWT token."""
    user = fetch_one(
        "SELECT * FROM users WHERE email = %s AND is_active = 1",
        (body.email,),
    )
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    company = fetch_one("SELECT * FROM companies WHERE id = %s", (user["company_id"],))
    token = create_token(user["id"])

    # Remove password hash before sending to frontend
    safe_user = {k: v for k, v in user.items() if k != "password_hash"}
    return {"token": token, "user": safe_user, "company": company}


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    """Return the currently logged-in user's details."""
    company = fetch_one("SELECT * FROM companies WHERE id = %s", (user["company_id"],))
    safe_user = {k: v for k, v in user.items() if k != "password_hash"}
    return {"user": safe_user, "company": company}
