import httpx
from fastapi.testclient import TestClient

from backend.main import app
from backend.utils.ollama_client import OllamaClient
from tests.conftest import FakeVoicePipeline


def test_websocket_text_chat_streams_in_order(client: TestClient):
    def handler(request: httpx.Request) -> httpx.Response:
        content = b'{"response": "token1"}\n{"response": "token2"}\n'
        return httpx.Response(200, content=content)

    app.state.ollama_client = OllamaClient(transport=httpx.MockTransport(handler))

    with client.websocket_connect("/api/stt/live") as websocket:
        websocket.send_json({"type": "chat", "prompt": "Hi"})

        msg1 = websocket.receive_json()
        assert msg1 == {"event": "ai_start"}

        msg2 = websocket.receive_json()
        assert msg2 == {"event": "ai_token", "token": "token1"}

        msg3 = websocket.receive_json()
        assert msg3 == {"event": "ai_token", "token": "token2"}

        msg4 = websocket.receive_json()
        assert msg4 == {"event": "ai_done", "full_text": "token1token2"}


def test_websocket_audio_bytes_with_fake_stt(client: TestClient):
    def handler(request: httpx.Request) -> httpx.Response:
        content = b'{"response": "answer"}\n'
        return httpx.Response(200, content=content)

    app.state.ollama_client = OllamaClient(transport=httpx.MockTransport(handler))
    app.state.voice_pipeline = FakeVoicePipeline(available=True, transcript="voice transcription")

    with client.websocket_connect("/api/stt/live") as websocket:
        websocket.send_bytes(b"\x00\x01\x02\x03")

        msg_trans = websocket.receive_json()
        assert msg_trans == {"event": "transcription", "text": "voice transcription"}

        msg_start = websocket.receive_json()
        assert msg_start == {"event": "ai_start"}

        msg_token = websocket.receive_json()
        assert msg_token == {"event": "ai_token", "token": "answer"}

        msg_done = websocket.receive_json()
        assert msg_done == {"event": "ai_done", "full_text": "answer"}


def test_websocket_stt_unavailable_returns_error_event(client: TestClient):
    # Pipeline that raises STTUnavailableError
    app.state.voice_pipeline = FakeVoicePipeline(available=False)

    with client.websocket_connect("/api/stt/live") as websocket:
        websocket.send_bytes(b"\x00\x01\x02\x03")

        err_msg = websocket.receive_json()
        assert err_msg == {"event": "error", "code": "stt_unavailable"}

        # Socket should remain open and accept subsequent messages
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, content=b'{"response": "ok"}\n')

        app.state.ollama_client = OllamaClient(transport=httpx.MockTransport(handler))
        websocket.send_json({"type": "chat", "prompt": "still alive"})
        msg_start = websocket.receive_json()
        assert msg_start == {"event": "ai_start"}


def test_websocket_ollama_connect_error_returns_error_event_and_keeps_open(client: TestClient):
    def connect_error_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("Failed to connect to Ollama", request=request)

    app.state.ollama_client = OllamaClient(transport=httpx.MockTransport(connect_error_handler))

    with client.websocket_connect("/api/stt/live") as websocket:
        websocket.send_json({"type": "chat", "prompt": "trigger connect error"})

        err_msg = websocket.receive_json()
        assert err_msg.get("event") == "error"
        assert err_msg.get("code") == "ai_service_unavailable"

        # Assert socket is still open by sending a subsequent request with working transport
        def ok_handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, content=b'{"response": "recovered"}\n')

        app.state.ollama_client = OllamaClient(transport=httpx.MockTransport(ok_handler))
        websocket.send_json({"type": "chat", "prompt": "are you there?"})

        msg_start = websocket.receive_json()
        assert msg_start == {"event": "ai_start"}
        msg_token = websocket.receive_json()
        assert msg_token == {"event": "ai_token", "token": "recovered"}
        msg_done = websocket.receive_json()
        assert msg_done == {"event": "ai_done", "full_text": "recovered"}


def test_websocket_ai_timeout_returns_error_event_and_keeps_open(client: TestClient):
    def timeout_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("Timeout before first token", request=request)

    app.state.ollama_client = OllamaClient(transport=httpx.MockTransport(timeout_handler))

    with client.websocket_connect("/api/stt/live") as websocket:
        websocket.send_json({"type": "chat", "prompt": "will timeout"})

        err_msg = websocket.receive_json()
        assert err_msg == {"event": "error", "code": "ai_timeout"}

        # Socket remains open
        def ok_handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, content=b'{"response": "works now"}\n')

        app.state.ollama_client = OllamaClient(transport=httpx.MockTransport(ok_handler))
        websocket.send_json({"type": "chat", "prompt": "retry"})

        assert websocket.receive_json() == {"event": "ai_start"}
        assert websocket.receive_json() == {"event": "ai_token", "token": "works now"}
        assert websocket.receive_json() == {"event": "ai_done", "full_text": "works now"}


def test_websocket_ai_stream_interrupted_then_recovers(client: TestClient):
    def midstream_fail_handler(request: httpx.Request) -> httpx.Response:
        async def body():
            yield b'{"response": "chunk1"}\n'
            raise httpx.ReadTimeout("Stream read failed mid-stream", request=request)

        return httpx.Response(200, content=body())

    app.state.ollama_client = OllamaClient(transport=httpx.MockTransport(midstream_fail_handler))

    with client.websocket_connect("/api/stt/live") as websocket:
        websocket.send_json({"type": "chat", "prompt": "stream fail"})

        assert websocket.receive_json() == {"event": "ai_start"}
        assert websocket.receive_json() == {"event": "ai_token", "token": "chunk1"}
        assert websocket.receive_json() == {"event": "error", "code": "ai_stream_interrupted"}

        # Subsequent message works
        def ok_handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, content=b'{"response": "next chunk"}\n')

        app.state.ollama_client = OllamaClient(transport=httpx.MockTransport(ok_handler))
        websocket.send_json({"type": "chat", "prompt": "try again"})

        assert websocket.receive_json() == {"event": "ai_start"}
        assert websocket.receive_json() == {"event": "ai_token", "token": "next chunk"}
        assert websocket.receive_json() == {"event": "ai_done", "full_text": "next chunk"}


def test_websocket_bad_request_returns_error_and_keeps_open(client: TestClient):
    def ok_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b'{"response": "valid"}\n')

    app.state.ollama_client = OllamaClient(transport=httpx.MockTransport(ok_handler))

    with client.websocket_connect("/api/stt/live") as websocket:
        # Invalid JSON string
        websocket.send_text("not a json string")
        assert websocket.receive_json() == {"event": "error", "code": "bad_request"}

        # Valid JSON but not an object (e.g. array)
        websocket.send_text("[1, 2, 3]")
        assert websocket.receive_json() == {"event": "error", "code": "bad_request"}

        # Object with invalid / missing type
        websocket.send_json({"type": "unknown_type"})
        assert websocket.receive_json() == {"event": "error", "code": "bad_request"}

        # Subsequent valid message succeeds
        websocket.send_json({"type": "chat", "prompt": "hello"})
        assert websocket.receive_json() == {"event": "ai_start"}
        assert websocket.receive_json() == {"event": "ai_token", "token": "valid"}
        assert websocket.receive_json() == {"event": "ai_done", "full_text": "valid"}


