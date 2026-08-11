# FINAL WORKING SOLUTION - NO NEED TO KILL PROCESSES REPEATEDLY

## PROBLEM: Ollama service keeps restarting on port 11434
The issue is that Ollama is installed as a Windows service that automatically restarts when stopped. Instead of fighting the service, we'll use a different port for our development instance.

## SOLUTION: RUN OLLAMA ON A DIFFERENT PORT (11435) AND CONFIGURE BACKEND ACCORDINGLY

### STEP 1: START OLLAMA ON PORT 11435 (Terminal 1 - KEEP THIS OPEN)
```powershell
# Set Ollama to use port 11435 instead of 11434
$env:OLLAMA_HOST="http://127.0.0.1:11435"
ollama serve
```
You should see: `[INFO]  Listening on 127.0.0.1:11435`
**Leave this terminal open** - do not close it.

### STEP 2: START BACKEND (Terminal 2 - with Ollama pointing to port 11435)
```powershell
# Point backend to our Ollama instance on port 11435
$env:OLLAMA_BASE_URL="http://127.0.0.1:11435"
# Fix SSL issues for local development
$env:PYTHONHTTPSVERIFY="0"
$env:NO_PROXY="localhost,127.0.0.1"

# Navigate to project root and start backend
cd C:\Users\Krutik\CODING\Ai companion device
.\venv\Scripts\python.exe -m backend.main
```
Wait for: `Uvicorn running on http://0.0.0.0:8000`

### STEP 3: START FRONTEND DEV SERVER (Terminal 3)
```powershell
cd C:\Users\Krutik\CODING\Ai companion device\ui
npm run dev
```
Wait for: `VITE dev server running at http://localhost:3000`

### STEP 4: START ELECTRON APP (Terminal 4 - LAST)
```powershell
cd C:\Users\Krutik\CODING\Ai companion device
npm start
```

## WHAT YOU'LL EXPERIENCE WHEN WORKING
1. System tray icon appears (AI Companion logo)
2. Click tray icon OR press **Ctrl+Shift+Y** to show/hide window
3. Window appears as:
   - Always on top
   - Frameless (no title bar - clean/distraction-free)
   - 400x120 pixels (your "digital island" size)
   - Semi-transparent modern widget
   - Loads your existing AI Companion UI
4. Right-click tray icon for quit option

## VERIFICATION CHECKLIST
When everything is running correctly you'll see:
- [ ] Terminal 1: Ollama service on `127.0.0.1:11435` (look for "Listening on 127.0.0.1:11435")
- [ ] Terminal 2: Backend API on `http://0.0.0.0:8000`
- [ ] Terminal 3: Frontend dev server on `http://localhost:3000`
- [ ] Terminal 4: Electron app with system tray icon
- [ ] Click tray icon or press Ctrl+Shift+Y shows your 400x120px widget
- [ ] Your AI Companion UI loads inside (you can use chat, voice, code assistant)
- [ ] All original functionality preserved (local LLM, voice chat, code assistance)

## WHY THIS WORKS
- We're not fighting the Ollama service - it keeps running on port 11434 for other uses
- We're running our own Ollama instance on port 11435 just for this development session
- The backend is pointed to port 11435 via `OLLAMA_BASE_URL`
- No need to stop/disable services or repeatedly kill processes

## WHEN READY TO DISTRIBUTE LATER
```powershell
npm run build
```
Creates professional installers in `dist/` folder for Windows (.exe), macOS (.dmg), and Linux (.AppImage).

## TROUBLESHOOTING TIPS
- If port 11435 is also in use, try 11436, 11437, etc. (just update both OLLAMA_HOST and OLLAMA_BASE_URL)
- To test Ollama directly: `ollama list` (should show your models)
- To test backend API: Visit `http://localhost:8000/docs` in browser
- To test frontend: Visit `http://localhost:3000` in browser

**Your AI Companion Desktop Application is now ready to use exactly as envisioned - a persistent, accessible "digital island" available via system tray or keyboard shortcut whenever you need it!**