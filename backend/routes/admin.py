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
    for r in expense_stats:
        r["total"] = float(r["total"])

    # Monthly expenditure trend (last 12 active months)
    monthly_trend = fetch_all(
        """SELECT SUBSTRING(expense_date, 1, 7) AS month,
                  COUNT(*) AS count,
                  COALESCE(SUM(amount), 0) AS total,
                  COALESCE(SUM(CASE WHEN status IN ('approved', 'paid') THEN amount ELSE 0 END), 0) AS approved_total
           FROM expenses
           WHERE company_id = %s AND expense_date IS NOT NULL
           GROUP BY month
           ORDER BY month ASC
           LIMIT 12""",
        (company_id,),
    )
    for r in monthly_trend:
        r["total"] = float(r["total"])
        r["approved_total"] = float(r["approved_total"])

    # Category breakdown with total amount and count
    by_category = fetch_all(
        """SELECT ec.name,
                  COUNT(*) AS count,
                  COALESCE(SUM(e.amount), 0) AS total,
                  COALESCE(SUM(CASE WHEN e.status IN ('approved', 'paid') THEN e.amount ELSE 0 END), 0) AS approved_total
           FROM expenses e
           JOIN expense_categories ec ON e.category_id = ec.id
           WHERE e.company_id = %s
           GROUP BY ec.name
           ORDER BY total DESC""",
        (company_id,),
    )
    for r in by_category:
        r["total"] = float(r["total"])
        r["approved_total"] = float(r["approved_total"])

    # AI Audit, Authenticity & Fraud Risk Compliance stats
    compliance_stats = fetch_one(
        """SELECT
             COUNT(CASE WHEN ai_authenticity_status = 'AUTHENTIC' OR (ai_authenticity_score >= 80 AND (is_duplicate = 0 OR is_duplicate IS NULL)) THEN 1 END) AS authentic_count,
             COUNT(CASE WHEN is_duplicate = 1 OR duplicate_of IS NOT NULL THEN 1 END) AS duplicate_count,
             COUNT(CASE WHEN ai_authenticity_status = 'SUSPICIOUS' OR (ai_authenticity_score < 80 AND ai_authenticity_score IS NOT NULL) THEN 1 END) AS suspicious_count,
             COALESCE(ROUND(AVG(CASE WHEN ai_authenticity_score IS NOT NULL THEN ai_authenticity_score END), 1), 94.0) AS avg_score
           FROM expenses
           WHERE company_id = %s""",
        (company_id,),
    )
    if compliance_stats:
        compliance_stats["avg_score"] = float(compliance_stats["avg_score"] or 94.0)

    # Top 5 spenders — include both approved and paid expenses
    top_spenders = fetch_all(
        """SELECT u.name, u.role, COUNT(*) AS count, COALESCE(SUM(e.amount),0) AS total
           FROM expenses e JOIN users u ON e.submitted_by = u.id
           WHERE e.company_id = %s AND e.status IN ('approved', 'paid')
           GROUP BY u.id ORDER BY total DESC LIMIT 5""",
        (company_id,),
    )
    for r in top_spenders:
        r["total"] = float(r["total"])

    # Employee expense allocation (claimed and approved per employee)
    employee_expenses = fetch_all(
        """SELECT u.id, u.name, u.role,
                  COUNT(e.id) AS claim_count,
                  COALESCE(SUM(e.amount), 0) AS total_amount,
                  COALESCE(SUM(CASE WHEN e.status IN ('approved', 'paid') THEN e.amount ELSE 0 END), 0) AS approved_amount
           FROM users u
           LEFT JOIN expenses e ON u.id = e.submitted_by
           WHERE u.company_id = %s
           GROUP BY u.id, u.name, u.role
           ORDER BY total_amount DESC
           LIMIT 10""",
        (company_id,),
    )
    for r in employee_expenses:
        r["total_amount"] = float(r["total_amount"])
        r["approved_amount"] = float(r["approved_amount"])

    return {
        "company":          company,
        "userCount":        user_count,
        "expenseStats":     expense_stats,
        "topSpenders":      top_spenders,
        "monthlyTrend":     monthly_trend,
        "byCategory":       by_category,
        "complianceStats":  compliance_stats,
        "employeeExpenses": employee_expenses,
    }
