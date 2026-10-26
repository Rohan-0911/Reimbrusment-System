"""
main.py — Reimbursement System FastAPI Application

Run with:
    uvicorn main:app --reload --port 5001

API is available at:  http://localhost:5001/api
Docs are at:          http://localhost:5001/docs
"""

import os
import sys

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Ensure backend directory is in sys.path so modules resolve from any working directory
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

# Load environment variables from project root .env or backend/.env
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))
load_dotenv(os.path.join(BACKEND_DIR, ".env"))
load_dotenv()

from database import create_tables
from routes import auth, expenses, admin

# ─── Create the app ───────────────────────────────────────────
app = FastAPI(
    title="Reimbursement System API",
    description="Expense management and reimbursement backend",
    version="1.0.0",
)


# ─── CORS — allow the frontend to call this API ───────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_origin_regex=r".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Serve uploaded receipt files ─────────────────────────────
UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")


# ─── Register all routers ────────────────────────────────────
app.include_router(auth.router,     prefix="/api/auth",     tags=["Auth"])
app.include_router(expenses.router, prefix="/api/expenses", tags=["Expenses"])
app.include_router(admin.router,    prefix="/api/admin",    tags=["Admin"])


# ─── Health check ─────────────────────────────────────────────
@app.get("/health", tags=["Health"])
def health_check():
    """Simple endpoint to verify the server is running and check DB status."""
    db_status = "connected"
    try:
        from database import get_conn
        conn = get_conn()
        conn.close()
    except Exception as e:
        db_status = f"not connected ({str(e)})"

    return {
        "status": "ok",
        "message": "Reimbursement System API is running",
        "database": db_status,
        "python_version": "3.13",
    }


# ─── Startup: create DB tables ────────────────────────────────
@app.on_event("startup")
def on_startup():
    """Called once when the server starts. Sets up the database."""
    print("[INFO] Starting Reimbursement System API...")
    create_tables()
    print("[INFO] Server ready at http://localhost:5001")
    print("[INFO] API docs available at http://localhost:5001/docs")
