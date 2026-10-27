import json

import httpx
from fastapi.testclient import TestClient

from backend.main import app
from backend.utils.ollama_client import OllamaClient


def test_router_happy_path(client: TestClient):
    valid_payload = {
        "response": "Here is the answer.",
        "intent": "GENERAL_CHAT",
        "confidence": 0.95,
        "metadata": {"source": "test"},
    }

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"response": json.dumps(valid_payload)})

    app.state.ollama_client = OllamaClient(transport=httpx.MockTransport(handler))

    res = client.post("/api/agent/query", json={"prompt": "hello"})
    assert res.status_code == 200
    data = res.json()
    assert data["response"] == "Here is the answer."
    assert data["intent"] == "GENERAL_CHAT"
    assert data["confidence"] == 0.95


def test_router_malformed_json_502(client: TestClient):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"response": "{malformed_json_string"})

    app.state.ollama_client = OllamaClient(transport=httpx.MockTransport(handler))

    res = client.post("/api/agent/query", json={"prompt": "hello"})
    assert res.status_code == 502
    assert res.json()["detail"] == "Invalid AI service response"


def test_router_unknown_intent_502(client: TestClient):
    invalid_intent_payload = {
        "response": "Hello",
        "intent": "UNKNOWN_NOT_REAL_INTENT",
        "confidence": 0.9,
    }

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"response": json.dumps(invalid_intent_payload)})

    app.state.ollama_client = OllamaClient(transport=httpx.MockTransport(handler))

    res = client.post("/api/agent/query", json={"prompt": "hello"})
    assert res.status_code == 502
    assert res.json()["detail"] == "Invalid AI service response"


def test_router_ollama_down_503(client: TestClient):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("Connection refused")

    app.state.ollama_client = OllamaClient(transport=httpx.MockTransport(handler))

    res = client.post("/api/agent/query", json={"prompt": "hello"})
    assert res.status_code == 503
    assert res.json()["detail"] == "AI service unavailable"


def test_router_timeout_504(client: TestClient):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("Read timed out")

    app.state.ollama_client = OllamaClient(transport=httpx.MockTransport(handler))

    res = client.post("/api/agent/query", json={"prompt": "hello"})
    assert res.status_code == 504
    assert res.json()["detail"] == "AI service request timed out"
