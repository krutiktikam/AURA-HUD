import httpx
import json
import logging
from typing import Dict, Any, Optional, AsyncIterator

from backend.config import settings

logger = logging.getLogger(__name__)

class OllamaClient:
    def __init__(self, base_url: Optional[str] = None):
        self.base_url = base_url or settings.OLLAMA_BASE_URL
        self.client = httpx.AsyncClient(timeout=30.0)

    async def generate(
        self,
        prompt: str,
        format: Optional[str] = None,
        options: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Generate a response from Ollama.
        :param prompt: The input prompt.
        :param format: The format to use (e.g., "json").
        :param options: Additional options for the model.
        :return: The generated text.
        """
        payload = {
            "model": settings.OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
        }
        if format:
            payload["format"] = format
        if options:
            payload["options"] = options

        try:
            response = await self.client.post(
                f"{self.base_url}/api/generate",
                json=payload
            )
            response.raise_for_status()
            result = response.json()
            return result.get("response", "")
        except Exception as e:
            logger.error(f"Ollama generation failed: {e}")
            raise

    async def generate_stream(
        self,
        prompt: str,
        format: Optional[str] = None,
        options: Optional[Dict[str, Any]] = None
    ) -> AsyncIterator[str]:
        """
        Generate a streaming response from Ollama.
        :param prompt: The input prompt.
        :param format: The format to use (e.g., "json").
        :param options: Additional options for the model.
        :yield: Chunks of generated text.
        """
        payload = {
            "model": settings.OLLAMA_MODEL,
            "prompt": prompt,
            "stream": True,
        }
        if format:
            payload["format"] = format
        if options:
            payload["options"] = options

        try:
            async with self.client.stream(
                "POST",
                f"{self.base_url}/api/generate",
                json=payload
            ) as response:
                response.raise_for_status()
                async for chunk in response.aiter_bytes():
                    if chunk:
                        # Parse the JSON line and extract the response
                        try:
                            line = chunk.decode('utf-8').strip()
                            if line:
                                data = json.loads(line)
                                if "response" in data:
                                    yield data["response"]
                        except json.JSONDecodeError:
                            # Skip invalid JSON lines
                            continue
        except Exception as e:
            logger.error(f"Ollama generation stream failed: {e}")
            raise

    async def chat(
        self,
        messages: list,
        format: Optional[str] = None,
        options: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Chat with Ollama (using the chat endpoint).
        :param messages: List of message dicts.
        :param format: The format to use (e.g., "json").
        :param options: Additional options for the model.
        :return: The generated text.
        """
        payload = {
            "model": settings.OLLAMA_MODEL,
            "messages": messages,
            "stream": False,
        }
        if format:
            payload["format"] = format
        if options:
            payload["options"] = options

        try:
            response = await self.client.post(
                f"{self.base_url}/api/chat",
                json=payload
            )
            response.raise_for_status()
            result = response.json()
            return result.get("message", {}).get("content", "")
        except Exception as e:
            logger.error(f"Ollama chat failed: {e}")
            raise

    async def health_check(self) -> bool:
        """Check if Ollama is running and the model is available."""
        try:
            response = await self.client.get(f"{self.base_url}/api/tags")
            response.raise_for_status()
            data = response.json()
            # Check if the model is in the list
            model_names = [m["name"] for m in data.get("models", [])]
            return settings.OLLAMA_MODEL in model_names
        except Exception as e:
            logger.error(f"Ollama health check failed: {e}")
            return False

    check_health = health_check

    async def close(self):
        await self.client.aclose()