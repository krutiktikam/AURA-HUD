@echo off
chcp 65001 >nul
title J.A.R.V.I.S. Agent Behavior Test Suite

echo ========================================
echo   J.A.R.V.I.S. AGENT TEST SUITE
echo ========================================
echo.

:: Check if virtual environment exists
if not exist "venv\Scripts\activate.bat" (
    echo [ERROR] Python virtual environment not found in venv\
    pause
    exit /b 1
)

call venv\Scripts\activate.bat

:: Check if Ollama is running
echo [1/3] Checking Ollama Service...
curl -s http://127.0.0.1:11435/api/tags >nul 2>&1
if %errorlevel% neq 0 (
    echo [NOTICE] Ollama on port 11435 not detected. Tests will use local fallback and deterministic tool evaluations.
) else (
    echo [✓] Ollama service active on port 11435.
)

:: Run behavior tests
echo.
echo [2/3] Running agent behavior & latency tests...
python tests\test_agent_behavior.py

:: Show report summary
echo.
echo [3/3] Diagnostic report:
if exist tests\test_report.json (
    echo [✓] Detailed diagnostic report saved to tests\test_report.json
) else (
    echo [!] No report file generated.
)

echo.
pause
