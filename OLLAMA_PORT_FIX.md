# Fix for Ollama Port Already in Use Error

## Problem
When trying to run `ollama serve`, you get:
```
Error: listen tcp 127.0.0.1:11434: bind: Only one usage of each socket address (protocol/network address/port) is normally permitted.
```
This means another process is already using port 11434, which Ollama needs.

## Solution Options

### Option 1: Kill the Existing Process (Recommended if it's safe)
1. Find the process using port 11434:
   ```powershell
   netstat -ano | findstr :11434
   ```
   Example output:
   ```
   TCP    127.0.0.1:11434        0.0.0.0:0              LISTENING       12345
   ```
   The last number (12345) is the Process ID (PID).

2. Kill that process:
   ```powershell
   taskkill /PID 12345 /F
   ```
   Replace `12345` with the actual PID you found.

3. Now start Ollama:
   ```powershell
   ollama serve
   ```
   You should see: `[INFO]  Listening on 127.0.0.1:11434`

### Option 2: Use a Different Port for Ollama (if you don't want to kill the process)
1. Choose an alternative port (e.g., 11435)
2. Start Ollama on that port:
   ```powershell
   $env:OLLAMA_HOST="http://127.0.0.1:11435"
   ollama serve
   ```
   You should see: `[INFO]  Listening on 127.0.0.1:11435`

3. **Important**: You must also update your backend to use this new port.
   - Edit your `.env` file in the project root (or create one if it doesn't exist)
   - Add or change the line:
     ```
     OLLAMA_BASE_URL=http://127.0.0.1:11435
     ```
   - Or set the environment variable before starting the backend:
     ```powershell
     $env:OLLAMA_BASE_URL="http://127.0.0.1:11435"
     ```

## After Fixing Ollama
Once Ollama is running (on either port 11434 or your chosen port), proceed with:

### Terminal 1 - Ollama Service (leave open)
```powershell
ollama serve
```
*(If you changed the port, use: `$env:OLLAMA_HOST="http://127.0.0.1:11435"; ollama serve`)*

### Terminal 2 - Backend API (run from project root)
```powershell
cd C:\Users\Krutik\CODING\Ai companion device
.\venv\Scripts\python.exe -m backend.main
```
*(If you changed Ollama's port, set OLLAMA_BASE_URL first:)*
```powershell
$env:OLLAMA_BASE_URL="http://127.0.0.1:11435"
.\venv\Scripts\python.exe -m backend.main
```

### Terminal 3 - Frontend Dev Server
```powershell
cd C:\Users\Krutik\CODING\Ai companion device\ui
npm run dev
```

### Terminal 4 - Electron App (last)
```powershell
cd C:\Users\Krutik\CODING\Ai companion device
npm start
```

## Verification
After all four terminals are running:
1. You should see the AI Companion icon in your system tray
2. Click the tray icon or press `Ctrl+Shift+Y` to show/hide the window
3. The window will be your 400x120px "digital island" widget loading your AI Companion UI

## Notes
- Option 1 (killing the process) is simpler if you're sure the existing process is safe to terminate (it's likely a previous Ollama instance or a test service).
- Option 2 is safer if you're unsure what's using port 11434, but requires updating your backend configuration.
- The backend will automatically use the OLLAMA_BASE_URL from your .env file or environment, so make sure it matches whatever port Ollama is running on.

Your AI Companion Desktop Application is ready to use once Ollama is running correctly!