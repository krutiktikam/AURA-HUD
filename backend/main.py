import os
import sys

# --- MUST BE AT THE VERY TOP BEFORE ANY BACKEND IMPORTS ---
if getattr(sys, 'frozen', False):
    bundle_dir = sys._MEIPASS
    if bundle_dir not in sys.path:
        sys.path.insert(0, bundle_dir)
else:
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    if project_root not in sys.path:
        sys.path.insert(0, project_root)

# --- YOUR OTHER IMPORTS BELOW THIS LINE ---
import json
import logging
import time
from contextlib import asynccontextmanager
from typing import List, Mapping, Optional

import httpx
import psutil
from fastapi import (
    Depends,
    FastAPI,
    HTTPException,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from pydantic import BaseModel

from backend.agent.router import router as agent_router
from backend.clipboard_store import (
    add_clipboard_entry,
    db_ok,
    get_recent_history,
    init_db,
    search_history,
)
from backend.config import settings
from backend.security import (
    authenticate_websocket,
    get_allowed_origins,
    load_api_token,
    require_token,
)
from backend.utils.ollama_client import OllamaClient
from backend.voice_pipeline import STTUnavailableError, voice_pipeline

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("MainServer")





@asynccontextmanager

async def lifespan(app: FastAPI):

    # Initialize API token (fails closed if missing or < 32 characters)

    app.state.api_token = load_api_token()

    # Initialize SQLite database schema

    init_db()

    # Initialize shared OllamaClient

    app.state.ollama_client = OllamaClient()

    app.state.start_time = time.monotonic()

    yield

    # Cleanup shared client on shutdown

    client = getattr(app.state, "ollama_client", None)

    if client:

        await client.close()





app = FastAPI(

    title=settings.APP_NAME,

    version="1.0.0",

    description=(

        "Hardware AI Companion Backend Server with Real-time Voice & Touchscreen UI support"

    ),

    lifespan=lifespan,

    docs_url=None,

    redoc_url=None,

    openapi_url=None,

)



# Enable CORS for hardware UI and web clients

app.add_middleware(

    CORSMiddleware,

    allow_origins=list(get_allowed_origins()),

    allow_credentials=False,

    allow_methods=["GET", "POST", "OPTIONS"],

    allow_headers=["Authorization", "Content-Type"],

)

app.add_middleware(

    TrustedHostMiddleware,

    allowed_hosts=["127.0.0.1", "localhost"],

)





@app.get("/api/health", dependencies=[Depends(require_token)])

async def health_check(request: Request):

    """System health check including Ollama, STT, and database status."""

    ollama: Optional[OllamaClient] = getattr(request.app.state, "ollama_client", None)

    if ollama:

        ollama_state = await ollama.health_state()

    else:

        temp_client = OllamaClient()

        ollama_state = await temp_client.health_state()

        await temp_client.close()



    ollama_status = ollama_state == "ok"



    pipeline = getattr(request.app.state, "voice_pipeline", None) or voice_pipeline

    stt_state = getattr(pipeline, "stt_state", "idle")



    is_db_ok = db_ok()

    db_state = "ok" if is_db_ok else "error"



    start_time = getattr(request.app.state, "start_time", None)

    uptime_s = (time.monotonic() - start_time) if start_time is not None else 0.0



    is_degraded = (ollama_state != "ok") or (stt_state == "failed") or (db_state != "ok")

    status = "degraded" if is_degraded else "ok"



    return {

        "status": status,

        "system": "OK",

        "timestamp": time.time(),

        "uptime_s": uptime_s,

        "ollama": ollama_status,

        "ollama_state": ollama_state,

        "stt_state": stt_state,

        "db_state": db_state,

        "audio": {

            "devices_count": 0,

            "input_index": settings.AUDIO_INPUT_DEVICE_INDEX,

            "output_index": settings.AUDIO_OUTPUT_DEVICE_INDEX,

            "sample_rate": settings.SAMPLE_RATE,

            "stt_loaded": getattr(pipeline, "stt_model", None) is not None,

        },

    }





@app.get("/api/system/telemetry", dependencies=[Depends(require_token)])

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

            "timestamp": time.time(),

        }

    except Exception as err:

        logger.error(f"Failed to get system telemetry: {err}")

        raise HTTPException(status_code=500, detail=str(err)) from err





@app.get("/api/clipboard/history", dependencies=[Depends(require_token)])

async def get_clipboard_history(limit: int = 15):

    """Get recent clipboard entries from SQLite WAL."""

    return {"history": get_recent_history(limit=limit)}





class ClipboardAddRequest(BaseModel):

    content: str

    category: Optional[str] = None





@app.post("/api/clipboard/add", dependencies=[Depends(require_token)])

async def add_clipboard(req: ClipboardAddRequest):

    """Add a snippet to the SQLite WAL clipboard history."""

    result = add_clipboard_entry(req.content, req.category)

    return result





@app.get("/api/clipboard/search", dependencies=[Depends(require_token)])

