import asyncio
import json
import time
import logging
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.config import settings
from backend.ai_engine import ai_engine
from backend.voice_pipeline import voice_pipeline

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
            "chat": "/api/chat",
            "ws_audio": "/ws/audio",
            "ws_terminal": "/ws/terminal"
        }
    }

@app.get("/api/health")
async def health_check():
    """System health check including Ollama and audio devices."""
    ollama_status = await ai_engine.check_health()
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

@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest):
    """REST endpoint for AI model response."""
    response_text = await ai_engine.generate_response(req.prompt, req.history)
    return {"response": response_text}

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
# WebSockets for Real-time Voice Interaction & Terminal Hardware Stream
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

@app.websocket("/ws/audio")
async def websocket_audio_endpoint(websocket: WebSocket):
    """Real-time voice streaming websocket connection."""
    await manager.connect_audio(websocket)
    await manager.broadcast_terminal({
        "type": "log",
        "level": "INFO",
        "source": "VOICE_WS",
        "message": "Client voice stream connected."
    })
    
    try:
        while True:
            # Receive either text command or binary PCM audio payload
            data = await websocket.receive()
            
            if "bytes" in data and data["bytes"]:
                # Process audio chunk
                audio_bytes = data["bytes"]
                transcript = await voice_pipeline.transcribe_audio_bytes(audio_bytes)
                
                await websocket.send_json({
                    "event": "transcription",
                    "text": transcript
                })
                
                await manager.broadcast_terminal({
                    "type": "stt",
                    "level": "STT",
                    "source": "WHISPER",
                    "message": f"Recognized: '{transcript}'"
                })

                # Stream LLM response
                await websocket.send_json({"event": "ai_start"})
                full_reply = ""
                async for token in ai_engine.generate_response_stream(transcript):
                    full_reply += token
                    await websocket.send_json({
                        "event": "ai_token",
                        "token": token
                    })
                
                await websocket.send_json({
                    "event": "ai_done",
                    "full_text": full_reply
                })

                await manager.broadcast_terminal({
                    "type": "llm",
                    "level": "LLM",
                    "source": "OLLAMA",
                    "message": f"Generated {len(full_reply)} chars"
                })

            elif "text" in data and data["text"]:
                payload = json.loads(data["text"])
                msg_type = payload.get("type", "chat")
                user_text = payload.get("prompt", "")

                if msg_type == "chat":
                    await websocket.send_json({"event": "ai_start"})
                    full_reply = ""
                    async for token in ai_engine.generate_response_stream(user_text, payload.get("history")):
                        full_reply += token
                        await websocket.send_json({
                            "event": "ai_token",
                            "token": token
                        })
                    
                    await websocket.send_json({
                        "event": "ai_done",
                        "full_text": full_reply
                    })

                    await manager.broadcast_terminal({
                        "type": "log",
                        "level": "INFO",
                        "source": "LLM",
                        "message": f"Streamed response for prompt: '{user_text[:30]}...'"
                    })

    except WebSocketDisconnect:
        manager.disconnect_audio(websocket)
        await manager.broadcast_terminal({
            "type": "log",
            "level": "WARN",
            "source": "VOICE_WS",
            "message": "Client voice stream disconnected."
        })
    except Exception as e:
        logger.error(f"WebSocket voice error: {e}")
        manager.disconnect_audio(websocket)

@app.websocket("/ws/terminal")
async def websocket_terminal_endpoint(websocket: WebSocket):
    """Real-time terminal hardware telemetry logs connection."""
    await manager.connect_terminal(websocket)
    # Initial status banner
    await websocket.send_json({
        "type": "log",
        "level": "SYSTEM",
        "source": "HARDWARE",
        "message": f"Terminal initialized. Companion hardware status: ONLINE | Model: {settings.OLLAMA_MODEL}"
    })
    
    try:
        while True:
            # Keep-alive heartbeat & listen for incoming commands
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
    import uvicorn
    uvicorn.run("backend.main:app", host=settings.HOST, port=settings.PORT, reload=True)
