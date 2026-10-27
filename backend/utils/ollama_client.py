import json
import logging
from typing import Any, AsyncIterator, Dict, List, Optional

import httpx

from backend.config import settings

logger = logging.getLogger(__name__)


class OllamaClient:
    def __init__(
        self,
        base_url: Optional[str] = None,
        timeout: Optional[float] = None,
        transport: Optional[httpx.AsyncBaseTransport] = None,
    ):
        self.base_url = (base_url or settings.OLLAMA_BASE_URL).rstrip("/")
        timeout_val = timeout if timeout is not None else settings.API_TIMEOUT_SECONDS
        self.client = httpx.AsyncClient(timeout=timeout_val, transport=transport)

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

        response = await self.client.post(
            f"{self.base_url}/api/generate",
            json=payload,
        )
        response.raise_for_status()
        result = response.json()
        return result.get("response", "")

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

        async with self.client.stream(
            "POST",
            f"{self.base_url}/api/generate",
            json=payload,
        ) as response:
            response.raise_for_status()
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

        response = await self.client.post(
            f"{self.base_url}/api/chat",
            json=payload,
        )
        response.raise_for_status()
        result = response.json()
        return result.get("message", {}).get("content", "")

    async def health_check(self) -> bool:
        """Check if Ollama is running and the model is available."""
        try:
            response = await self.client.get(f"{self.base_url}/api/tags")
            response.raise_for_status()
            data = response.json()
            model_names = [m["name"] for m in data.get("models", [])]
            return settings.OLLAMA_MODEL in model_names
        except Exception as e:
            logger.error(f"Ollama health check failed: {e}")
            return False

    check_health = health_check

    async def close(self):
        await self.client.aclose()