async def search_clipboard(q: str = "", limit: int = 5):

    """Search clipboard history for a query term."""

    return {"results": search_history(q, limit=limit)}





# Include the agent router

app.include_router(agent_router, dependencies=[Depends(require_token)])





# --------------------------------------------------------------------------

# WebSockets for Real-time Voice Interaction & Streaming

# --------------------------------------------------------------------------



class ConnectionManager:

    def __init__(self):

        self.active_audio_sockets: List[WebSocket] = []



    async def connect_audio(self, websocket: WebSocket):

        self.active_audio_sockets.append(websocket)



    def disconnect_audio(self, websocket: WebSocket):

        if websocket in self.active_audio_sockets:

            self.active_audio_sockets.remove(websocket)





manager = ConnectionManager()





async def generate_agent_response_stream(prompt: str, ollama: OllamaClient):
    """Generate a streaming response from the agent endpoint."""
    async for chunk in ollama.generate_stream(prompt):
        yield chunk


async def _reply(websocket: WebSocket, prompt: str, ollama: Optional[OllamaClient]):
    """Send streaming response over websocket for a prompt using shared OllamaClient."""
    if not prompt or not ollama:
        await websocket.send_json({"event": "error", "code": "ai_service_unavailable"})
        return

    first_token = None
    stream = None
    try:
        stream = generate_agent_response_stream(prompt, ollama)
        first_token = await anext(stream, None)
    except httpx.TimeoutException as err:
        logger.error(f"AI response timeout before first token: {err}")
        await websocket.send_json({"event": "error", "code": "ai_timeout"})
        return
    except Exception as err:
        logger.error(f"AI response stream error before first token: {err}")
        await websocket.send_json({"event": "error", "code": "ai_service_unavailable"})
        return

    await websocket.send_json({"event": "ai_start"})
    full_reply = ""
    if first_token is not None:
        full_reply += first_token
        await websocket.send_json({
            "event": "ai_token",
            "token": first_token,
        })

    try:
        async for token in stream:
            full_reply += token
            await websocket.send_json({
                "event": "ai_token",
                "token": token,
            })
        await websocket.send_json({
            "event": "ai_done",
            "full_text": full_reply,
        })
    except Exception as err:
        logger.error(f"AI response stream error after first token: {err}")
        await websocket.send_json({
            "event": "error",
            "code": "ai_stream_interrupted",
        })


@app.websocket("/api/stt/live")
async def websocket_stt_live(websocket: WebSocket):
    """Real-time STT WebSocket endpoint with Faster-Whisper."""
    if not await authenticate_websocket(websocket):
        return
    await manager.connect_audio(websocket)

    try:
        while True:
            data = await websocket.receive()
            ollama = (
                getattr(websocket.app.state, "ollama_client", None)
                or getattr(app.state, "ollama_client", None)
            )
            pipeline = (
                getattr(websocket.app.state, "voice_pipeline", None)
                or getattr(app.state, "voice_pipeline", None)
                or voice_pipeline
            )

            if "bytes" in data and data["bytes"]:
                audio_bytes = data["bytes"]

                try:
                    transcript = await pipeline.transcribe_stream(audio_bytes)
                except STTUnavailableError:
                    await websocket.send_json({"event": "error", "code": "stt_unavailable"})
                    continue

                if transcript:
                    await websocket.send_json({
                        "event": "transcription",
                        "text": transcript,
                    })
                    await _reply(websocket, transcript, ollama)

            elif "text" in data and data["text"]:
                try:
                    payload = json.loads(data["text"])
                except Exception:
                    await websocket.send_json({"event": "error", "code": "bad_request"})
                    continue

                if not isinstance(payload, dict):
                    await websocket.send_json({"event": "error", "code": "bad_request"})
                    continue

                if payload.get("type") == "chat":
                    prompt = payload.get("prompt", "")
                    await _reply(websocket, prompt, ollama)
                else:
                    await websocket.send_json({"event": "error", "code": "bad_request"})

    except WebSocketDisconnect:
        manager.disconnect_audio(websocket)
    except Exception as e:
        logger.error(f"WebSocket live STT error: {e}")
        manager.disconnect_audio(websocket)


def reload_enabled(environ: Mapping[str, str] = os.environ) -> bool:

    """Return True if auto-reload is enabled via AURA_RELOAD=1 and build is not frozen."""

    if getattr(sys, "frozen", False):

        return False

    return environ.get("AURA_RELOAD") == "1"





if __name__ == "__main__":

    import multiprocessing

    multiprocessing.freeze_support()

    import uvicorn



    if getattr(sys, "frozen", False):

        uvicorn.run(app, host=settings.HOST, port=settings.PORT, reload=False, access_log=False)

    else:

        reload = reload_enabled(os.environ)

        uvicorn.run(
            "backend.main:app",
            host=settings.HOST,
            port=settings.PORT,
            reload=reload,
            access_log=False,
        )

