"""
routes/expenses.py — All expense-related endpoints

GET  /api/expenses/dashboard   → summary stats for the current user
GET  /api/expenses/categories  → list categories for the company
GET  /api/expenses/convert     → currency conversion
GET  /api/expenses             → list expenses (own for employee, all for admin)
POST /api/expenses             → submit a new expense (with optional receipt file)
GET  /api/expenses/{id}        → get a single expense + approval info
"""

import uuid
import os
import sys
import shutil
import httpx

# Ensure backend root is on sys.path for direct imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

from database import fetch_all, fetch_one, execute
from dependencies import get_current_user

router = APIRouter()

# Where uploaded receipts are saved
UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)


# ─── Currency conversion helper ───────────────────────────────

async def convert_currency(amount: float, from_cur: str, to_cur: str) -> dict:
    """
    Convert amount from one currency to another.
    Uses open.er-api.com (free, no key needed) as primary source.
    """
    if from_cur == to_cur:
        return {"convertedAmount": amount, "rate": 1.0}

    api_key = os.getenv("EXCHANGE_API_KEY", "")

    # Try paid API first if key is set
    if api_key:
        try:
            url = f"https://v6.exchangerate-api.com/v6/{api_key}/pair/{from_cur}/{to_cur}/{amount}"
            async with httpx.AsyncClient(timeout=5) as client:
                res = await client.get(url)
                data = res.json()
                if data.get("result") == "success":
                    return {
                        "convertedAmount": round(data["conversion_result"], 2),
                        "rate": data["conversion_rate"],
                    }
        except Exception:
            pass

    # Free fallback: open.er-api.com
    try:
        url = f"https://open.er-api.com/v6/latest/{from_cur}"
        async with httpx.AsyncClient(timeout=5) as client:
            res = await client.get(url)
            data = res.json()
            rate = data.get("rates", {}).get(to_cur, 1.0)
            return {"convertedAmount": round(amount * rate, 2), "rate": rate}
    except Exception:
        return {"convertedAmount": amount, "rate": 1.0}


# ─── Routes ───────────────────────────────────────────────────

@router.get("/dashboard")
def dashboard(user: dict = Depends(get_current_user)):
    """
    Return summary numbers for the dashboard.
    Admin  → sees whole company data.
    Employee → sees only their own data.
    """
    company_id = user["company_id"]
    user_id    = user["id"]
    role       = user["role"]

    # Build a WHERE clause depending on role
    if role == "admin":
        where  = "e.company_id = %s"
        params = (company_id,)
    else:
        where  = "e.company_id = %s AND e.submitted_by = %s"
        params = (company_id, user_id)

    # Total claims count (all filed claims) and total approved spend amount
    total = fetch_one(
        f"SELECT COUNT(*) AS count, "
        f"COALESCE(SUM(CASE WHEN e.status = 'approved' THEN e.amount ELSE 0 END), 0) AS total "
        f"FROM expenses e WHERE {where}",
        params,
    )

    by_status = fetch_all(
        f"SELECT status, COUNT(*) AS count, COALESCE(SUM(amount),0) AS total "
        f"FROM expenses e WHERE {where} GROUP BY status",
        params,
    )

    by_category = fetch_all(
        f"SELECT ec.name, "
        f"COUNT(CASE WHEN e.status = 'approved' THEN 1 END) AS count, "
        f"COALESCE(SUM(CASE WHEN e.status = 'approved' THEN e.amount ELSE 0 END), 0) AS total "
        f"FROM expenses e "
        f"JOIN expense_categories ec ON e.category_id = ec.id "
        f"WHERE {where} AND e.status = 'approved' "
        f"GROUP BY ec.name ORDER BY total DESC",
        params,
    )

    # 5 most recent expenses
    recent = fetch_all(
        f"SELECT e.*, u.name AS submitter_name, ec.name AS category_name "
        f"FROM expenses e "
        f"JOIN users u  ON e.submitted_by = u.id "
        f"JOIN expense_categories ec ON e.category_id = ec.id "
        f"WHERE {where} ORDER BY e.created_at DESC LIMIT 5",
        params,
    )

    # Top spenders (admin only) — ONLY include approved expenses
    top_spenders = []
    if role == "admin":
        top_spenders = fetch_all(
            "SELECT u.name, u.role, COUNT(*) AS count, COALESCE(SUM(e.amount),0) AS total "
            "FROM expenses e JOIN users u ON e.submitted_by = u.id "
            "WHERE e.company_id = %s AND e.status = 'approved' "
            "GROUP BY u.id ORDER BY total DESC LIMIT 5",
            (company_id,),
        )

    return {
        "total":       total,
        "byStatus":    by_status,
        "byCategory":  by_category,
        "recent":      recent,
        "topSpenders": top_spenders,
    }


