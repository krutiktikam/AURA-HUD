@echo off
chcp 65001 >nul
title AI Companion Desktop App

echo ========================================
echo   AI COMPANION - DYNAMIC ISLAND
echo ========================================
echo.

:: Kill any existing Ollama on port 11434
echo [1/4] Cleaning up port 11434...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :11434 ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 2 /nobreak >nul

:: Start Ollama on port 11435 (avoid conflict with service)
echo [2/4] Starting Ollama on port 11435...
start "Ollama Service" cmd /k "set OLLAMA_HOST=http://127.0.0.1:11435 && ollama serve"
timeout /t 3 /nobreak >nul

:: Start Backend with environment variables
echo [3/4] Starting Backend API...
start "Backend API" cmd /k "cd /d "%~dp0" && set PYTHONHTTPSVERIFY=0 && set NO_PROXY=localhost,127.0.0.1 && set OLLAMA_BASE_URL=http://127.0.0.1:11435 && .\venv\Scripts\python.exe -m backend.main"
timeout /t 3 /nobreak >nul

:: Start Frontend
echo [4/4] Starting Frontend Dev Server...
start "Frontend Dev" cmd /k "cd /d "%~dp0\ui" && npm run dev"
timeout /t 5 /nobreak >nul

:: Start Electron App
echo.
echo Starting Electron Desktop App...
npm start

echo.
echo ========================================
echo   AI Companion Started!
echo ========================================
echo.
echo Services running:
echo - Ollama: http://127.0.0.1:11435
echo - Backend: http://localhost:8000
echo - Frontend: http://localhost:3000
echo.
echo Controls:
echo - Click tray icon or press Ctrl+Shift+Y
echo - Right-click tray for menu
echo.
pause