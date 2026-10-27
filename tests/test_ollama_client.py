import httpx
import pytest

from backend.utils.ollama_client import OllamaClient


@pytest.mark.asyncio
async def test_generate_non_stream():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/generate"
        return httpx.Response(200, json={"response": "hello from ollama"})

    client = OllamaClient(transport=httpx.MockTransport(handler))
    try:
        result = await client.generate("test prompt")
        assert result == "hello from ollama"
    finally:
        await client.close()


@pytest.mark.asyncio
async def test_stream_multiline_chunk():
    def handler(request: httpx.Request) -> httpx.Response:
        content = b'{"response": "token1"}\n{"response": "token2"}\n'
        return httpx.Response(200, content=content)

    client = OllamaClient(transport=httpx.MockTransport(handler))
    try:
        tokens = [token async for token in client.generate_stream("test prompt")]
        assert tokens == ["token1", "token2"]
    finally:
        await client.close()


@pytest.mark.asyncio
async def test_stream_line_split_across_chunks():
    def handler(request: httpx.Request) -> httpx.Response:
        async def body_generator():
            yield b'{"response": "par'
            yield b'tial"}\n'

        return httpx.Response(200, content=body_generator())

    client = OllamaClient(transport=httpx.MockTransport(handler))
    try:
        tokens = [token async for token in client.generate_stream("test prompt")]
        assert tokens == ["partial"]
    finally:
        await client.close()


@pytest.mark.asyncio
async def test_stream_malformed_line_skipped():
    def handler(request: httpx.Request) -> httpx.Response:
        content = b'{"response": "first"}\n{not valid json}\n{"response": "second"}\n'
        return httpx.Response(200, content=content)

    client = OllamaClient(transport=httpx.MockTransport(handler))
    try:
        tokens = [token async for token in client.generate_stream("test prompt")]
        assert tokens == ["first", "second"]
    finally:
        await client.close()


@pytest.mark.asyncio
async def test_connect_error_raises():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("Connection refused by test")

    client = OllamaClient(transport=httpx.MockTransport(handler))
    try:
        with pytest.raises(httpx.ConnectError):
            await client.generate("test prompt")

        with pytest.raises(httpx.ConnectError):
            async for _ in client.generate_stream("test prompt"):
                pass
    finally:
        await client.close()