@router.get("/categories")
def get_categories(user: dict = Depends(get_current_user)):
    """Return all expense categories for the user's company."""
    return fetch_all(
        "SELECT * FROM expense_categories WHERE company_id = %s ORDER BY name",
        (user["company_id"],),
    )


@router.get("/convert")
async def convert(
    request: Request,
    amount: float,
    to: str,
    user: dict = Depends(get_current_user),
):
    """
    Convert an amount between currencies.
    Usage: GET /api/expenses/convert?amount=100&from=USD&to=INR
    Note: 'from' is a Python keyword so we read it from the raw query params.
    """
    from_cur = request.query_params.get("from", "INR")
    return await convert_currency(amount, from_cur, to)


@router.get("")
def list_expenses(user: dict = Depends(get_current_user)):
    """
    Admin → all company expenses.
    Employee → only their own expenses.
    """
    if user["role"] == "admin":
        rows = fetch_all(
            "SELECT e.*, u.name AS submitter_name, ec.name AS category_name "
            "FROM expenses e "
            "JOIN users u  ON e.submitted_by = u.id "
            "JOIN expense_categories ec ON e.category_id = ec.id "
            "WHERE e.company_id = %s ORDER BY e.created_at DESC",
            (user["company_id"],),
        )
    else:
        rows = fetch_all(
            "SELECT e.*, u.name AS submitter_name, ec.name AS category_name "
            "FROM expenses e "
            "JOIN users u  ON e.submitted_by = u.id "
            "JOIN expense_categories ec ON e.category_id = ec.id "
            "WHERE e.submitted_by = %s ORDER BY e.created_at DESC",
            (user["id"],),
        )
    return rows


@router.post("", status_code=201)
async def create_expense(
    # Form fields (because we also accept a file)
    amount:       str = Form(...),
    currency:     str = Form(...),
    category_id:  str = Form(...),
    description:  str = Form(...),
    expense_date: str = Form(...),
    receipt:      Optional[UploadFile] = File(None),
    user: dict = Depends(get_current_user),
):
    """Submit a new expense. Receipt upload is optional."""

    company = fetch_one("SELECT * FROM companies WHERE id = %s", (user["company_id"],))
    if not company:
        raise HTTPException(status_code=400, detail="Company not found")

    # Convert currency to company base currency
    original_amount = float(amount)
    from_currency   = currency or company["currency_code"]
    converted       = await convert_currency(original_amount, from_currency, company["currency_code"])
    base_amount     = converted["convertedAmount"]

    # Save receipt file if provided
    receipt_path = None
    if receipt and receipt.filename:
        ext          = os.path.splitext(receipt.filename)[1]
        filename     = f"{uuid.uuid4()}{ext}"
        file_path    = os.path.join(UPLOADS_DIR, filename)
        with open(file_path, "wb") as f:
            shutil.copyfileobj(receipt.file, f)
        receipt_path = f"uploads/{filename}"

    # Insert the expense
    expense_id = str(uuid.uuid4())
    execute(
        """INSERT INTO expenses
           (id, company_id, submitted_by, amount, original_amount, original_currency,
            base_currency, category_id, description, expense_date, receipt_path, status)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'in_review')""",
        (
            expense_id, user["company_id"], user["id"],
            base_amount, original_amount, from_currency,
            company["currency_code"], category_id, description, expense_date,
            receipt_path,
        ),
    )

    # Auto-create approval request
    ar_id = str(uuid.uuid4())
    execute(
        "INSERT INTO approval_requests (id, expense_id, status) VALUES (%s,%s,'pending')",
        (ar_id, expense_id),
    )

    expense = fetch_one("SELECT * FROM expenses WHERE id = %s", (expense_id,))
    return expense


