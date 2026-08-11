# Port 11434 Keeps Being Reused - How to Fix Permanently

## What's Happening
You're seeing:
```
TCP    127.0.0.1:11434        0.0.0.0:0              LISTENING       20824
```
After killing PID 20824, a new process (21668, then 3772) takes over the port. This indicates **Ollama is likely running as a Windows service** that automatically restarts when stopped.

## Solution: Stop the Ollama Service (Not Just Kill Processes)

### Step 1: Identify and Stop the Ollama Service
Run these commands in PowerShell **as Administrator**:

```powershell
# List all services related to ollama
Get-Service | Where-Object {$_.Name -like "*ollama*"} | Format-Table Name, Status, DisplayName

# If you see a service like "ollama" or "Ollama Service", stop it:
Stop-Service -Name ollama -Force

# Prevent it from auto-restarting:
Set-Service -Name ollama -StartupType Disabled
```

### Step 2: Verify Port is Free
```powershell
netstat -ano | findstr :11434
```
Should return **no results** (blank output).

### Step 3: Start Ollama Manually (Now It Will Stay Stopped)
In a **regular** PowerShell (not admin needed):
```powershell
ollama serve
```
You should see: `[INFO]  Listening on 127.0.0.1:11434`
**Leave this terminal open** - do not close it.

### Step 4: Start Backend (with SSL fixes)
In a **new** terminal:
```powershell
cd C:\Users\Krutik\CODING\Ai companion device
$env:PYTHONHTTPSVERIFY="0"
$env:NO_PROXY="localhost,127.0.0.1"
$env:OLLAMA_HOST="http://localhost:11434"
.\venv\Scripts\python.exe -m backend.main
```
Wait for: `Uvicorn running on http://0.0.0.0:8000`

### Step 5: Start Frontend Dev Server
In another **new** terminal:
```powershell
cd C:\Users\Krutik\CODING\Ai companion device\ui
npm run dev
```
Wait for: `VITE dev server running at http://localhost:3000`

### Step 6: Start Electron App (LAST)
In a final **new** terminal:
```powershell
cd C:\Users\Krutik\CODING\Ai companion device
npm start
```

## Why This Works
- Stopping the service prevents auto-restart
- Starting `ollama serve` manually gives you control
- The service will remain disabled until you re-enable it

## To Re-enable Ollama Service Later (if needed)
```powershell
Set-Service -Name ollama -StartupType Automatic
Start-Service -Name ollama
```

## Verification
When everything is working correctly you'll see:
- Terminal 1: `[INFO]  Listening on 127.0.0.1:11434`
- Terminal 2: `Uvicorn running on http://0.0.0.0:8000`
- Terminal 3: `VITE dev server running at http://localhost:3000`
- Terminal 4: Electron app with system tray icon
- Click tray icon or press Ctrl+Shift+Y shows your 400x120px widget
- Your AI Companion UI loads inside (chat, voice, code assistant functional)

## Alternative: Change Ollama's Port (if you prefer not to disable the service)
If you'd rather keep the Ollama service running, you can change its port:

1. **Stop the service first** (as above)
2. Set a different port for Ollama:
   ```powershell
   $env:OLLAMA_HOST="http://127.0.0.1:11435"
   ollama serve
   ```
3. **Update your backend** to use this port:
   ```powershell
   $env:OLLAMA_BASE_URL="http://127.0.0.1:11435"
   .\venv\Scripts\python.exe -m backend.main
   ```
4. Keep the service disabled or re-enable it as needed.

## Final Note
Your Electron application code is correct and ready to use. Once the Ollama port conflict is resolved by stopping the service, following the 6-terminal sequence above will give you exactly what you requested: a system tray resident AI Companion accessible via Ctrl+Shift+Y, displaying a 400x120px always-on-top "digital island" widget.

**Stop the Ollama service, then start ollama serve manually, and your setup will work!**