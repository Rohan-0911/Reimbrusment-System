# 💼 Reimbursement System

> **Enterprise Expense & Reimbursement Management Platform**  
> Built with a high-performance **Python 3.13 FastAPI** backend, reliable **MySQL** persistence, and a lightweight, zero-dependency **Vanilla HTML5 / CSS3 / ES6+ JavaScript** frontend.

---

## 📋 Table of Contents
- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture & Tech Stack](#architecture--tech-stack)
- [Project Directory Structure](#project-directory-structure)
- [Prerequisites](#prerequisites)
- [Step-by-Step Setup Guide](#step-by-step-setup-guide)
  - [1. Database Setup (MySQL)](#1-database-setup-mysql)
  - [2. Backend Setup & Configuration](#2-backend-setup--configuration)
  - [3. Frontend Setup](#3-frontend-setup)
- [Environment Variables](#environment-variables)
- [API Documentation](#api-documentation)
- [Security & Best Practices](#security--best-practices)

---

## 🌟 Overview

The **Reimbursement System** streamlines corporate expense reporting, receipt verification, manager approvals, and financial audits. Designed with an ultra-clean, modern, light fintech aesthetic, it eliminates complex build chains and bulky frameworks—providing instantaneous page loads, intuitive navigation, and reliable audit logging.

---

## ✨ Key Features

### 🔐 Authentication & Role-Based Access
- **Company Registration**: Onboarding workflow creates both the organization profile and the initial **Administrator** account.
- **Role Isolation**: Strict role division between **Admin** (financial oversight, employee management, all-claim auditing) and **Employee** (personal expense submission and claim status tracking).
- **JWT Protection**: Cryptographically signed access tokens stored securely in client state with automatic token expiration and authorization headers.

### 💰 Expense Submission & Lifecycle
- **Comprehensive Claims**: Multi-field submissions including merchant name, category, transaction date, description, and currency selection.
- **Receipt Attachment**: Multi-format receipt uploads (PNG, JPG, PDF) with receipt file preview and secure backend storage.
- **Currency Conversion**: Automatic live exchange rate calculation with graceful fallback support.
- **Status Lifecycle**: Clear progression through `Pending`, `Approved`, and `Rejected` states with administrator rejection notes.

### 📊 Dashboard & Financial Analytics
- **KPI Metrics**: Real-time summary cards for total claimed, pending approvals, approved amounts, and month-over-month comparisons.
- **Ledger & Filters**: Searchable, filterable expense ledger with date-range filters, category badges, and instant pagination.
- **Audit Trails**: Individual expense inspection drawer/modal displaying full submission history, audit timeline, and attached receipt proofs.

### 👥 Team & Department Administration
- **Employee Directory**: Manage team members, departmental assignments, and role permissions.
- **Company Settings**: Update company profiles, default base currency, and expense governance policies.

---

## 🛠️ Architecture & Tech Stack

### Backend
- **Runtime**: Python 3.13+
- **Framework**: [FastAPI](https://fastapi.tiangolo.com/) (Asynchronous, high-performance web framework)
- **ASGI Server**: [Uvicorn](https://www.uvicorn.org/)
- **Database Connector**: `mysql-connector-python` with connection pooling
- **Security & Tokens**: `python-jose` (JWT) + `bcrypt` (salted password hashing)
- **Multipart Uploads**: `python-multipart`

### Frontend
- **Structure**: Semantic HTML5 (Single-page architecture with state-driven view routing)
- **Styling**: Vanilla CSS3 using custom CSS variables (design tokens), CSS Grid, and Flexbox (No Tailwind, no external UI component libraries)
- **Logic**: Vanilla ES6+ JavaScript modules (Centralized reactive state store, client-side router, asynchronous API client, and toast notification engine)

### Database
- **Engine**: MySQL 8.0+
- **Schema Management**: Automated table initialization on backend server startup (tables, foreign keys, and indexes created automatically).

---

## 📂 Project Directory Structure

```
AI reimbruse/
├── .env.example               # Root template for environment configuration
├── .gitignore                  # Git ignore rules (protects credentials & progress)
├── README.md                   # Project documentation & setup instructions
├── requirements.txt            # Python dependencies (allows root pip install)
├── backend/
│   ├── .env                    # Local credentials (DO NOT COMMIT)
│   ├── .env.example            # Backend-specific environment template
│   ├── main.py                 # FastAPI application entry point & CORS setup
│   ├── database.py             # MySQL connection pool & automatic table schema
│   ├── auth_utils.py           # Password hashing & JWT token generation
│   ├── dependencies.py         # Route guards & user authentication dependencies
│   ├── requirements.txt        # Python package dependencies
│   ├── start.bat               # Windows quick-launch script for backend
│   ├── routes/
│   │   ├── auth.py             # Login, signup, and /me endpoints
│   │   ├── expenses.py         # Expense submission, ledger, and status routes
│   │   └── admin.py            # User management & organizational analytics
│   └── uploads/                # Directory for uploaded receipt files
└── frontend/
    ├── index.html              # Core single-page application markup & modals
    ├── css/
    │   ├── main.css            # Design tokens, reset, typography, and utility classes
    │   ├── layout.css          # App shell, sidebar navigation, and header topbar
    │   ├── auth.css            # Login & organization signup screens
    │   ├── dashboard.css       # Analytics cards, metrics, and summary grids
    │   ├── expenses.css        # Ledger table, expense form, and detail drawer
    │   └── admin.css           # Team directory and administrative controls
    └── js/
        ├── app.js              # State store, router, API wrapper, and UI helpers
        ├── auth.js             # Authentication flows and form validation
        ├── dashboard.js        # Dashboard data hydration and KPI rendering
        ├── expenses.js         # Expense ledger, filtering, and pagination
        ├── new-expense.js      # Expense creation form and receipt uploader
        ├── expense-detail.js   # Detailed expense viewer and status update actions
        └── admin.js            # User management and administrator analytics
```

---

## ⚙️ Prerequisites

Before getting started, make sure you have the following installed:

1. **Python 3.13** (or 3.11+): [Download Python](https://www.python.org/downloads/)  
   *Verify installation:* `python --version` or `py -3.13 --version`
2. **MySQL Server** (version 8.0 or higher): [Download MySQL](https://dev.mysql.com/downloads/installer/)  
   *Ensure the MySQL service is running on `localhost:3306`.*
3. **Web Browser**: Chrome, Edge, Firefox, or Safari.
4. **Local Static Server**: VS Code Live Server extension (recommended) or Python's built-in `http.server`.

---

## 🚀 Step-by-Step Setup Guide

### 1. Database Setup (MySQL)

1. Open your MySQL client (e.g., MySQL Workbench, Command Line, or DBeaver).
2. Connect to your local MySQL instance and run the following command to create the database:
   ```sql
   CREATE DATABASE reimburseiq CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
3. *You do not need to run manual table migration scripts.* The backend automatically creates all required tables (`users`, `companies`, `expenses`, `approval_requests`, etc.) upon its first launch.

---

### 2. Backend Setup & Configuration

1. **Install Python dependencies**:
   You can run this directly from the project root or from inside `backend/`:
   ```bash
   py -3.13 -m pip install -r requirements.txt
   ```
   *(Or if running from root without root requirements: `py -3.13 -m pip install -r backend/requirements.txt`)*

2. **Configure Environment Variables**:
   - Copy `.env.example` to `backend/.env`:
     ```bash
     # From project root:
     copy .env.example backend\.env
     ```
   - Open `backend/.env` in your editor and enter your local MySQL password:
     ```env
     DB_HOST=127.0.0.1
     DB_PORT=3306
     DB_USER=root
     DB_PASSWORD=your_mysql_password_here
     DB_NAME=reimburseiq
     SECRET_KEY=generate_a_secure_long_random_string_here
     FRONTEND_URL=http://localhost:5500
     ```

3. **Start the backend server**:
   - **Option A (Quick Launch via Batch script on Windows):**
     Double-click `backend\start.bat` or run:
     ```bash
     .\backend\start.bat
     ```
   - **Option B (Direct Command from `backend/` folder):**
     ```bash
     cd backend
     py -3.13 -m uvicorn main:app --reload --port 5001 --host 0.0.0.0
     ```

6. Verify that the backend is running:
   - API Root: `http://localhost:5001/api`
   - Interactive Docs: `http://localhost:5001/docs`

---

### 3. Frontend Setup

The frontend is built with pure HTML, CSS, and JavaScript, meaning **no build steps or `npm install` are required**.

1. **Recommended Method (VS Code Live Server)**:
   - Open the workspace folder in VS Code.
   - Right-click `frontend/index.html` and click **"Open with Live Server"**.
   - Your browser will open `http://localhost:5500` (or `http://127.0.0.1:5500`).

2. **Alternative Method (Python HTTP Server)**:
   - Open a terminal in the `frontend` folder:
     ```bash
     cd frontend
     py -m http.server 5500
     ```
   - Open `http://localhost:5500` in your web browser.

---

## 🔑 Default Flow & Getting Started

1. When you first open the application, you will be prompted to log in.
2. Click **"Register your company"** at the bottom of the login card.
3. Complete the signup form (Company Name, Full Name, Work Email, and Password).
4. Submitting this form automatically creates:
   - Your company profile.
   - Your account with the **Admin** role.
5. You can immediately access the full **Admin Dashboard**, create expenses, view reports, or invite and register employees.

---

## 🔒 Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `DB_HOST` | Yes | `localhost` | Host address of the MySQL database server. |
| `DB_PORT` | Yes | `3306` | Port number of the MySQL server. |
| `DB_USER` | Yes | `root` | MySQL user account name. |
| `DB_PASSWORD` | Yes | *None* | Password for the MySQL user. |
| `DB_NAME` | Yes | `reimburseiq` | Name of the database schema. |
| `SECRET_KEY` | Yes | *Long Secret* | Secret key for signing and verifying JWT authentication tokens. |
| `FRONTEND_URL` | No | `http://localhost:5500` | Allowed origin for Cross-Origin Resource Sharing (CORS). |
| `EXCHANGE_API_KEY` | No | *Empty* | Optional API key for `exchangerate-api.com`. Uses free fallback if empty. |

---

## 📖 API Documentation

FastAPI automatically generates interactive OpenAPI documentation:

- **Swagger UI**: [http://localhost:5001/docs](http://localhost:5001/docs)  
  *Explore and test API routes directly from your browser.*
- **ReDoc**: [http://localhost:5001/redoc](http://localhost:5001/redoc)  
  *Clean, readable reference documentation.*

### Core Endpoint Categories:
- `POST /api/auth/signup` — Register a company and primary admin.
- `POST /api/auth/login` — Authenticate and receive a JWT access token.
- `GET /api/auth/me` — Retrieve the authenticated user's profile and permissions.
- `GET /api/expenses` — List expenses with optional status and search filtering.
- `POST /api/expenses` — Create a new expense claim with receipt upload.
- `GET /api/expenses/{id}` — Fetch detailed information for a specific expense.
- `PATCH /api/expenses/{id}/status` — Update approval status (`approved` or `rejected`).
- `GET /api/admin/users` — Retrieve employee and administrator directory.
- `GET /api/admin/analytics` — Fetch aggregated company expenditure metrics.

---

## 🛡️ Security & Best Practices

- **Never Commit Secrets**: The `.gitignore` file is pre-configured to exclude `.env`, `backend/.env`, and temporary progress notes from version control.
- **Production Secrets**: Before deploying to production, replace `SECRET_KEY` in `backend/.env` with a secure random key (e.g. `python -c "import secrets; print(secrets.token_urlsafe(32))"`).
- **CORS Configuration**: Restrict `FRONTEND_URL` in `backend/.env` to your production domain when deploying.
