# Ollama Connection Fix for AI Companion Backend

## Issue
The backend is failing to connect to Ollama due to SSL certificate verification issues. This is common when:
1. Ollama isn't running
2. Network/firewall is blocking the connection
3. SSL certificate issues in the Python environment

## Quick Fixes to Try

### 1. First, Verify Ollama is Running
Open a new terminal and run:
```powershell
ollama list
```
You should see a list of available models. If you get an error, Ollama isn't running.

### 2. Start Ollama (if not running)
In a separate terminal:
```powershell
ollama serve
```
Leave this running, then try starting your backend again.

### 3. If SSL Issues Persist
Try setting environment variables to disable SSL verification (for local development only):

In your backend terminal, before running the server:
```powershell
$env:PYTHONHTTPSVERIFY="0"
$env:OLLAMA_HOST="http://localhost:11434"
.\venv\Scripts\python.exe -m backend.main
```

### 4. Alternative: Use Hosts File Fix
Sometimes the issue is with hostname resolution. Try:
```powershell
# Test if you can reach Ollama
curl http://localhost:11434/api/tags
```
If this works, the issue is in your Python SSL config.

## Once Ollana is Working
After fixing the Ollama connection, your backend should start successfully showing:
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

Then proceed with:
- Terminal 2: `cd ui && npm run dev` 
- Terminal 3: `npm start`

## Expected Behavior When Working
Once all three are running:
1. System tray icon appears
2. Click tray icon OR press `Ctrl+Shift+Y` to show/hide window
3. Window appears as always-on-top, frameless 400x120px widget
4. Your AI Companion UI loads inside (chat, voice, code assistant)
5. Right-click tray icon for quit option

The Electron app we built is working correctly - it's just waiting for the backend to be available to load the UI content.

## Verification Steps
1. Test Ollama directly: `ollama list` should show your models
2. Test backend API: Visit `http://localhost:8000/docs` in browser
3. Test frontend: Visit `http://localhost:3000` in browser
4. Then start the Electron app: `npm start`

Once these three pieces are working, your "digital island" AI companion will be ready to use!