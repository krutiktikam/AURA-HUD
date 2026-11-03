from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, List

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.clipboard_store import init_db
from backend.config import settings
from backend.main import app
from backend.utils.ollama_client import OllamaClient
from backend.voice_pipeline import STTUnavailableError

TEST_API_TOKEN = "test_aura_secret_token_at_least_32_chars_long"


class FakeVoicePipeline:
    def __init__(self, available: bool = True, transcript: str = "fake transcription"):
        self.available = available
        self.transcript = transcript
        self.stt_model = object() if available else None

    async def transcribe_audio_bytes(self, audio_data: bytes, format: str = "wav") -> str:
        if not self.available:
            raise STTUnavailableError("STT service unavailable in fake pipeline")
        return self.transcript

    async def transcribe_stream(self, audio_chunk: bytes) -> str:
        if not self.available:
            raise STTUnavailableError("STT service unavailable in fake pipeline")
        return self.transcript

    def get_audio_devices(self) -> List[Dict[str, Any]]:
        return [{"id": 0, "name": "Fake Device", "inputs": 1, "outputs": 2}]


class AuthenticatedTestClient(TestClient):
    @contextmanager
    def websocket_connect(self, url, *args, auto_auth=True, **kwargs):
        if not url.startswith(("ws://", "wss://", "http://", "https://")):
            url = f"ws://127.0.0.1{url if url.startswith('/') else '/' + url}"
        with super().websocket_connect(url, *args, **kwargs) as ws:
            if auto_auth:
                ws.send_json({"type": "auth", "token": TEST_API_TOKEN})
            yield ws


@pytest.fixture
def test_token() -> str:
    return TEST_API_TOKEN


@pytest.fixture
def temp_db(tmp_path: Path):
    db_file = tmp_path / "test_clipboard.db"
    settings.CLIPBOARD_DB_PATH = str(db_file)
    init_db(db_file)
    yield db_file
    settings.CLIPBOARD_DB_PATH = None


@pytest.fixture
def fake_stt() -> FakeVoicePipeline:
    return FakeVoicePipeline(available=True, transcript="test transcription")


@pytest.fixture
def client(temp_db: Path, fake_stt: FakeVoicePipeline, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("AURA_API_TOKEN", TEST_API_TOKEN)
    app.state.api_token = TEST_API_TOKEN

    # Default transport returning valid health and empty tags
    def default_handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/tags":
            return httpx.Response(200, json={"models": [{"name": settings.OLLAMA_MODEL}]})
        return httpx.Response(200, json={"response": "default response"})

    mock_client = OllamaClient(transport=httpx.MockTransport(default_handler))
    app.state.ollama_client = mock_client
    app.state.voice_pipeline = fake_stt

    with AuthenticatedTestClient(
        app,
        base_url="http://127.0.0.1",
        headers={"Authorization": f"Bearer {TEST_API_TOKEN}"},
    ) as test_client:
        yield test_client
