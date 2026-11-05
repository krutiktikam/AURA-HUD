from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from backend.config import settings
from backend.main import app
from backend.utils.ollama_client import OllamaClient
from tests.conftest import FakeVoicePipeline


def test_health_ollama_up(client: TestClient):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/tags"
        return httpx.Response(200, json={"models": [{"name": settings.OLLAMA_MODEL}]})

    app.state.ollama_client = OllamaClient(transport=httpx.MockTransport(handler))
    app.state.voice_pipeline = FakeVoicePipeline(available=True)

    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()

    assert data["status"] == "ok"
    assert data["system"] == "OK"
    assert isinstance(data["timestamp"], (int, float))
    assert isinstance(data["uptime_s"], (int, float))
    assert data["ollama"] is True
    assert data["ollama_state"] == "ok"
    assert data["stt_state"] == "ready"
    assert data["db_state"] == "ok"
    assert "audio" not in data


def test_health_ollama_down(client: TestClient):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("Ollama offline")

    app.state.ollama_client = OllamaClient(transport=httpx.MockTransport(handler))
    app.state.voice_pipeline = FakeVoicePipeline(available=True)

    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()

    assert data["status"] == "degraded"
    assert data["system"] == "OK"
    assert isinstance(data["timestamp"], (int, float))
    assert data["ollama"] is False
    assert data["ollama_state"] == "down"


def test_health_ollama_model_missing(client: TestClient):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"models": [{"name": "completely-different-model"}]})

    app.state.ollama_client = OllamaClient(transport=httpx.MockTransport(handler))
    app.state.voice_pipeline = FakeVoicePipeline(available=True)

    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()

    assert data["status"] == "degraded"
    assert data["ollama"] is False
    assert data["ollama_state"] == "model_missing"


def test_health_stt_failed(client: TestClient):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"models": [{"name": settings.OLLAMA_MODEL}]})

    app.state.ollama_client = OllamaClient(transport=httpx.MockTransport(handler))
    app.state.voice_pipeline = FakeVoicePipeline(available=False)

    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()

    assert data["status"] == "degraded"
    assert data["stt_state"] == "failed"


@patch("psutil.cpu_percent")
def test_system_telemetry_cpu_percent(mock_cpu_percent, client: TestClient):
    mock_cpu_percent.return_value = 15.0

    res = client.get("/api/system/telemetry")
    assert res.status_code == 200
    data = res.json()
    assert data["cpu"] == 15.0
    mock_cpu_percent.assert_called_with(interval=None)

