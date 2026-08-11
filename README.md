# Hardware AI Companion Device (Dynamic Island Edition)

A complete, production-ready software stack for a local hardware-based AI companion device featuring an iPhone-style **Dynamic Island** desktop UI, real-time voice interaction, and an Okudagram retro-futuristic telemetry dashboard.

---

## 🌟 Features

- **Dynamic Island Desktop App (Electron)**:
  - **Compact Pill State (120px × 40px)**: Sleek top-center floating pill showing minimal connection status, voice wave activity, and thinking spinner.
  - **Expanded Dashboard State (400px × 320px)**: Expands into full Okudagram dashboard with rotating 3D orbital canvas, SVG segmented dial, vertical controls, and neural chat.
  - **Global Hotkey & Tray**: Press `Ctrl+Shift+Y` to toggle island state, or click outside the window to automatically collapse to pill mode.
- **Offline Local LLM Engine**: Powered by Ollama (`llama3.2:1b` or custom models) for private, zero-latency responses.
- **Voice Interactivity**: Speech-to-Text (`faster-whisper`) and text-to-speech audio synthesis out loud.
- **Real-Time WebSockets**: Low-latency audio streaming and system telemetry outputs.

---

## 📂 Clean Project Architecture

```text
ai-companion-device/
├── main.js                  # Electron main process (Dynamic Island IPC & window management)
├── preload.js               # Secure IPC contextBridge preload script
├── start-companion.bat      # 1-click automated batch launcher
├── package.json             # Electron & root launcher scripts
├── backend/
│   ├── main.py              # FastAPI server, REST & WebSocket endpoints
│   ├── ai_engine.py         # Ollama LLM integration & streaming engine
│   ├── voice_pipeline.py    # Speech-To-Text (Faster-Whisper) & TTS synth
│   └── config.py            # Pydantic configuration & environment settings
├── ui/
│   ├── index.html           # HTML template
│   ├── package.json         # React UI Node.js dependencies
│   ├── vite.config.js       # Vite build & server config
│   └── src/
│       ├── main.jsx         # React DOM root entry point
│       ├── App.jsx          # Dynamic Island & Okudagram React UI component
│       └── styles.css       # Glassmorphism & Okudagram styling
├── requirements.txt         # Python dependencies
├── .env.example             # Example environment variables template
└── README.md                # Project documentation & execution guide
```

---

## 🚀 Quickstart Guide

### 1-Click Automated Launch (Recommended)
Simply double-click **`start-companion.bat`** (or run `.\start-companion.bat` in PowerShell).

This automatically cleans up ports, launches Ollama, starts the FastAPI backend, initializes Vite, and opens the Dynamic Island Electron app at the top of your screen!

### Manual Terminal Launch
From the project root:
```powershell
# Single-command concurrent startup:
npm run dev
```

---

## ⌨️ Controls & Shortcuts

| Action | Shortcut / Trigger |
| :--- | :--- |
| **Expand / Collapse Island** | Click compact pill OR press `Ctrl+Shift+Y` |
| **Collapse to Pill** | Click outside the window (Blur event) OR click top-right `✕` button |
| **System Tray Menu** | Right-click taskbar tray icon for Show/Hide & Toggle options |
| **Voice Push-To-Talk** | Click `recon (voice)` button in expanded panel |

---

## 📡 API & WebSocket Specification

| Endpoint | Type | Description |
| :--- | :--- | :--- |
| `GET /api/health` | REST | Checks system status, Ollama model availability & audio devices |
| `GET /api/config` | REST | Retrieves active hardware and audio settings |
| `POST /api/chat` | REST | Non-streaming text chat endpoint (`{ "prompt": "..." }`) |
| `POST /api/stt` | REST | Upload WAV audio file for Whisper transcription |
| `POST /api/tts` | REST | Synthesize text to speech audio WAV stream |
| `WS /ws/audio` | WebSocket | Low-latency audio stream, STT transcription, and LLM text tokens |
| `WS /ws/terminal` | WebSocket | Real-time hardware telemetry and server logs stream |

---

## 📄 License
MIT License. Free for open hardware implementation and personal modification.
