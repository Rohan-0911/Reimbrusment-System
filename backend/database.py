"""
database.py — MySQL connection and table setup

We use mysql-connector-python directly with plain SQL.
No ORM — just simple, readable SQL queries.
"""

import os
import sys

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import mysql.connector
from mysql.connector import pooling
from dotenv import load_dotenv

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))
load_dotenv(os.path.join(BACKEND_DIR, ".env"))
load_dotenv()

# ─── Connection pool ──────────────────────────────────────────
_pool = None


def get_pool():
    """Lazily initialize MySQL connection pool and ensure database exists."""
    global _pool
    if _pool is not None:
        return _pool

    host = os.getenv("DB_HOST", "localhost")
    port = int(os.getenv("DB_PORT", 3306))
    user = os.getenv("DB_USER", "root")
    password = os.getenv("DB_PASSWORD", "")
    database = os.getenv("DB_NAME", "reimburseiq")

    # Step 1: Ensure database exists
    try:
        init_cnx = mysql.connector.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            autocommit=True,
        )
        cur = init_cnx.cursor()
        cur.execute(f"CREATE DATABASE IF NOT EXISTS `{database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
        cur.close()
        init_cnx.close()
    except Exception as err:
        print(f"[WARN] MySQL Pre-check Warning: {err}")

    # Step 2: Create connection pool
    try:
        _pool = pooling.MySQLConnectionPool(
            pool_name="reimburseiq_pool",
            pool_size=5,
            host=host,
            port=port,
            user=user,
            password=password,
            database=database,
            autocommit=True,
            charset="utf8mb4",
        )
        return _pool
    except Exception as err:
        print(f"\n[ERROR] MySQL Connection Failed: {err}")
        print("[HINT] Please configure your MySQL password in backend/.env (DB_PASSWORD)\n")
        raise err


def get_conn():
    """Get a connection from the pool."""
    pool = get_pool()
    return pool.get_connection()


# ─── Helper: run a query that returns rows ────────────────────
def fetch_all(sql: str, params: tuple = ()) -> list[dict]:
    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(sql, params)
        return cur.fetchall()
    finally:
        conn.close()


def fetch_one(sql: str, params: tuple = ()) -> dict | None:
    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(sql, params)
        return cur.fetchone()
    finally:
        conn.close()


# ─── Helper: run an INSERT / UPDATE / DELETE ──────────────────
def execute(sql: str, params: tuple = ()) -> int:
    """Run a write query. Returns last inserted id (or 0)."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        conn.commit()
        return cur.lastrowid or 0
    finally:
        conn.close()


# ─── Create all tables if they don't exist ───────────────────
def create_tables():
    """Called once at startup to set up the database schema."""
    statements = [
        # Companies
        """
        CREATE TABLE IF NOT EXISTS companies (
            id          VARCHAR(36) PRIMARY KEY,
            name        VARCHAR(255) NOT NULL,
            country     VARCHAR(100) NOT NULL,
            currency_code   VARCHAR(10)  NOT NULL DEFAULT 'INR',
            currency_symbol VARCHAR(10)  NOT NULL DEFAULT '₹',
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        """,

        # Users  (only admin + employee roles in this project)
        """
        CREATE TABLE IF NOT EXISTS users (
            id           VARCHAR(36) PRIMARY KEY,
            company_id   VARCHAR(36) NOT NULL,
            name         VARCHAR(255) NOT NULL,
            email        VARCHAR(255) UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role         ENUM('admin', 'employee') NOT NULL DEFAULT 'employee',
            is_active    TINYINT(1) DEFAULT 1,
            created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (company_id) REFERENCES companies(id)
        )
        """,

        # Expense categories (per company)
        """
        CREATE TABLE IF NOT EXISTS expense_categories (
            id          VARCHAR(36) PRIMARY KEY,
            company_id  VARCHAR(36) NOT NULL,
            name        VARCHAR(100) NOT NULL,
            description TEXT,
            FOREIGN KEY (company_id) REFERENCES companies(id)
        )
        """,

        # Expenses
        """
        CREATE TABLE IF NOT EXISTS expenses (
            id                VARCHAR(36) PRIMARY KEY,
            company_id        VARCHAR(36) NOT NULL,
            submitted_by      VARCHAR(36) NOT NULL,
            amount            DECIMAL(12,2) NOT NULL,
            original_amount   DECIMAL(12,2) NOT NULL,
            original_currency VARCHAR(10)  NOT NULL,
            base_currency     VARCHAR(10)  NOT NULL,
            category_id       VARCHAR(36)  NOT NULL,
            description       TEXT NOT NULL,
            expense_date      DATE NOT NULL,
            receipt_path      VARCHAR(500),
            status            ENUM('pending','in_review','approved','rejected','cancelled')
                              NOT NULL DEFAULT 'in_review',
            ai_authenticity_score  INT DEFAULT NULL,
            ai_authenticity_status VARCHAR(50) DEFAULT NULL,
            ai_authenticity_reason TEXT DEFAULT NULL,
            ai_extracted_data      TEXT DEFAULT NULL,
            receipt_ocr_text       TEXT DEFAULT NULL,
            created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (company_id)   REFERENCES companies(id),
            FOREIGN KEY (submitted_by) REFERENCES users(id),
            FOREIGN KEY (category_id)  REFERENCES expense_categories(id)
        )
        """,

        # Approval requests (one per expense)
        """
        CREATE TABLE IF NOT EXISTS approval_requests (
            id          VARCHAR(36) PRIMARY KEY,
            expense_id  VARCHAR(36) NOT NULL,
            status      ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (expense_id) REFERENCES expenses(id)
        )
        """,

        # Approval votes (admin decisions)
        """
        CREATE TABLE IF NOT EXISTS approval_votes (
            id                  VARCHAR(36) PRIMARY KEY,
            approval_request_id VARCHAR(36) NOT NULL,
            approver_id         VARCHAR(36) NOT NULL,
            vote                ENUM('approve','reject') NOT NULL,
            comment             TEXT,
            voted_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (approval_request_id) REFERENCES approval_requests(id),
            FOREIGN KEY (approver_id)         REFERENCES users(id)
        )
        """,
    ]

    try:
        conn = get_conn()
    except Exception as err:
        print(f"[WARN] Database connection not ready yet: {err}")
        print("[HINT] Update DB_PASSWORD in backend/.env with your MySQL root password to connect.\n")
        return False

    try:
        cur = conn.cursor()
        for stmt in statements:
            cur.execute(stmt)
        conn.commit()

        # Ensure new AI columns exist on existing databases
        ai_columns = [
            ("ai_authenticity_score", "INT DEFAULT NULL"),
            ("ai_authenticity_status", "VARCHAR(50) DEFAULT NULL"),
            ("ai_authenticity_reason", "TEXT DEFAULT NULL"),
            ("ai_extracted_data", "TEXT DEFAULT NULL"),
            ("receipt_ocr_text", "TEXT DEFAULT NULL"),
        ]
        for col_name, col_def in ai_columns:
            try:
                cur.execute(f"ALTER TABLE expenses ADD COLUMN {col_name} {col_def}")
                conn.commit()
            except Exception:
                pass  # Already exists

        print(f"[OK] All MySQL tables ready in database '{os.getenv('DB_NAME', 'reimburseiq')}'.")
        return True
    except Exception as err:
        print(f"[WARN] Table setup error: {err}")
        return False
    finally:
        conn.close()
