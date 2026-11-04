import httpx
import pytest

from backend.config import settings
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
async def test_connect_error_twice_then_success():
    call_count = 0
    recorded_sleeps = []

    async def mock_sleep(seconds: float):
        recorded_sleeps.append(seconds)

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            raise httpx.ConnectError("Connection refused by test", request=request)
        return httpx.Response(200, json={"response": "success after retry"})

    client = OllamaClient(transport=httpx.MockTransport(handler), sleep=mock_sleep)
    try:
        result = await client.generate("test prompt")
        assert result == "success after retry"
        assert call_count == 3
        assert recorded_sleeps == [0.25, 0.5]
    finally:
        await client.close()


@pytest.mark.asyncio
async def test_always_connect_error_raises_after_max_retries():
    call_count = 0
    recorded_sleeps = []

    async def mock_sleep(seconds: float):
        recorded_sleeps.append(seconds)

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        raise httpx.ConnectError("Always connection refused", request=request)

    client = OllamaClient(transport=httpx.MockTransport(handler), sleep=mock_sleep)
    try:
        with pytest.raises(httpx.ConnectError):
            await client.generate("test prompt")
        assert call_count == 3
        assert recorded_sleeps == [0.25, 0.5]
    finally:
        await client.close()


@pytest.mark.asyncio
async def test_read_timeout_not_retried():
    call_count = 0
    recorded_sleeps = []

    async def mock_sleep(seconds: float):
        recorded_sleeps.append(seconds)

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        raise httpx.ReadTimeout("Read timed out", request=request)

    client = OllamaClient(transport=httpx.MockTransport(handler), sleep=mock_sleep)
    try:
        with pytest.raises(httpx.ReadTimeout):
            await client.generate("test prompt")
        assert call_count == 1
        assert recorded_sleeps == []
    finally:
        await client.close()


@pytest.mark.asyncio
async def test_stream_retried_before_first_byte_but_not_after_first_token():
    calls_part1 = 0
    sleeps_part1 = []

    async def mock_sleep1(seconds: float):
        sleeps_part1.append(seconds)

    def handler_part1(request: httpx.Request) -> httpx.Response:
        nonlocal calls_part1
        calls_part1 += 1
        if calls_part1 == 1:
            raise httpx.ConnectError("Failed before first byte", request=request)
        return httpx.Response(200, content=b'{"response": "token1"}\n{"response": "token2"}\n')

    client1 = OllamaClient(transport=httpx.MockTransport(handler_part1), sleep=mock_sleep1)
    try:
        tokens = [t async for t in client1.generate_stream("test")]
        assert tokens == ["token1", "token2"]
        assert calls_part1 == 2
        assert sleeps_part1 == [0.25]
    finally:
        await client1.close()

    calls_part2 = 0
    sleeps_part2 = []

    async def mock_sleep2(seconds: float):
        sleeps_part2.append(seconds)

    def handler_part2(request: httpx.Request) -> httpx.Response:
        nonlocal calls_part2
        calls_part2 += 1

        async def body():
            yield b'{"response": "tokenA"}\n'
            raise httpx.ReadTimeout("Stream read timeout mid-stream", request=request)

        return httpx.Response(200, content=body())

    client2 = OllamaClient(transport=httpx.MockTransport(handler_part2), sleep=mock_sleep2)
    try:
        received = []
        with pytest.raises(httpx.ReadTimeout):
            async for t in client2.generate_stream("test"):
                received.append(t)
        assert received == ["tokenA"]
        assert calls_part2 == 1
        assert sleeps_part2 == []
    finally:
        await client2.close()


@pytest.mark.asyncio
async def test_health_state_variants_and_caching():
    # ok exact match
    def ok_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"models": [{"name": settings.OLLAMA_MODEL}]})

    client = OllamaClient(transport=httpx.MockTransport(ok_handler))
    try:
        assert await client.health_state() == "ok"
    finally:
        await client.close()

    # down on connection failure
    def down_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("Ollama unreachable", request=request)

    client = OllamaClient(transport=httpx.MockTransport(down_handler))
    try:
        assert await client.health_state() == "down"
    finally:
        await client.close()

    # model_missing
    def missing_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"models": [{"name": "other-model:latest"}]})

    client = OllamaClient(transport=httpx.MockTransport(missing_handler))
    try:
        assert await client.health_state() == "model_missing"
    finally:
        await client.close()

    # :latest matching
    def latest_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"models": [{"name": f"{settings.OLLAMA_MODEL}:latest"}]})

    client = OllamaClient(transport=httpx.MockTransport(latest_handler))
    try:
        assert await client.health_state() == "ok"
    finally:
        await client.close()

    # cache hit (2 calls within max_age = 1 request)
    call_count = 0
    current_time = 100.0

    def clock():
        return current_time

    def counting_handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(200, json={"models": [{"name": settings.OLLAMA_MODEL}]})

    client = OllamaClient(transport=httpx.MockTransport(counting_handler), clock=clock)
    try:
        state1 = await client.health_state()
        assert state1 == "ok"
        assert call_count == 1

        # Advance time by 0.5s (< 2.0s cache window) -> Cache hit
        current_time += 0.5
        state2 = await client.health_state()
        assert state2 == "ok"
        assert call_count == 1

        # Advance time by 2.0s -> Cache expired
        current_time += 2.0
        state3 = await client.health_state()
        assert state3 == "ok"
        assert call_count == 2
    finally:
        await client.close()
