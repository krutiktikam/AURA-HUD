import logging
import time
from typing import List, Tuple

import httpx
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from backend.config import settings
from backend.main import app
from backend.utils.ollama_client import OllamaClient
from tests.conftest import TEST_API_TOKEN, AuthenticatedTestClient


def _collect_http_routes() -> List[Tuple[str, str]]:
    """Enumerate all HTTP (method, path) endpoints in the application."""
    routes: List[Tuple[str, str]] = []

    def _traverse(route_list):
        for r in route_list:
            if hasattr(r, "methods") and hasattr(r, "path"):
                for method in r.methods:
                    if method not in ("HEAD", "OPTIONS") and not r.path.startswith(
                        ("/docs", "/redoc", "/openapi.json")
                    ):
                        routes.append((method, r.path))
            elif hasattr(r, "routes"):
                _traverse(r.routes)
            elif hasattr(r, "original_router"):
                _traverse(r.original_router.routes)

    _traverse(app.routes)
    return routes


def _collect_ws_routes() -> List[str]:
    """Enumerate all WebSocket paths in the application."""
    routes: List[str] = []

    def _traverse(route_list):
        for r in route_list:
            if hasattr(r, "path") and not hasattr(r, "methods"):
                routes.append(r.path)
            elif hasattr(r, "routes"):
                _traverse(r.routes)
            elif hasattr(r, "original_router"):
                _traverse(r.original_router.routes)

    _traverse(app.routes)
    return routes


HTTP_ROUTES = _collect_http_routes()
WS_ROUTES = _collect_ws_routes()


# --------------------------------------------------------------------------
# 5a. Every HTTP route returns 401 with no token and with a wrong token
# --------------------------------------------------------------------------
@pytest.mark.parametrize("method,path", HTTP_ROUTES)
def test_all_http_routes_require_authentication(method: str, path: str):
    app.state.api_token = TEST_API_TOKEN
    client = TestClient(app, base_url="http://127.0.0.1")

    # 1. No token supplied
    response_no_token = client.request(method, path)
    assert response_no_token.status_code == 401, (
        f"{method} {path} did not reject unauthenticated request with 401"
    )

    # 2. Wrong token supplied
    response_wrong_token = client.request(
        method,
        path,
        headers={"Authorization": "Bearer invalid_secret_token_value_12345"},
    )
    assert response_wrong_token.status_code == 401, (
        f"{method} {path} did not reject invalid token with 401"
    )


# --------------------------------------------------------------------------
# 5b. WebSocket route authentication flows
# --------------------------------------------------------------------------
@pytest.mark.parametrize("ws_path", WS_ROUTES)
def test_websocket_bad_origin_rejected_before_accept(ws_path: str):
    app.state.api_token = TEST_API_TOKEN
    client = AuthenticatedTestClient(app, base_url="http://127.0.0.1")

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(
            ws_path,
            auto_auth=False,
            headers={"Origin": "http://evil.example"},
        ):
            pass
    assert exc_info.value.code == 1008


@pytest.mark.parametrize("ws_path", WS_ROUTES)
def test_websocket_timeout_without_auth_closes_4401(
    ws_path: str, monkeypatch: pytest.MonkeyPatch
):
    app.state.api_token = TEST_API_TOKEN
    monkeypatch.setattr("backend.security.AUTH_TIMEOUT_SECONDS", 0.05)
    client = AuthenticatedTestClient(app, base_url="http://127.0.0.1")

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(ws_path, auto_auth=False) as ws:
            time.sleep(0.12)
            ws.receive_json()
    assert exc_info.value.code == 4401


@pytest.mark.parametrize("ws_path", WS_ROUTES)
def test_websocket_wrong_token_closes_4401(ws_path: str):
    app.state.api_token = TEST_API_TOKEN
    client = AuthenticatedTestClient(app, base_url="http://127.0.0.1")

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(ws_path, auto_auth=False) as ws:
            ws.send_json({"type": "auth", "token": "invalid_wrong_token_123456789"})
            ws.receive_json()
    assert exc_info.value.code == 4401


