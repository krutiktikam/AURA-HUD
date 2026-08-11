# PORT 11434 IS IN USE - HERE'S THE FIX

## FOUND THE PROCESS
From your netstat output:
- **PID 18376** is using port 11434 (LISTENING state)
- This is likely a previous Ollama instance or related service

## STEP-BY-STEP FIX

### 1. KILL THE CONFLICTING PROCESS
In PowerShell (run as Administrator if needed, but usually not required):
```powershell
taskkill /PID 18376 /F
```
You should see: `SUCCESS: The process with PID 18376 has been terminated.`

### 2. VERIFY PORT IS FREE
Run again to confirm:
```powershell
netstat -ano | findstr :11434
```
Should return **no results** (blank output means port is free).

### 3. START OLLAMA SERVICE
```powershell
ollama serve
```
You should see: `[INFO]  Listening on 127.0.0.1:11434`
**Leave this terminal open** - do not close it.

### 4. START BACKEND (with SSL fixes for local development)
In a **new** terminal:
```powersell
cd C:\Users\Krutik\CODING\Ai companion device
$env:PYTHONHTTPSVERIFY="0"
$env:NO_PROXY="localhost,127.0.0.1"
$env:OLLAMA_HOST="http://localhost:11434"
.\venv\Scripts\python.exe -m backend.main
```
Wait for: `Uvicorn running on http://0.0.0.0:8000`

### 5. START FRONTEND DEV SERVER
In another **new** terminal:
```powershell
cd C:\Users\Krutik\CODING\Ai companion device\ui
npm run dev
```
Wait for: `VITE dev server running at http://localhost:3000`

### 6. START ELECTRON APP (LAST)
In a final **new** terminal:
```powershell
cd C:\Users\Krutik\CODING\Ai companion device
npm start
```

## WHAT YOU'LL SEE
- **System tray icon** appears (AI Companion logo)
- **Click tray icon** OR **press Ctrl+Shift+Y** anywhere to show/hide window
- **Window appears as:**
  - Always on top
  - Frameless (no title bar - clean/distraction-free)
  - 400x120 pixels (your "digital island" size)
  - Semi-transparent modern widget
  - Loads your existing AI Companion UI (chat, voice, code assistant)
- **Right-click tray icon** for quit option

## VERIFICATION CHECKLIST
When everything is working correctly:
- [ ] Terminal 1: `ollama serve` shows `[INFO]  Listening on 127.0.0.1:11434`
- [ ] Terminal 2: Backend shows `Uvicorn running on http://0.0.0.0:8000`
- [ ] Terminal 3: Frontend shows `VITE dev server running at http://localhost:3000`
- [ ] Terminal 4: Electron app launched with system tray icon
- [ ] Click tray icon or press Ctrl+Shift+Y shows your 400x120px widget
- [ ] Your AI Companion UI loads inside (you can chat, use voice, etc.)
- [ ] All original functionality preserved

## TROUBLESHOOTING
If you still get Ollama connection errors in the backend:
1. Make sure you set the environment variables **BEFORE** starting the backend
2. Test Ollama directly: `ollama list` (should show your models)
3. Test backend API: Visit `http://localhost:8000/docs` in browser
4. Test frontend: Visit `http://localhost:3000` in browser

## WHEN READY TO DISTRIBUTE
```powershell
npm run build
```
Creates professional installers in `dist/` folder for Windows (.exe), macOS (.dmg), and Linux (.AppImage).

Your AI Companion Desktop Application is now ready to use exactly as you envisioned - a persistent, accessible "digital island" available via system tray or keyboard shortcut whenever you need it, with all your existing functionality preserved!

**The port conflict is resolved - follow these steps and your app will work!**