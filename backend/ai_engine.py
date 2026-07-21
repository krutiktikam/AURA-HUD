import asyncio
import json
import logging
from typing import AsyncGenerator, List, Dict, Any, Optional
import httpx

try:
    import ollama
    HAS_OLLAMA_SDK = True
except ImportError:
    HAS_OLLAMA_SDK = False

from backend.config import settings

logger = logging.getLogger("AIEngine")
logging.basicConfig(level=logging.INFO)

class AIEngine:
    """Ollama AI Engine wrapper supporting streaming and offline fallback mode."""

    def __init__(self, base_url: str = settings.OLLAMA_BASE_URL, model: str = settings.OLLAMA_MODEL):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.system_prompt = settings.SYSTEM_PROMPT

    async def check_health(self) -> Dict[str, Any]:
        """Check if Ollama server is running and if model is available."""
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.get(f"{self.base_url}/api/tags")
                if res.status_code == 200:
                    data = res.json()
                    models = [m.get("name") for m in data.get("models", [])]
                    model_available = any(self.model in m for m in models)
                    return {
                        "online": True,
                        "model": self.model,
                        "model_available": model_available,
                        "installed_models": models
                    }
        except Exception as e:
            logger.warning(f"Ollama server health check failed: {e}")
        
        return {
            "online": False,
            "model": self.model,
            "model_available": False,
            "installed_models": []
        }

    def _prepare_messages(self, user_prompt: str, history: Optional[List[Dict[str, str]]] = None) -> List[Dict[str, str]]:
        messages = [{"role": "system", "content": self.system_prompt}]
        if history:
            messages.extend(history)
        messages.append({"role": "user", "content": user_prompt})
        return messages

    async def generate_response_stream(
        self,
        prompt: str,
        history: Optional[List[Dict[str, str]]] = None
    ) -> AsyncGenerator[str, None]:
        """Stream response tokens from local Ollama LLM."""
        messages = self._prepare_messages(prompt, history)
        health = await self.check_health()
        
        if not health["online"]:
            fallback_msg = (
                "[OFFLINE MODE] Ollama server is currently offline or unreachable. "
                "Please start Ollama service using `ollama serve` and ensure model is installed: "
                f"`ollama pull {self.model}`."
            )
            for word in fallback_msg.split(" "):
                yield word + " "
                await asyncio.sleep(0.04)
            return

        # Attempt to stream via HTTP API endpoint
        url = f"{self.base_url}/api/chat"
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": True
        }

        try:
            async with httpx.AsyncClient(timeout=settings.API_TIMEOUT_SECONDS) as client:
                async with client.stream("POST", url, json=payload) as response:
                    if response.status_code != 200:
                        yield f"Error: Ollama returned status {response.status_code}"
                        return

                    async for line in response.aiter_lines():
                        if line:
                            try:
                                chunk = json.loads(line)
                                token = chunk.get("message", {}).get("content", "")
                                if token:
                                    yield token
                            except json.JSONDecodeError:
                                continue
        except Exception as e:
            logger.error(f"Error during AI streaming: {e}")
            yield f"\n[AI Engine Error: {str(e)}]"

    async def generate_response(
        self,
        prompt: str,
        history: Optional[List[Dict[str, str]]] = None
    ) -> str:
        """Non-streaming generation."""
        full_text = ""
        async for token in self.generate_response_stream(prompt, history):
            full_text += token
        return full_text

# Singleton instance
ai_engine = AIEngine()
