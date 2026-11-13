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
import json
import hashlib
import csv
import io
from datetime import datetime
import httpx

# Ensure backend root is on sys.path for direct imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

from database import fetch_all, fetch_one, execute
from dependencies import get_current_user

router = APIRouter()

from gemini_service import analyze_receipt

# ─── Where uploaded receipts are saved ─────────────────────────
UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)


# ─── AI Receipt Scanner, Authenticity & Duplicate Detection ───

@router.post("/scan-receipt")
async def scan_receipt(
    receipt: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """
    AI-driven OCR and authenticity evaluation endpoint using Google Gemini API.
    Also computes SHA-256 hash and checks for duplicate receipts across company claims.
    """
    if not receipt or not receipt.filename:
        raise HTTPException(status_code=400, detail="Receipt file is required")

    file_bytes = await receipt.read()
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Receipt exceeds maximum size of 10MB")

    # Compute receipt hash for duplicate detection
    receipt_hash = hashlib.sha256(file_bytes).hexdigest()

    # Run AI analysis
    analysis = await analyze_receipt(file_bytes, receipt.content_type, receipt.filename)
    analysis["receipt_hash"] = receipt_hash

    # Check for duplicate receipts in this company
    company_id = user["company_id"]
    duplicate_expense = fetch_one(
        """SELECT e.id, e.description, e.amount, e.base_currency, e.expense_date, e.created_at, u.name AS submitter_name
           FROM expenses e
           JOIN users u ON e.submitted_by = u.id
           WHERE e.company_id = %s AND e.receipt_hash = %s
           ORDER BY e.created_at DESC LIMIT 1""",
        (company_id, receipt_hash)
    )

    # Check by extracted invoice / tax ID if no exact file hash match
    extracted_tax_id = analysis.get("invoice_or_tax_id")
    if not duplicate_expense and extracted_tax_id and len(str(extracted_tax_id).strip()) >= 4:
        duplicate_expense = fetch_one(
            """SELECT e.id, e.description, e.amount, e.base_currency, e.expense_date, e.created_at, u.name AS submitter_name
               FROM expenses e
               JOIN users u ON e.submitted_by = u.id
               WHERE e.company_id = %s AND e.invoice_or_tax_id = %s
               ORDER BY e.created_at DESC LIMIT 1""",
            (company_id, str(extracted_tax_id).strip())
        )

    if duplicate_expense:
        analysis["is_duplicate"] = True
        analysis["duplicate_of"] = duplicate_expense["id"]
        analysis["duplicate_info"] = {
            "id": duplicate_expense["id"],
            "description": duplicate_expense["description"],
            "amount": float(duplicate_expense["amount"]),
            "currency": duplicate_expense["base_currency"],
            "date": str(duplicate_expense["expense_date"]),
            "submitter": duplicate_expense["submitter_name"],
        }
        # Severely degrade authenticity score & flag as suspicious fraud risk
        analysis["authenticity_score"] = min(int(analysis.get("authenticity_score") or 90), 18)
        analysis["authenticity_status"] = "SUSPICIOUS"
        dup_flag = (
            f"DUPLICATE DETECTED: This voucher is identical to Claim #{duplicate_expense['id'][:8]} "
            f"submitted by {duplicate_expense['submitter_name']} on {duplicate_expense['expense_date']} "
            f"({duplicate_expense['amount']} {duplicate_expense['base_currency']})."
        )
        current_rf = analysis.get("risk_factors") or []
        analysis["risk_factors"] = [dup_flag] + current_rf
        analysis["authenticity_reason"] = (
            f"CRITICAL FRAUD WARNING: Duplicate receipt detected in company records! "
            f"Identical voucher already filed on {duplicate_expense['expense_date']} by {duplicate_expense['submitter_name']}."
        )
    else:
        analysis["is_duplicate"] = False
        analysis["duplicate_of"] = None
        analysis["duplicate_info"] = None

    return analysis


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

    # Total claims count (all filed claims) and total approved spend amount (approved + reimbursed/paid)
    total = fetch_one(
        f"SELECT COUNT(*) AS count, "
        f"COALESCE(SUM(CASE WHEN e.status IN ('approved', 'paid') THEN e.amount ELSE 0 END), 0) AS total "
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
        f"COUNT(CASE WHEN e.status IN ('approved', 'paid') THEN 1 END) AS count, "
        f"COALESCE(SUM(CASE WHEN e.status IN ('approved', 'paid') THEN e.amount ELSE 0 END), 0) AS total "
        f"FROM expenses e "
        f"JOIN expense_categories ec ON e.category_id = ec.id "
        f"WHERE {where} AND e.status IN ('approved', 'paid') "
        f"GROUP BY ec.name ORDER BY total DESC",
        params,
    )

    # 5 most recent expenses
    recent = fetch_all(
        f"SELECT e.*, u.name AS submitter_name, ec.name AS category_name, u_paid.name AS paid_by_name "
        f"FROM expenses e "
        f"JOIN users u  ON e.submitted_by = u.id "
        f"JOIN expense_categories ec ON e.category_id = ec.id "
        f"LEFT JOIN users u_paid ON e.paid_by = u_paid.id "
        f"WHERE {where} ORDER BY e.created_at DESC LIMIT 5",
        params,
    )

    # Top spenders (admin only) — ONLY include approved and paid expenses
    top_spenders = []
    if role == "admin":
        top_spenders = fetch_all(
            "SELECT u.name, u.role, COUNT(*) AS count, COALESCE(SUM(e.amount),0) AS total "
            "FROM expenses e JOIN users u ON e.submitted_by = u.id "
            "WHERE e.company_id = %s AND e.status IN ('approved', 'paid') "
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


@router.get("/export")
def export_expenses(
    request: Request,
    search: Optional[str] = None,
    status: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """
    Export expenses to CSV formatted for Microsoft Excel, Tally, Zoho, and QuickBooks.
    Admin exports full company ledger; Employee exports personal claims.
    """
    company_id = user["company_id"]
    role = user["role"]

    where_clauses = ["e.company_id = %s"]
    params = [company_id]

    if role != "admin":
        where_clauses.append("e.submitted_by = %s")
        params.append(user["id"])

    if status and status.strip():
        where_clauses.append("e.status = %s")
        params.append(status.strip())

    if search and search.strip():
        term = f"%{search.strip()}%"
        where_clauses.append("(e.description LIKE %s OR ec.name LIKE %s OR u.name LIKE %s OR e.utr_number LIKE %s)")
        params.extend([term, term, term, term])

    where_sql = " AND ".join(where_clauses)
    sql = f"""
        SELECT e.*, u.name AS submitter_name, u.email AS submitter_email,
               ec.name AS category_name, u_paid.name AS paid_by_name
        FROM expenses e
        JOIN users u ON e.submitted_by = u.id
        JOIN expense_categories ec ON e.category_id = ec.id
        LEFT JOIN users u_paid ON e.paid_by = u_paid.id
        WHERE {where_sql}
        ORDER BY e.created_at DESC
    """
    rows = fetch_all(sql, tuple(params))

    # Generate CSV in memory with UTF-8 BOM (\ufeff) for seamless Excel rendering
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Claim ID",
        "Submission Date",
        "Expense Date",
        "Employee Name",
        "Employee Email",
        "Description",
        "Category",
        "Claimed Amount",
        "Claimed Currency",
        "Base Amount (INR)",
        "Approval Status",
        "Payout Status",
        "Bank UTR / Ref Number",
        "Disbursed Date",
        "Disbursed By",
        "Payout Notes",
        "AI Authenticity Score",
        "AI Status",
        "Duplicate Detected",
        "Receipt File Attached"
    ])

    for r in rows:
        created_str = r["created_at"].strftime("%Y-%m-%d %H:%M") if r["created_at"] else ""
        paid_str = r["paid_at"].strftime("%Y-%m-%d %H:%M") if r.get("paid_at") else ""
        writer.writerow([
            r["id"],
            created_str,
            str(r["expense_date"]),
            r["submitter_name"] or "",
            r.get("submitter_email") or "",
            r["description"] or "",
            r["category_name"] or "",
            float(r["original_amount"] or r["amount"]),
            r["original_currency"] or r["base_currency"] or "INR",
            float(r["amount"]),
            (r["status"] or "").upper(),
            (r["payout_status"] or "unpaid").upper(),
            r.get("utr_number") or "",
            paid_str,
            r.get("paid_by_name") or "",
            r.get("payout_notes") or "",
            f"{r['ai_authenticity_score']}%" if r.get("ai_authenticity_score") is not None else "N/A",
            r.get("ai_authenticity_status") or "N/A",
            "YES (Duplicate)" if r.get("is_duplicate") or r.get("duplicate_of") else "No",
            "Yes" if r.get("receipt_path") else "No"
        ])

    csv_data = "\ufeff" + output.getvalue()
    filename = f"reimbursement_ledger_{role}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        content=csv_data.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@router.get("")
def list_expenses(user: dict = Depends(get_current_user)):
    """
    Admin → all company expenses.
    Employee → only their own expenses.
    """
    if user["role"] == "admin":
        rows = fetch_all(
            """SELECT e.*, u.name AS submitter_name, ec.name AS category_name, u_paid.name AS paid_by_name
               FROM expenses e
               JOIN users u  ON e.submitted_by = u.id
               JOIN expense_categories ec ON e.category_id = ec.id
               LEFT JOIN users u_paid ON e.paid_by = u_paid.id
               WHERE e.company_id = %s ORDER BY e.created_at DESC""",
            (user["company_id"],),
        )
    else:
        rows = fetch_all(
            """SELECT e.*, u.name AS submitter_name, ec.name AS category_name, u_paid.name AS paid_by_name
               FROM expenses e
               JOIN users u  ON e.submitted_by = u.id
               JOIN expense_categories ec ON e.category_id = ec.id
               LEFT JOIN users u_paid ON e.paid_by = u_paid.id
               WHERE e.submitted_by = %s ORDER BY e.created_at DESC""",
            (user["id"],),
        )
    return rows


@router.post("", status_code=201)
async def create_expense(
    amount:                 str = Form(...),
    currency:               str = Form(...),
    category_id:            str = Form(...),
    description:            str = Form(...),
    expense_date:           str = Form(...),
    receipt:                Optional[UploadFile] = File(None),
    ai_authenticity_score:  Optional[int] = Form(None),
    ai_authenticity_status: Optional[str] = Form(None),
    ai_authenticity_reason: Optional[str] = Form(None),
    ai_extracted_data:      Optional[str] = Form(None),
    receipt_ocr_text:       Optional[str] = Form(None),
    receipt_hash:           Optional[str] = Form(None),
    invoice_or_tax_id:      Optional[str] = Form(None),
    is_duplicate:           Optional[int] = Form(0),
    duplicate_of:           Optional[str] = Form(None),
    user: dict = Depends(get_current_user),
):
    """Submit a new expense with receipt, AI authenticity scoring, and duplicate detection."""

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
        file_bytes   = await receipt.read()
        with open(file_path, "wb") as f:
            f.write(file_bytes)
        receipt_path = f"uploads/{filename}"

        # Calculate file hash
        calc_hash = hashlib.sha256(file_bytes).hexdigest()
        receipt_hash = receipt_hash or calc_hash

        # Run duplicate check if not already explicitly flagged
        if not duplicate_of:
            existing_dup = fetch_one(
                "SELECT id FROM expenses WHERE company_id = %s AND receipt_hash = %s LIMIT 1",
                (user["company_id"], receipt_hash)
            )
            if existing_dup:
                is_duplicate = 1
                duplicate_of = existing_dup["id"]

        # If AI analysis was not passed from client-side scan, analyze automatically
        if ai_authenticity_score is None:
            try:
                analysis = await analyze_receipt(file_bytes, receipt.content_type, receipt.filename)
                ai_authenticity_score  = analysis.get("authenticity_score")
                ai_authenticity_status = analysis.get("authenticity_status")
                ai_authenticity_reason = analysis.get("authenticity_reason")
                ai_extracted_data      = json.dumps(analysis, ensure_ascii=False)
                receipt_ocr_text       = analysis.get("ocr_text")
                invoice_or_tax_id      = invoice_or_tax_id or analysis.get("invoice_or_tax_id")
            except Exception as e:
                print(f"[WARN] Auto AI scan on expense creation failed: {e}")

    # Insert the expense
    expense_id = str(uuid.uuid4())
    execute(
        """INSERT INTO expenses
           (id, company_id, submitted_by, amount, original_amount, original_currency,
            base_currency, category_id, description, expense_date, receipt_path, status,
            ai_authenticity_score, ai_authenticity_status, ai_authenticity_reason,
            ai_extracted_data, receipt_ocr_text, receipt_hash, invoice_or_tax_id,
            is_duplicate, duplicate_of, payout_status)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'in_review',%s,%s,%s,%s,%s,%s,%s,%s,%s,'unpaid')""",
        (
            expense_id, user["company_id"], user["id"],
            base_amount, original_amount, from_currency,
            company["currency_code"], category_id, description, expense_date,
            receipt_path,
            ai_authenticity_score, ai_authenticity_status, ai_authenticity_reason,
            ai_extracted_data, receipt_ocr_text,
            receipt_hash, invoice_or_tax_id,
            1 if is_duplicate else 0, duplicate_of,
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
    """Return a single expense with its approval request, votes, payout info, and duplicate link."""
    expense = fetch_one(
        """SELECT e.*, u.name AS submitter_name, ec.name AS category_name, u_paid.name AS paid_by_name
           FROM expenses e
           JOIN users u  ON e.submitted_by = u.id
           JOIN expense_categories ec ON e.category_id = ec.id
           LEFT JOIN users u_paid ON e.paid_by = u_paid.id
           WHERE e.id = %s""",
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

    # If duplicate, get referenced expense info
    duplicate_info = None
    if expense.get("duplicate_of"):
        dup_row = fetch_one(
            """SELECT e.id, e.description, e.amount, e.base_currency, e.expense_date, u.name AS submitter_name
               FROM expenses e
               JOIN users u ON e.submitted_by = u.id
               WHERE e.id = %s""",
            (expense["duplicate_of"],)
        )
        if dup_row:
            duplicate_info = {
                "id": dup_row["id"],
                "description": dup_row["description"],
                "amount": float(dup_row["amount"]),
                "currency": dup_row["base_currency"],
                "date": str(dup_row["expense_date"]),
                "submitter": dup_row["submitter_name"],
            }

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

    return {"expense": expense, "approvalRequest": approval, "votes": votes, "duplicateInfo": duplicate_info}



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


# ─── Reimbursement Payout Tracking (Approved → Paid) ──────────

class PayoutRequest(BaseModel):
    utr_number: str
    paid_at: Optional[str] = None
    payout_notes: Optional[str] = None


@router.post("/{expense_id}/payout")
def record_payout(
    expense_id: str,
    body: PayoutRequest,
    user: dict = Depends(get_current_user),
):
    """
    Admin records reimbursement payment/disbursement with Bank UTR reference.
    Transitions status from 'approved' -> 'paid'.
    """
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can disburse reimbursements")

    expense = fetch_one(
        "SELECT * FROM expenses WHERE id = %s AND company_id = %s",
        (expense_id, user["company_id"]),
    )
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    if expense["status"] not in ["approved", "paid"]:
        raise HTTPException(status_code=400, detail="Only approved claims can be marked as reimbursed/paid")

    utr = body.utr_number.strip()
    if not utr:
        raise HTTPException(status_code=400, detail="UTR or bank reference number is required")

    if body.paid_at:
        try:
            clean_str = body.paid_at.replace("Z", "").replace("T", " ")
            if len(clean_str) >= 19:
                paid_time = clean_str[:19]
            else:
                paid_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        except Exception:
            paid_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    else:
        paid_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    execute(
        """UPDATE expenses
           SET status = 'paid', payout_status = 'paid', utr_number = %s, paid_at = %s, paid_by = %s, payout_notes = %s
           WHERE id = %s""",
        (utr, paid_time, user["id"], body.payout_notes or "", expense_id)
    )

    # Also log in approval_votes trail if an approval request exists
    ar = fetch_one("SELECT id FROM approval_requests WHERE expense_id = %s", (expense_id,))
    if ar:
        vote_id = str(uuid.uuid4())
        execute(
            """INSERT INTO approval_votes (id, approval_request_id, approver_id, vote, comment)
               VALUES (%s, %s, %s, 'approve', %s)""",
            (vote_id, ar["id"], user["id"], f"Reimbursement disbursed via Bank UTR: {utr}. Notes: {body.payout_notes or 'None'}")
        )

    updated = fetch_one(
        """SELECT e.*, u.name AS submitter_name, ec.name AS category_name, u_paid.name AS paid_by_name
           FROM expenses e
           JOIN users u ON e.submitted_by = u.id
           JOIN expense_categories ec ON e.category_id = ec.id
           LEFT JOIN users u_paid ON e.paid_by = u_paid.id
           WHERE e.id = %s""",
        (expense_id,)
    )

    return {
        "message": f"Expense reimbursement recorded successfully with UTR {utr}",
        "expense": updated,
        "payout_status": "paid"
    }

