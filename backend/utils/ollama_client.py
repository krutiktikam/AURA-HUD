import asyncio
import json
import logging
import time
from typing import Any, AsyncIterator, Callable, Dict, List, Optional

import httpx

from backend.config import settings

logger = logging.getLogger(__name__)


class OllamaClient:
    def __init__(
        self,
        base_url: Optional[str] = None,
        timeout: Optional[float] = None,
        connect_timeout: Optional[float] = None,
        read_timeout: Optional[float] = None,
        transport: Optional[httpx.AsyncBaseTransport] = None,
        sleep: Optional[Callable[[float], Any]] = None,
        clock: Optional[Callable[[], float]] = None,
    ):
        self.base_url = (base_url or settings.OLLAMA_BASE_URL).rstrip("/")
        # Timeout and retry values are starting defaults, not tuned
        c_timeout = connect_timeout or timeout or settings.OLLAMA_CONNECT_TIMEOUT
        r_timeout = read_timeout or timeout or settings.OLLAMA_READ_TIMEOUT
        client_timeout = httpx.Timeout(connect=c_timeout, read=r_timeout, write=10.0, pool=5.0)
        self.client = httpx.AsyncClient(timeout=client_timeout, transport=transport)
        self.sleep = sleep or asyncio.sleep
        self.clock = clock or time.monotonic
        self._cached_health_state: Optional[str] = None
        self._health_state_timestamp: float = -1.0
        self._last_logged_health_state: Optional[str] = None

    async def generate(
        self,
        prompt: str,
        format: Optional[str] = None,
        options: Optional[Dict[str, Any]] = None,
    ) -> str:
        payload: Dict[str, Any] = {
            "model": settings.OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
        }
        if format:
            payload["format"] = format
        if options:
            payload["options"] = options

        max_retries = settings.OLLAMA_MAX_RETRIES
        backoff = settings.OLLAMA_RETRY_BACKOFF

        for attempt in range(max_retries + 1):
            try:
                response = await self.client.post(
                    f"{self.base_url}/api/generate",
                    json=payload,
                )
                response.raise_for_status()
                result = response.json()
                return result.get("response", "")
            except (httpx.ConnectError, httpx.ConnectTimeout):
                if attempt < max_retries:
                    await self.sleep(backoff * (2**attempt))
                    continue
                raise

        return ""

    async def generate_stream(
        self,
        prompt: str,
        format: Optional[str] = None,
        options: Optional[Dict[str, Any]] = None,
    ) -> AsyncIterator[str]:
        payload: Dict[str, Any] = {
            "model": settings.OLLAMA_MODEL,
            "prompt": prompt,
            "stream": True,
        }
        if format:
            payload["format"] = format
        if options:
            payload["options"] = options

        max_retries = settings.OLLAMA_MAX_RETRIES
        backoff = settings.OLLAMA_RETRY_BACKOFF

        response = None
        for attempt in range(max_retries + 1):
            try:
                req = self.client.build_request(
                    "POST",
                    f"{self.base_url}/api/generate",
                    json=payload,
                )
                response = await self.client.send(req, stream=True)
                response.raise_for_status()
                break
            except (httpx.ConnectError, httpx.ConnectTimeout):
                if attempt < max_retries:
                    await self.sleep(backoff * (2**attempt))
                    continue
                raise

        if response is None:
            return

        try:
            async for line in response.aiter_lines():
                clean_line = line.strip()
                if not clean_line:
                    continue
                try:
                    data = json.loads(clean_line)
                    if "response" in data:
                        yield data["response"]
                except json.JSONDecodeError:
                    continue
        finally:
            await response.aclose()

    async def chat(
        self,
        messages: List[Dict[str, Any]],
        format: Optional[str] = None,
        options: Optional[Dict[str, Any]] = None,
    ) -> str:
        payload: Dict[str, Any] = {
            "model": settings.OLLAMA_MODEL,
            "messages": messages,
            "stream": False,
        }
        if format:
            payload["format"] = format
        if options:
            payload["options"] = options

        max_retries = settings.OLLAMA_MAX_RETRIES
        backoff = settings.OLLAMA_RETRY_BACKOFF

        for attempt in range(max_retries + 1):
            try:
                response = await self.client.post(
                    f"{self.base_url}/api/chat",
                    json=payload,
                )
                response.raise_for_status()
                result = response.json()
                return result.get("message", {}).get("content", "")
            except (httpx.ConnectError, httpx.ConnectTimeout):
                if attempt < max_retries:
                    await self.sleep(backoff * (2**attempt))
                    continue
                raise

        return ""

    async def health_state(self) -> str:
        """Return health state: 'ok', 'down', or 'model_missing'."""
        now = self.clock()
        if self._cached_health_state is not None and (now - self._health_state_timestamp) < 2.0:
            return self._cached_health_state

        state = "down"
        try:
            response = await self.client.get(
                f"{self.base_url}/api/tags",
                timeout=settings.OLLAMA_HEALTH_TIMEOUT,
            )
            if response.status_code == 200:
                data = response.json()
                model_names = [m.get("name", "") for m in data.get("models", [])]
                target = settings.OLLAMA_MODEL
                target_latest = f"{target}:latest" if not target.endswith(":latest") else target
                target_base = target[:-7] if target.endswith(":latest") else target

                is_present = any(
                    m == target or m == target_latest or m == target_base
                    for m in model_names
                )
                state = "ok" if is_present else "model_missing"
            else:
                state = "down"
        except Exception:
            state = "down"

        if state != self._last_logged_health_state:
            logger.info(
                "Ollama health state changed: %s -> %s",
                self._last_logged_health_state,
                state,
            )
            self._last_logged_health_state = state

        self._cached_health_state = state
        self._health_state_timestamp = now
        return state

    async def health_check(self) -> bool:
        """Check if Ollama is running and configured model is available."""
        state = await self.health_state()
        return state == "ok"

    check_health = health_check

    async def close(self):
        await self.client.aclose()
