# AI Companion Desktop Application - Running Instructions

## Current Issue
You encountered an error when trying to run the backend from inside the backend directory:
```
Error: spawn python ENOENT
```
This happened because the Electron app was trying to spawn `python` without specifying the full path to your virtual environment's Python executable.

## Solution
We need to use the Python executable from your virtual environment (`venv`) when starting the backend.

## Corrected Setup Instructions

### Option 1: Manual Three-Terminal Setup (Recommended for Development)

**Terminal 1 - Backend (must be run from PROJECT ROOT):**
```powershell
# FIRST, navigate to your project root:
cd /c/users/krutik/coding/ai companion device

# THEN start the backend using your virtual environment's Python:
.\venv\Scripts\python.exe -m backend.main
```
You should see output like: `Uvicorn running on http://0.0.0.0:8000`

**Terminal 2 - Frontend:**
```powershell
cd /c/users/krutik/coding/ai companion device\ui
npm run dev
```
You should see: `VITE dev server running at http://localhost:3000` (or another port if 3000 is busy)

**Terminal 3 - Electron App:**
```powershell
cd /c/users/krutik/coding/ai companion device
npm start
```
This will launch the Electron application with system tray integration.

### Option 2: Using npm Scripts (Alternative)
You can also use these individual scripts:
- Backend only: `npm run start-backend` (runs from project root with venv Python)
- Frontend only: `npm run start-ui`
- Electron only: `npm start`

## Using the Application
Once all three are running:
1. Look for the AI Companion icon in your system tray (bottom-right corner)
2. **Click the tray icon** to show/hide the window
3. **Press Ctrl+Shift+Y** anywhere to show/hide the window
4. **Right-click the tray icon** for the menu with Quit option

## What You'll See
- A small, always-on-top window (400x120px) in the corner of your screen
- Your existing AI Companion UI loaded inside this window
- Full functionality preserved (voice chat, code assistance, etc.)
- The window stays visible even when clicking elsewhere

## Building for Distribution
When ready to create installers:
```powershell
npm run build
```
This creates platform-specific installers in the `dist/` folder:
- Windows: `.exe` installer (NSIS)
- macOS: `.dmg` file
- Linux: `.AppImage`

## Troubleshooting
- **Backend not starting?** Verify you're running the backend command from the **project root** (not inside backend or ui directories)
- **Port conflicts?** If port 8000 or 3000 is in use, change them in:
  - Backend: `backend/config.py` (port setting)
  - Frontend: `ui/vite.config.js` (port setting)
- **Missing icon?** Ensure `assets/icon.png` exists (copied from your Tauri icons)
- **App not showing UI?** Open Developer Tools (right-click window → Inspect) to check for console errors

## Notes
- The application uses your existing virtual environment (`venv`) for the backend
- All your existing AI Companion functionality is preserved
- The window is designed to be unobtrusive yet instantly accessible - exactly like your requested "digital island" behavior
- System tray integration means the app runs in the background using minimal resources

Your AI Companion now behaves as a persistent, accessible desktop widget - available via system tray or keyboard shortcut whenever you need it!