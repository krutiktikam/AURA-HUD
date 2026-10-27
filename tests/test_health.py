import httpx
from fastapi.testclient import TestClient

from backend.config import settings
from backend.main import app
from backend.utils.ollama_client import OllamaClient


def test_health_ollama_up(client: TestClient):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/tags"
        return httpx.Response(200, json={"models": [{"name": settings.OLLAMA_MODEL}]})

    app.state.ollama_client = OllamaClient(transport=httpx.MockTransport(handler))

    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()

    assert data["system"] == "OK"
    assert isinstance(data["timestamp"], (int, float))
    assert data["ollama"] is True
    assert "audio" in data
    audio = data["audio"]
    assert "devices_count" in audio
    assert "input_index" in audio
    assert "output_index" in audio
    assert "sample_rate" in audio
    assert "stt_loaded" in audio


def test_health_ollama_down(client: TestClient):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("Ollama offline")

    app.state.ollama_client = OllamaClient(transport=httpx.MockTransport(handler))

    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()

    assert data["system"] == "OK"
    assert isinstance(data["timestamp"], (int, float))
    assert data["ollama"] is False
    assert "audio" in data
