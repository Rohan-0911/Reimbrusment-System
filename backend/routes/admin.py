"""
routes/admin.py — Admin-only endpoints

GET  /api/admin/users        → list all users in the company
POST /api/admin/users        → create a new user
PUT  /api/admin/users/{id}   → update user role or active status
GET  /api/admin/stats        → company-wide analytics
"""

import os
import sys
import uuid

# Ensure backend root is on sys.path for direct imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from auth_utils import hash_password
from database import fetch_all, fetch_one, execute
from dependencies import require_admin       # only admins can use these routes

router = APIRouter()


# ─── Pydantic models ──────────────────────────────────────────

class CreateUserRequest(BaseModel):
    name:     str
    email:    str
    password: str
    role:     str               # "admin" or "employee"


class UpdateUserRequest(BaseModel):
    role:      Optional[str] = None
    is_active: Optional[int] = None


# ─── Routes ───────────────────────────────────────────────────

@router.get("/users")
def list_users(admin: dict = Depends(require_admin)):
    """Return all users in this company."""
    return fetch_all(
        "SELECT id, name, email, role, is_active, created_at "
        "FROM users WHERE company_id = %s ORDER BY created_at DESC",
        (admin["company_id"],),
    )


@router.post("/users", status_code=201)
async def create_user(body: CreateUserRequest, admin: dict = Depends(require_admin)):
    """Create a new user in the company. Admin only."""

    # Validate role — our app only uses admin and employee
    valid_roles = ["admin", "employee"]
    if body.role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Role must be one of: {valid_roles}")

    # Check email uniqueness
    existing = fetch_one("SELECT id FROM users WHERE email = %s", (body.email,))
    if existing:
        raise HTTPException(status_code=409, detail="Email already exists")

    user_id       = str(uuid.uuid4())
    password_hash = hash_password(body.password)

    execute(
        "INSERT INTO users (id, company_id, name, email, password_hash, role) "
        "VALUES (%s, %s, %s, %s, %s, %s)",
        (user_id, admin["company_id"], body.name, body.email, password_hash, body.role),
    )

    new_user = fetch_one(
        "SELECT id, name, email, role, is_active, created_at FROM users WHERE id = %s",
        (user_id,),
    )
    return new_user


@router.put("/users/{user_id}")
def update_user(
    user_id: str,
    body: UpdateUserRequest,
    admin: dict = Depends(require_admin),
):
    """Update a user's role or active/inactive status."""

    # Make sure the user belongs to the same company
    target = fetch_one(
        "SELECT * FROM users WHERE id = %s AND company_id = %s",
        (user_id, admin["company_id"]),
    )
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Use existing values if not provided in the request
    new_role      = body.role      if body.role      is not None else target["role"]
    new_is_active = body.is_active if body.is_active is not None else target["is_active"]

    # Validate the new role
    if new_role not in ["admin", "employee"]:
        raise HTTPException(status_code=400, detail="Invalid role")

    execute(
        "UPDATE users SET role = %s, is_active = %s WHERE id = %s",
        (new_role, new_is_active, user_id),
    )

    return {"message": "User updated successfully"}


@router.get("/stats")
def company_stats(admin: dict = Depends(require_admin)):
    """Company-wide analytics for the admin dashboard."""
    company_id = admin["company_id"]

    company = fetch_one(
        "SELECT * FROM companies WHERE id = %s",
        (company_id,),
    )

    user_count = fetch_one(
        "SELECT COUNT(*) AS count FROM users WHERE company_id = %s",
        (company_id,),
    )

    # Total expenses grouped by status
    expense_stats = fetch_all(
        "SELECT status, COUNT(*) AS count, COALESCE(SUM(amount),0) AS total "
        "FROM expenses WHERE company_id = %s GROUP BY status",
        (company_id,),
    )

    # Top 5 spenders
    top_spenders = fetch_all(
        "SELECT u.name, u.role, COUNT(*) AS count, COALESCE(SUM(e.amount),0) AS total "
        "FROM expenses e JOIN users u ON e.submitted_by = u.id "
        "WHERE e.company_id = %s GROUP BY u.id ORDER BY total DESC LIMIT 5",
        (company_id,),
    )

    return {
        "company":      company,
        "userCount":    user_count,
        "expenseStats": expense_stats,
        "topSpenders":  top_spenders,
    }
