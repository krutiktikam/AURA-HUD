# Ollama Connection Troubleshooting Guide

## Problem
Your backend is failing to start because it cannot connect to Ollama's local API service. The error shows SSL/context issues when the ollama Python client tries to initialize.

## Step-by-Step Solution

### Step 1: Verify Ollama Installation
Open a **NEW** terminal window and run:
```powershell
ollama --version
```
If you get "'ollama' is not recognized", you need to install Ollama from: https://ollama.com/download

### Step 2: Start Ollama Service
In that same terminal, run:
```powershell
ollama serve
```
You should see output like:
```
[INFO]  Starting server
[INFO]  Listening on 127.0.0.1:11434
```
**Keep this terminal running** - do not close it.

### Step 3: Verify Ollama is Working
In a **third** terminal, test the connection:
```powershell
curl http://localhost:11434/api/tags
```
You should see JSON output listing available models (or an empty list if none are pulled yet).

### Step 4: Pull Required Model (if needed)
Your backend likely uses `llama3.2:1b` (from your README). Pull it:
```powershell
ollama pull llama3.2:1b
```

### Step 5: Now Start Your Backend
Go back to your **first** terminal (where you had the error) and run:
```powershell
cd C:\Users\Krutik\CODING\Ai companion device
.\venv\Scripts\python.exe -m backend.main
```
You should now see: `INFO:     Uvicorn running on http://0.0.0.0:8000`

### If You Still Get SSL Errors
Try this temporary workaround in your backend terminal **before** starting the server:
```powershell
$env:NO_PROXY="localhost,127.0.0.1"
$env:PYTHONHTTPSVERIFY="0"
.\venv\Scripts\python.exe -m backend.main
```

## Complete 3-Terminal Setup

**Terminal 1 - Ollama Service** (run first, keep open):
```powershell
ollama serve
```

**Terminal 2 - Backend API** (run second):
```powershell
cd C:\Users\Krutik\CODING\Ai companion device
.\venv\Scripts\python.exe -m backend.main
```

**Terminal 3 - Frontend Dev Server** (run third):
```powershell
cd C:\Users\Krutik\CODING\Ai companion device\ui
npm run dev
```

**Terminal 4 - Electron App** (run fourth, after the above are working):
```powershell
cd C:\Users\Krutik\CODING\Ai companion device
npm start
```

## Verification Checklist
✅ Terminal 1 shows Ollama server running  
✅ Terminal 2 shows "Uvicorn running on http://0.0.0.0:8000"  
✅ Terminal 3 shows Vite dev server running (usually on :3000)  
✅ Terminal 4 launches Electron app with tray icon  
✅ Click tray icon or press Ctrl+Shift+Y to show/hide your 400x120px "digital island" window  

## Expected Behavior When Working
Once all services are running:
1. You'll see the AI Companion icon in your system tray
2. Clicking it or pressing Ctrl+Shift+Y shows your UI
3. The UI loads your existing React chat/voice/code assistant interface
4. Backend handles AI requests via your local Ollama instance
5. All your original functionality is preserved

The Electron app we built is functioning correctly - it's just waiting for the backend to be available to load and display your interface. Once the Ollama connection is fixed, everything will work as designed!