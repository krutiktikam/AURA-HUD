@echo off
chcp 65001 >nul
title AI Companion Desktop App (100% Local & Offline)

echo ========================================
echo   AI COMPANION - 100%% LOCAL & OFFLINE
echo ========================================
echo.

:: Kill any existing Ollama on port 11434 if lingering
echo [1/4] Cleaning up port 11434...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :11434 ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: Start Ollama on port 11435 (100% Local Offline LLM)
echo [2/4] Starting Local Ollama LLM Service on port 11435...
start "Ollama Service" cmd /k "set OLLAMA_HOST=http://127.0.0.1:11435 && ollama serve"
timeout /t 3 /nobreak >nul

:: Start Backend with local offline environment variables
echo [3/4] Starting Backend (Whisper STT + Fast API)...
start "Backend API" cmd /k "cd /d "%~dp0" && set HF_HOME=%USERPROFILE%\.cache\huggingface && set PYTHONHTTPSVERIFY=0 && set NO_PROXY=localhost,127.0.0.1 && set OLLAMA_BASE_URL=http://127.0.0.1:11435 && .\venv\Scripts\python.exe -m backend.main"
timeout /t 3 /nobreak >nul

:: Start Frontend Dev Server
echo [4/4] Starting Frontend UI Server...
start "Frontend Dev" cmd /k "cd /d "%~dp0\ui" && npm run dev"
timeout /t 4 /nobreak >nul

:: Start Electron App
echo.
echo Starting Electron Desktop App...
npm start

echo.
echo ========================================
echo   AI Companion Online (Offline Mode Active)
echo ========================================
echo.
echo Services running locally:
echo - Local Ollama LLM: http://127.0.0.1:11435
echo - Local Backend API: http://localhost:8000
echo - Local Frontend UI: http://localhost:3000
echo.
echo Controls:
echo - Click tray icon or press Ctrl+Shift+Y
echo - Right-click tray for menu
echo.
pause