@pytest.mark.parametrize("ws_path", WS_ROUTES)
def test_websocket_valid_token_allows_chat_stream(ws_path: str):
    app.state.api_token = TEST_API_TOKEN

    def handler(request: httpx.Request) -> httpx.Response:
        content = b'{"response": "token1"}\n{"response": "token2"}\n'
        return httpx.Response(200, content=content)

    app.state.ollama_client = OllamaClient(transport=httpx.MockTransport(handler))
    client = AuthenticatedTestClient(app, base_url="http://127.0.0.1")

    with client.websocket_connect(ws_path, auto_auth=False) as ws:
        # Step 1: Send valid auth handshake
        ws.send_json({"type": "auth", "token": TEST_API_TOKEN})

        # Step 2: Send chat payload
        ws.send_json({"type": "chat", "prompt": "Hello assistant"})

        # Step 3: Verify streaming response
        msg1 = ws.receive_json()
        assert msg1 == {"event": "ai_start"}

        msg2 = ws.receive_json()
        assert msg2 == {"event": "ai_token", "token": "token1"}

        msg3 = ws.receive_json()
        assert msg3 == {"event": "ai_token", "token": "token2"}

        msg4 = ws.receive_json()
        assert msg4 == {"event": "ai_done", "full_text": "token1token2"}


# --------------------------------------------------------------------------
# 5c. Host header "evil.example" with a correct token is rejected
# --------------------------------------------------------------------------
def test_host_header_evil_example_rejected():
    app.state.api_token = TEST_API_TOKEN
    client = TestClient(app, base_url="http://127.0.0.1")

    response = client.get(
        "/api/health",
        headers={
            "Host": "evil.example",
            "Authorization": f"Bearer {TEST_API_TOKEN}",
        },
    )
    assert response.status_code == 400


# --------------------------------------------------------------------------
# 5d. CORS preflight behavior
# --------------------------------------------------------------------------
def test_cors_preflight_rejected_for_untrusted_origin():
    app.state.api_token = TEST_API_TOKEN
    client = TestClient(app, base_url="http://127.0.0.1")

    response = client.options(
        "/api/health",
        headers={
            "Origin": "http://evil.example",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization",
        },
    )
    assert "access-control-allow-origin" not in response.headers


def test_cors_preflight_allowed_for_trusted_origin():
    app.state.api_token = TEST_API_TOKEN
    client = TestClient(app, base_url="http://127.0.0.1")

    response = client.options(
        "/api/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization",
        },
    )
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"


# --------------------------------------------------------------------------
# 5e. Startup fails without AURA_API_TOKEN or with a short one
# --------------------------------------------------------------------------
def test_startup_fails_without_token(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("AURA_API_TOKEN", raising=False)
    with pytest.raises(RuntimeError):
        with TestClient(app, base_url="http://127.0.0.1"):
            pass


def test_startup_fails_with_short_token(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("AURA_API_TOKEN", "too_short_token_only_24_ch")
    with pytest.raises(RuntimeError):
        with TestClient(app, base_url="http://127.0.0.1"):
            pass


# --------------------------------------------------------------------------
# 5f. No token leakage in logs
# --------------------------------------------------------------------------
def test_no_token_leakage_in_logs(
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
):
    real_token = "genuine_secure_token_12345678901234567890_test"
    wrong_token = "attacker_forged_token_09876543210987654321_leak"

    caplog.set_level(logging.DEBUG)
    monkeypatch.setenv("AURA_API_TOKEN", real_token)

    # 1. Startup phase
    with AuthenticatedTestClient(
        app,
        base_url="http://127.0.0.1",
        headers={"Authorization": f"Bearer {real_token}"},
    ) as client:
        # 2. Rejected HTTP call with wrong token
        client.get(
            "/api/health",
            headers={"Authorization": f"Bearer {wrong_token}"},
        )

        # 3. Rejected WebSocket call with wrong token
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/api/stt/live", auto_auth=False) as ws:
                ws.send_json({"type": "auth", "token": wrong_token})
                ws.receive_json()

    # Assert neither real nor client-supplied wrong token appears anywhere in log records
    for record in caplog.records:
        message = record.getMessage()
        assert real_token not in message, "Real API token leaked in log message"
        assert wrong_token not in message, "Supplied wrong token leaked in log message"
        assert real_token not in str(record.args), "Real API token leaked in log args"
        assert wrong_token not in str(record.args), "Supplied wrong token leaked in log args"


# --------------------------------------------------------------------------
# 5g. settings.CORS_ORIGINS contains no wildcard "*"
# --------------------------------------------------------------------------
def test_cors_origins_contains_no_wildcard():
    assert "*" not in settings.CORS_ORIGINS
    for origin in settings.CORS_ORIGINS:
        assert "*" not in origin, f"Origin {origin} contains wildcard '*'"
