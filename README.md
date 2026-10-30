![CI](https://github.com/krutiktikam/AURA-HUD/actions/workflows/ci.yml/badge.svg)
# ⚡ AURA HUD — Cursor-Anchored AI Desktop Companion & Productivity Engine

> **A modern, 100% private and offline AI HUD built with Tauri v2 (Rust), React 18, Tailwind CSS v4, FastAPI, LangChain, and SQLite WAL.**  
> Anchored directly to your OS cursor via global hotkey (`Ctrl+Shift+A` / `Ctrl+Shift+Space`), featuring zero-latency clipboard intelligence, real-time voice streaming, and local LLM tool execution.

---

## 🌟 Executive System Architecture

```mermaid
graph TD
    subgraph "OS Cursor & Clipboard Layer"
        UserTrigger([Global Hotkey: Ctrl+Shift+A / Ctrl+Shift+Space]) --> CursorPos[OS Pointer Position: x, y]
        UserClipboard([OS System Clipboard]) --> ClipWatch[Zero-Latency Clipboard Monitor]
    end

    subgraph "Tauri v2 Native Desktop Engine (Rust)"
        CursorPos --> WindowAnchor[Native Screen-Clamped Positioner]
        ClipWatch --> RustClipIPC[arboard Clipboard Streamer]
        WindowAnchor --> WebviewHost[Hardware-Accelerated Webview]
    end

    subgraph "Reactive HUD UI (React 18 + Vite + Tailwind v4 + Framer Motion)"
        WebviewHost --> PaletteHUD[Cursor Context Palette 360px]
        PaletteHUD -->|Morph Spring Animation| ExpandedHUD[Tactical Landscape Dashboard 1113px]
        PaletteHUD --> ActionChips[Context Action Chips: Explain / Fix / Summarize / Format]
    end

    subgraph "Local Agent Server (FastAPI + LangChain + Ollama)"
        ActionChips -->|Async REST / WS| AgentGateway[FastAPI Gateway :8000]
        AgentGateway --> JarvisAgent[LangChain ReAct Agent Core]
        JarvisAgent --> Tool1[psutil Hardware Telemetry]
        JarvisAgent --> Tool2[Safe Terminal Sandbox Execution]
        JarvisAgent --> Tool3[SQLite WAL Clipboard Store & Search]
        JarvisAgent --> LocalLLM[Ollama Local Engine :11435 - Qwen2.5:1.5b / Llama3.2:1b]
    end

    subgraph "Real-Time Audio Pipeline (100% Offline)"
        MicStream([Microphone Audio Chunks]) -->|WebSocket Stream /api/stt/live| WhisperEngine[Faster-Whisper CTranslate2 STT]
        WhisperEngine --> LocalLLM
        LocalLLM --> SAPI5Voice([Female Voice TTS - SAPI5 / Zira])
    end
```

---

## 🛠️ Production Tech Stack Matrix

| Tier | Technology | Version | Role & Architectural Justification |
| :--- | :--- | :---: | :--- |
| **Desktop Core** | **Tauri v2 (Rust)** | `v2.11.3+` | Zero-overhead OS integration (<20MB RAM vs 250MB+ Electron). Handles native window positioning, system tray, and global hotkeys with C-level performance. |
| **OS Automation** | **Rust (`arboard` + native APIs)** | `0.3.x` | Zero-latency OS clipboard access without polling loops. Queries precise mouse pointer `(X, Y)` for exact popup placement. |
| **UI Framework** | **React 18** | `18.3.x` | Declarative, componentized tree for high-framerate rendering and state management. |
| **Build Engine** | **Vite** | `5.4.x` | Instant Hot Module Replacement (HMR) and optimized rollup production bundles. |
| **Styling** | **Tailwind CSS v4** | `4.3.x` | Modern utility CSS with hardware-accelerated transitions, dark glassmorphism, and minimal CSS runtime overhead. |
| **Motion Physics** | **Framer Motion** | `13.1.x` | Physics-based spring animations (`stiffness: 350, damping: 25`) for fluid morphing between cursor palette and expanded dashboard. |
| **Backend Gateway** | **FastAPI** | `0.110.x` | Asynchronous, low-latency Python ASGI server hosting REST endpoints and streaming WebSockets. |
| **Agent Framework** | **LangChain / ReAct** | `0.3.x` | Stateful agent execution pipeline with strict tool binding, conversation memory buffers, and hallucination filters. |
| **Local LLM Engine** | **Ollama** | `0.6.x` | 100% private offline inference (`llama3.2:1b`, `qwen2.5:1.5b`, `deepseek-r1:1.5b`) delivering 45–80 tokens/sec. |
| **Speech-to-Text** | **Faster-Whisper** | `1.0.x` | CTranslate2-accelerated offline Whisper implementation (~4x faster than standard PyTorch Whisper). |
| **Storage Engine** | **SQLite (WAL Mode)** | `3.45.x` | Embedded zero-configuration database with Write-Ahead Logging for non-blocking clipboard history and session persistence. |

---

## 🎯 Key Capabilities & Features

### 1. 🖱️ Cursor-Anchored AI Palette
- **Push-to-Start Standby Daemon**: Runs silently in the background with zero idle CPU.
- **Global Hotkey Summon (`Ctrl+Shift+A` / `Ctrl+Shift+Space`)**: Instantly snaps a sleek, floating glassmorphic palette directly beside your active mouse pointer.
- **Smart Screen Clamping**: Automatically detects multi-monitor edges and clamps popup boundaries to prevent off-screen clipping.

### 2. 📋 Context-Aware Clipboard Intelligence
- **Zero-Latency Content Detection**: Automatically reads copied snippets on summon without manual copy-pasting.
- **Dynamic Action Chips**:
  - **Code Detected** (`def`, `const`, `class`, `function`): ➔ **`[⚡ Explain Code]`**, **`[🛠️ Fix / Refactor]`**, **`[📝 Add Docs]`**
  - **Text / Prose Detected**: ➔ **`[📝 Summarize]`**, **`[📌 3 Bullet Points]`**, **`[✨ Proofread]`**
  - **JSON / Data Detected**: ➔ **`[🔧 Format JSON]`**, **`[✅ Validate]`**, **`[📊 Convert to Schema]`**
- **SQLite WAL History Store**: Search past clipboard history on demand (*"Find the regex I copied 15 minutes ago"*).

### 3. 🎙️ Real-Time Audio Streaming (100% Offline)
- **Live WebSocket STT Stream (`/api/stt/live`)**: `MediaRecorder` streams 500ms timeslices directly to local Faster-Whisper with Voice Activity Detection (VAD).
- **Female Voice Audio Synthesis**: Offline natural SAPI5 voice output (`Microsoft Zira Desktop`).

### 4. 🧠 Live Agent Memory & Personalization
- **Customizable Name**: Rename your companion anytime via the header (`◆ J.A.R.V.I.S.`, `◆ AURA`, `◆ FRIDAY`) with immediate prompt synchronization.
- **Working Memory Inspector**: Open the built-in HUD drawer to inspect active conversation turns and wipe context on demand.
- **Local System Sensors**: Built-in tools for real-time CPU, RAM, disk diagnostics (`psutil`) and safe terminal execution.

---

## 📁 Repository Structure

```text
ai-companion-device/
├── src-tauri/                   # Rust Native Desktop Engine (Tauri v2)
│   ├── src/main.rs              # Cursor positioning, clipboard IPC, tray, global shortcuts
│   ├── Cargo.toml               # Rust dependencies (tauri, arboard, serde, tauri-plugins)
│   ├── tauri.conf.json          # Frameless, transparent, hardware-accelerated window specs
│   └── capabilities/            # Tauri v2 security & permission manifests
├── ui/                          # Modern React 18 Frontend
│   ├── src/
│   │   ├── App.jsx              # Cursor Palette + Morphing Tactical Landscape Dashboard
│   │   ├── ipcBridge.js         # Universal Desktop IPC Bridge (Tauri v2 & Electron fallback)
│   │   ├── main.jsx             # React application entry point
│   │   └── styles.css           # Tailwind CSS v4 directives & glassmorphism theme
│   ├── package.json             # Frontend dependencies (Framer Motion, Lucide, Tailwind v4)
│   └── vite.config.js           # Vite build pipeline
├── backend/                     # Python Local AI Server (FastAPI + LangChain)
│   ├── main.py                  # REST API & real-time WebSocket streaming endpoints
│   ├── agent.py                 # LangChain ReAct agent core, tools & memory management
│   ├── clipboard_store.py       # SQLite WAL clipboard history database
│   ├── ai_engine.py             # Ollama local LLM inference connector
│   ├── voice_pipeline.py        # Faster-Whisper STT (CTranslate2) & pyttsx3/SAPI5 TTS
│   └── config.py                # Environment configuration & behavior prompts
├── tests/                       # Automated Test Suite
│   ├── test_agent_behavior.py   # Latency, context recall, and hallucination benchmark suite
│   ├── run_tests.bat            # 1-Click test suite runner
│   └── test_report.json         # Automated diagnostic output report
├── main.js                      # Universal Electron fallback wrapper
├── start-companion.bat          # 1-Click developer launcher
└── requirements.txt             # Python backend dependencies
```

---

## 🚀 Quickstart & Setup

### Prerequisites
1. **Node.js** (v18+)
2. **Python** (v3.10+)
3. **Ollama** installed locally ([ollama.ai](https://ollama.ai))
   ```bash
   ollama pull llama3.2:1b
   # or for ultra-fast reasoning:
   ollama pull qwen2.5:1.5b
   ```

### 1. Installation
```powershell
# Install Node dependencies
npm install
cd ui && npm install && cd ..

# Setup Python Virtual Environment
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Launch the Application (1-Click)
```powershell
.\start-companion.bat
```
*This boots the Ollama service, starts the FastAPI Whisper/LangChain server, and launches the desktop HUD.*

---

## ⌨️ Global Controls & Shortcuts

| Action | Shortcut / Trigger | Description |
| :--- | :--- | :--- |
| **Summon Cursor HUD** | `Ctrl + Shift + A` or `Ctrl + Shift + Space` | Snaps contextual palette to current mouse cursor coordinates |
| **Toggle Full Dashboard** | `Ctrl + Shift + Y` or click Expand | Expands into full 1113×385 landscape diagnostic dashboard |
| **Auto-Dismiss** | Press `Esc` or Click Outside | Instantly collapses back to silent background standby |
| **Push-to-Talk Stream** | Click `RECON (VOICE)` | Streams microphone audio over WebSocket to Faster-Whisper |
| **Inspect Memory** | Click `[🧠 MEMORY]` | Opens working memory inspector drawer |
| **Rename Assistant** | Click `✏️` in header | Renames companion and re-aligns prompt dynamically |

---

## 🧪 Testing & Verification

Run the automated behavioral and latency test suite:
```powershell
.\venv\Scripts\python.exe tests/test_agent_behavior.py
```
*Evaluates practical responses, tool execution accuracy, memory window persistence, and guarantees `< 3.0s` local response latency with 100% test pass rate.*

---

## 📄 License
MIT License. Built for high-performance desktop productivity and modern AI systems engineering.
