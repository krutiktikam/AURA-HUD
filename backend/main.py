import sys
import os

# --- MUST BE AT THE VERY TOP BEFORE ANY BACKEND IMPORTS ---
if getattr(sys, 'frozen', False):
    # PyInstaller extracts files to sys._MEIPASS
    # The backend package is located directly in sys._MEIPASS when we build from the project root
    bundle_dir = sys._MEIPASS
    if bundle_dir not in sys.path:
        sys.path.insert(0, bundle_dir)
else:
    # Development environment: Add project root (parent directory of backend)
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    if project_root not in sys.path:
        sys.path.insert(0, project_root)

# --- YOUR OTHER IMPORTS BELOW THIS LINE ---
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.config import settings
from backend.voice_pipeline import voice_pipeline
from backend.clipboard_store import add_clipboard_entry, get_recent_history, search_history
from backend.agent.router import router as agent_router

import asyncio
import json
import time
import logging
from typing import List, Dict, Any, Optional
import psutil

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("MainServer")

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="Hardware AI Companion Backend Server with Real-time Voice & Touchscreen UI support"
)

# Enable CORS for hardware UI and web clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic Request Models
class ChatRequest(BaseModel):
    prompt: str
    history: Optional[List[Dict[str, str]]] = None

class TTSRequest(BaseModel):
    text: str

class ConfigUpdateRequest(BaseModel):
    audio_input_device_index: Optional[int] = None
    audio_output_device_index: Optional[int] = None
    whisper_model_size: Optional[str] = None
    ollama_model: Optional[str] = None

@app.get("/")
async def root():
    return {
        "status": "online",
        "device": settings.APP_NAME,
        "version": "1.0.0",
        "endpoints": {
            "health": "/api/health",
            "config": "/api/config",
            "agent": "/api/agent/query",
            "stt_live": "/api/stt/live",
            "ws_terminal": "/ws/terminal",
            "clipboard": "/api/clipboard/*"
        }
    }

@app.get("/api/health")
async def health_check():
    """System health check including Ollama and audio devices."""
    # Import here to avoid circular imports
    from backend.utils.ollama_client import OllamaClient

    ollama = OllamaClient()
    ollama_status = await ollama.check_health()
    await ollama.close()

    devices = voice_pipeline.get_audio_devices()
    return {
        "system": "OK",
        "timestamp": time.time(),
        "ollama": ollama_status,
        "audio": {
            "devices_count": len(devices),
            "input_index": settings.AUDIO_INPUT_DEVICE_INDEX,
            "output_index": settings.AUDIO_OUTPUT_DEVICE_INDEX,
            "sample_rate": settings.SAMPLE_RATE,
            "stt_loaded": voice_pipeline.stt_model is not None
        }
    }

@app.get("/api/config")
async def get_config():
    """Get active configuration and hardware info."""
    return {
        "settings": settings.model_dump(),
        "audio_devices": voice_pipeline.get_audio_devices()
    }

@app.get("/api/system/telemetry")
async def get_system_telemetry():
    """Get system telemetry including CPU, RAM, and disk usage."""
    try:
        cpu = psutil.cpu_percent(interval=0.1)
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage(os.path.abspath(os.sep))
        return {
            "cpu": cpu,
            "ram": mem.percent,
            "disk": disk.percent,
            "timestamp": time.time()
        }
    except Exception as e:
        logger.error(f"Failed to get system telemetry: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/companion")
async def get_companion():
    """Get active companion metadata."""
    return {
        "name": settings.COMPANION_NAME,
        "model": settings.OLLAMA_MODEL,
        "memory_turns": 0  # No longer tracking memory in this simplified version
    }

@app.post("/api/companion/rename")
async def rename_companion(req: ChatRequest):  # Reusing ChatRequest for simplicity
    """Rename the AI companion."""
    # In a real implementation, this would update settings.COMPANION_NAME
    # For now, we'll just acknowledge the request
    return {"status": "success", "name": req.prompt}

@app.get("/api/memory")
async def get_memory():
    """Inspect active conversation memory."""
    # Simplified - no longer tracking conversation history
    return {
        "companion_name": settings.COMPANION_NAME,
        "count": 0,
        "history": []
    }

@app.post("/api/memory/clear")
async def clear_memory():
    """Clear active conversation memory."""
    # No-op since we're not tracking memory
    return {"status": "memory_cleared"}

@app.get("/api/clipboard/history")
async def get_clipboard_history(limit: int = 15):
    """Get recent clipboard entries from SQLite WAL."""
    return {"history": get_recent_history(limit=limit)}

@app.post("/api/clipboard/add")
async def add_clipboard(content: str = Form(...), category: Optional[str] = Form(None)):
    """Add a snippet to the SQLite WAL clipboard history."""
    result = add_clipboard_entry(content, category)
    return result

@app.get("/api/clipboard/search")
async def search_clipboard(q: str = "", limit: int = 5):
    """Search clipboard history for a query term."""
    return {"results": search_history(q, limit=limit)}

# Include the agent router
app.include_router(agent_router)

