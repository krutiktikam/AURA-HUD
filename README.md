# Hardware AI Companion Device

A complete, production-ready software stack for a local hardware-based AI companion device with real-time voice interaction, code assistance, and a touchscreen dashboard.

---

## 🌟 Features

- **Offline Local LLM Engine**: Powered by Ollama (`llama3.2:1b` or customized GGUF models) with streaming responses.
- **Speech-to-Text Pipeline**: High-speed offline transcription utilizing `faster-whisper`.
- **Real-Time WebSockets**: Low-latency voice streaming and live hardware telemetry/log output.
- **Touch-Optimized UI Dashboard**: Dark-mode industrial interface built with Vite + React featuring:
  - 🎙️ **Voice Waveform Visualizer**: Live HTML5 canvas rendering audio input and playback state.
  - 💻 **Code Assistant View**: Syntax-highlighted code output box with 1-tap clipboard copying.
  - 📟 **Terminal Telemetry View**: Real-time console log viewer and interactive CLI prompt.

---

## 📂 Project Architecture

```text
ai-companion-device/
├── backend/
│   ├── __init__.py
│   ├── main.py              # FastAPI server, REST & WebSocket endpoints
│   ├── ai_engine.py         # Ollama LLM integration & streaming engine
│   ├── voice_pipeline.py    # Speech-To-Text (Faster-Whisper) & TTS synth
│   └── config.py            # Pydantic configuration & environment settings
├── ui/
│   ├── App.jsx              # React touchscreen dashboard component
│   ├── styles.css           # Industrial dark mode hardware styling
│   ├── index.html           # HTML template
│   ├── package.json         # Node.js dependencies
│   ├── vite.config.js       # Vite build & server config
│   └── src/
│       ├── main.jsx         # React DOM root entry point
│       ├── App.jsx          # Embedded app source
│       └── styles.css       # Embedded app styles
├── requirements.txt         # Python dependencies
├── .env.example             # Example environment variables template
└── README.md                # Project documentation & execution guide
```

---

## 🛠️ Environment Configuration

Create a `.env` file in the project root directory (or use default configuration):

```env
# Application Settings
APP_NAME="Hardware AI Companion"
DEBUG=true
HOST="0.0.0.0"
PORT=8000

# Audio Input / Output Device Indices
AUDIO_INPUT_DEVICE_INDEX=0
AUDIO_OUTPUT_DEVICE_INDEX=0
SAMPLE_RATE=16000

# Faster-Whisper Model Settings
WHISPER_MODEL_SIZE="base"
WHISPER_DEVICE="cpu"
WHISPER_COMPUTE_TYPE="int8"

# Ollama LLM Server
OLLAMA_BASE_URL="http://localhost:11434"
OLLAMA_MODEL="llama3.2:1b"
```

---

## 🚀 Step-by-Step Quickstart Guide

### 1. Prerequisites
- **Python**: 3.10+
- **Node.js**: 18+ & `npm`
- **Ollama**: Download and install from [ollama.com](https://ollama.com)

### 2. Prepare Local LLM Model (Ollama)
Ensure Ollama is running and pull the lightweight Llama 3.2 1B model:
```bash
ollama serve
ollama pull llama3.2:1b
```

### 3. Setup Python Backend Environment
```bash
# Create and activate virtual environment
python -m venv venv

#venv\Scripts\activate On Windows:

# On Linux/macOS:
source venv/bin/activate

# Install Python requirements
pip install -r requirements.txt
```

> **Note for PyAudio installation**:
> - **Windows**: PyAudio wheel is included via `pip install pyaudio`.
> - **Linux / Raspberry Pi**: Install portaudio header first: `sudo apt-get install portaudio19-dev python3-pyaudio`.

### 4. Start the FastAPI Server
From the root directory:
```bash
python -m backend.main
# Or run with uvicorn reloader:
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```
The REST API and WebSockets will be live at `http://localhost:8000`.
- API Docs (Swagger UI): `http://localhost:8000/docs`
- Health Endpoint: `http://localhost:8000/api/health`

### 5. Launch the Touchscreen UI Dashboard
Open a new terminal window:
```bash
cd ui
npm install
npm run dev
```
Open your browser or touchscreen display target at `http://localhost:3000`.

---

## 📡 API & WebSocket Specification

| Endpoint | Type | Description |
| :--- | :--- | :--- |
| `GET /api/health` | REST | Checks system status, Ollama model availability & PyAudio devices |
| `GET /api/config` | REST | Retrieves active hardware and audio settings |
| `POST /api/chat` | REST | Non-streaming text chat endpoint (`{ "prompt": "..." }`) |
| `POST /api/stt` | REST | Upload WAV audio file for Whisper transcription |
| `POST /api/tts` | REST | Synthesize text to speech audio WAV stream |
| `WS /ws/audio` | WebSocket | Low-latency audio stream, STT transcription, and LLM text tokens |
| `WS /ws/terminal` | WebSocket | Real-time hardware telemetry and server logs stream |

---

## 🧪 Testing & Verification

1. **Test REST Chat Endpoint**:
   ```bash
   curl -X POST "http://localhost:8000/api/chat" \
        -H "Content-Type: application/json" \
        -d '{"prompt": "Hello AI Companion!"}'
   ```
2. **Verify Hardware Health**:
   ```bash
   curl "http://localhost:8000/api/health"
   ```

---

## 📄 License
MIT License. Free for open hardware implementation and personal modification.