@router.get("/{expense_id}")
def get_expense(expense_id: str, user: dict = Depends(get_current_user)):
    """Return a single expense with its approval request and votes."""
    expense = fetch_one(
        "SELECT e.*, u.name AS submitter_name, ec.name AS category_name "
        "FROM expenses e "
        "JOIN users u  ON e.submitted_by = u.id "
        "JOIN expense_categories ec ON e.category_id = ec.id "
        "WHERE e.id = %s",
        (expense_id,),
    )

    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    # Only allow access to expenses in the same company
    if expense["company_id"] != user["company_id"]:
        raise HTTPException(status_code=403, detail="Forbidden")

    # Employee can only see their own expenses
    if user["role"] == "employee" and expense["submitted_by"] != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")

    approval = fetch_one(
        "SELECT * FROM approval_requests WHERE expense_id = %s",
        (expense_id,),
    )

    votes = []
    if approval:
        votes = fetch_all(
            "SELECT av.*, u.name AS approver_name "
            "FROM approval_votes av JOIN users u ON av.approver_id = u.id "
            "WHERE av.approval_request_id = %s",
            (approval["id"],),
        )

    return {"expense": expense, "approvalRequest": approval, "votes": votes}



class VoteRequest(BaseModel):
    vote: str               # "approve" or "reject"
    comment: Optional[str] = None


@router.post("/{expense_id}/vote")
def vote_expense(
    expense_id: str,
    body: VoteRequest,
    user: dict = Depends(get_current_user),
):
    """
    Admin votes to approve or reject an expense.
    """
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can approve or reject expenses")

    expense = fetch_one(
        "SELECT * FROM expenses WHERE id = %s AND company_id = %s",
        (expense_id, user["company_id"]),
    )
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    approval = fetch_one(
        "SELECT * FROM approval_requests WHERE expense_id = %s",
        (expense_id,),
    )
    if not approval:
        ar_id = str(uuid.uuid4())
        execute("INSERT INTO approval_requests (id, expense_id, status) VALUES (%s, %s, 'pending')", (ar_id, expense_id))
        approval = {"id": ar_id}

    vote_val = body.vote.lower().strip()
    if vote_val not in ["approve", "reject"]:
        raise HTTPException(status_code=400, detail="Vote must be 'approve' or 'reject'")

    new_status = "approved" if vote_val == "approve" else "rejected"

    # Insert vote record
    vote_id = str(uuid.uuid4())
    execute(
        "INSERT INTO approval_votes (id, approval_request_id, approver_id, vote, comment) VALUES (%s, %s, %s, %s, %s)",
        (vote_id, approval["id"], user["id"], vote_val, body.comment or ""),
    )

    # Update status in both tables
    execute("UPDATE approval_requests SET status = %s WHERE id = %s", (new_status, approval["id"]))
    execute("UPDATE expenses SET status = %s WHERE id = %s", (new_status, expense_id))

    return {
        "message": f"Expense successfully {new_status}",
        "status": new_status,
        "expense_id": expense_id,
    }


@router.post("/{expense_id}/approve")
def approve_expense(expense_id: str, user: dict = Depends(get_current_user)):
    """Convenience endpoint to approve directly."""
    return vote_expense(expense_id, VoteRequest(vote="approve"), user)


@router.post("/{expense_id}/reject")
def reject_expense(expense_id: str, user: dict = Depends(get_current_user)):
    """Convenience endpoint to reject directly."""
    return vote_expense(expense_id, VoteRequest(vote="reject"), user)
