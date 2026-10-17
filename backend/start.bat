@echo off
cd /d "%~dp0"
echo.
echo ============================================
echo   Reimbursement System Backend (FastAPI + MySQL)
echo ============================================
echo.
echo Starting server on http://localhost:5001
echo API docs: http://localhost:5001/docs
echo.
echo Press Ctrl+C to stop.
echo.
py -3.13 -m uvicorn main:app --reload --port 5001 --host 0.0.0.0