# Removed the old /api/chat endpoint - now using /api/agent/query

@app.post("/api/stt")
async def stt_endpoint(file: UploadFile = File(...)):
    """Convert uploaded audio file to text transcript."""
    content = await file.read()
    transcript = await voice_pipeline.transcribe_audio_bytes(content)
    return {"transcript": transcript}

@app.post("/api/tts")
async def tts_endpoint(req: TTSRequest):
    """Convert text into audio waveform stream bytes."""
    audio_bytes = await voice_pipeline.synthesize_tts(req.text)
    return {
        "text": req.text,
        "audio_len": len(audio_bytes),
        "format": "wav"
    }

# --------------------------------------------------------------------------
# WebSockets for Real-time Voice Interaction & Streaming
# --------------------------------------------------------------------------

class ConnectionManager:
    def __init__(self):
        self.active_audio_sockets: List[WebSocket] = []
        self.active_terminal_sockets: List[WebSocket] = []

    async def connect_audio(self, websocket: WebSocket):
        await websocket.accept()
        self.active_audio_sockets.append(websocket)

    def disconnect_audio(self, websocket: WebSocket):
        if websocket in self.active_audio_sockets:
            self.active_audio_sockets.remove(websocket)

    async def connect_terminal(self, websocket: WebSocket):
        await websocket.accept()
        self.active_terminal_sockets.append(websocket)

    def disconnect_terminal(self, websocket: WebSocket):
        if websocket in self.active_terminal_sockets:
            self.active_terminal_sockets.remove(websocket)

    async def broadcast_terminal(self, log_entry: Dict[str, Any]):
        for connection in list(self.active_terminal_sockets):
            try:
                await connection.send_json(log_entry)
            except Exception:
                self.disconnect_terminal(connection)

manager = ConnectionManager()

@app.websocket("/api/stt/live")
async def websocket_stt_live(websocket: WebSocket):
    """Real-time STT WebSocket endpoint with Faster-Whisper."""
    await manager.connect_audio(websocket)

    try:
        while True:
            data = await websocket.receive()

            if "bytes" in data and data["bytes"]:
                audio_bytes = data["bytes"]

                # Transcribe chunk with Faster-Whisper
                transcript = await voice_pipeline.transcribe_stream(audio_bytes)

                if transcript:
                    await websocket.send_json({
                        "event": "transcription",
                        "text": transcript
                    })

                    # Stream AI response using the new agent endpoint
                    await websocket.send_json({"event": "ai_start"})
                    full_reply = ""
                    async for token in generate_agent_response_stream(transcript):
                        full_reply += token
                        await websocket.send_json({
                            "event": "ai_token",
                            "token": token
                        })

                    await websocket.send_json({
                        "event": "ai_done",
                        "full_text": full_reply
                    })

            elif "text" in data and data["text"]:
                payload = json.loads(data["text"])
                if payload.get("type") == "chat":
                    prompt = payload.get("prompt", "")
                    await websocket.send_json({"event": "ai_start"})
                    full_reply = ""
                    async for token in generate_agent_response_stream(prompt):
                        full_reply += token
                        await websocket.send_json({
                            "event": "ai_token",
                            "token": token
                        })
                    await websocket.send_json({
                        "event": "ai_done",
                        "full_text": full_reply
                    })

    except WebSocketDisconnect:
        manager.disconnect_audio(websocket)
    except Exception as e:
        logger.error(f"WebSocket live STT error: {e}")
        manager.disconnect_audio(websocket)

async def generate_agent_response_stream(prompt: str):
    """Generate a streaming response from the agent endpoint."""
    # Import here to avoid circular imports
    from backend.utils.ollama_client import OllamaClient

    ollama = OllamaClient()
    try:
        async for chunk in ollama.generate_stream(prompt):
            yield chunk
    finally:
        await ollama.close()

@app.websocket("/ws/terminal")
async def websocket_terminal_endpoint(websocket: WebSocket):
    """Real-time terminal hardware telemetry logs connection."""
    await manager.connect_terminal(websocket)
    await websocket.send_json({
        "type": "log",
        "level": "SYSTEM",
        "source": "HARDWARE",
        "message": f"Terminal initialized. AURA Backend Online | Model: {settings.OLLAMA_MODEL}"
    })

    try:
        while True:
            cmd = await websocket.receive_text()
            if cmd == "ping":
                await websocket.send_json({
                    "type": "telemetry",
                    "level": "METRIC",
                    "source": "HARDWARE",
                    "message": f"Telemetry OK | Uptime active | Audio sample rate: {settings.SAMPLE_RATE}Hz"
                })
    except WebSocketDisconnect:
        manager.disconnect_terminal(websocket)

if __name__ == "__main__":
    import multiprocessing
    multiprocessing.freeze_support()
    import uvicorn

    if getattr(sys, "frozen", False):
        uvicorn.run(app, host=settings.HOST, port=settings.PORT, reload=False)
    else:
        uvicorn.run("backend.main:app", host=settings.HOST, port=settings.PORT, reload=True)