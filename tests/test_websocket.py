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
