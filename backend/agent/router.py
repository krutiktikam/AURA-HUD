import json
import logging
from typing import Any, Dict, Optional

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from backend.models.intent import IntentCategory
from backend.utils.ollama_client import OllamaClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agent", tags=["Agent"])


class AgentQueryRequest(BaseModel):
    prompt: str = Field(..., description="User input prompt")
    context: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Additional context for the agent",
    )
    intent: Optional[IntentCategory] = Field(
        default=None,
        description="Explicit intent category if known",
    )


class AgentResponse(BaseModel):
    response: str
    intent: IntentCategory
    confidence: float = Field(
        ...,
        description="Confidence score between 0 and 1",
        ge=0,
        le=1,
    )
    metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Additional metadata about the response",
    )


@router.post("/query", response_model=AgentResponse)
async def query_agent(request: AgentQueryRequest, req: Request):
    # Retrieve shared client or instantiate fallback
    ollama: OllamaClient = getattr(req.app.state, "ollama_client", None) or OllamaClient()

    json_schema = {
        "type": "object",
        "properties": {
            "response": {"type": "string"},
            "intent": {
                "type": "string",
                "enum": [
                    "CLIPBOARD_ACTION",
                    "KNOWLEDGE_QUERY",
                    "SYSTEM_DIAGNOSTIC",
                    "GENERAL_CHAT",
                ],
            },
            "confidence": {"type": "number"},
            "metadata": {"type": "object"},
        },
        "required": ["response", "intent", "confidence"],
    }

    system_prompt = f"""
    You are an AI assistant for AURA HUD. Analyze the request and respond with JSON.

    Intent Categories:
    - CLIPBOARD_ACTION: Actions related to clipboard content
    - KNOWLEDGE_QUERY: Questions about stored knowledge or facts
    - SYSTEM_DIAGNOSTIC: Requests for system status or diagnostics
    - GENERAL_CHAT: General conversation or requests

    Respond with a JSON object matching this schema:
    {json.dumps(json_schema, indent=2)}
    """

    full_prompt = f"{system_prompt}\n\nUser Request: {request.prompt}"

    try:
        raw_response = await ollama.generate(
            prompt=full_prompt,
            format="json",
            options={"temperature": 0.3},
        )
    except httpx.ConnectError as e:
        logger.error(f"Failed to connect to AI service: {e}")
        raise HTTPException(status_code=503, detail="AI service unavailable") from None
    except httpx.TimeoutException as e:
        logger.error(f"AI service request timed out: {e}")
        raise HTTPException(status_code=504, detail="AI service request timed out") from None
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI service error during generate: {e}")
        raise HTTPException(status_code=500, detail="Internal server error") from None

    try:
        parsed = json.loads(raw_response)
        if not isinstance(parsed, dict):
            raise ValueError("Parsed JSON is not an object")
        if "response" not in parsed or "intent" not in parsed or "confidence" not in parsed:
            raise KeyError("Missing required fields in model response")
        return AgentResponse(
            response=str(parsed["response"]),
            intent=IntentCategory(parsed["intent"]),
            confidence=float(parsed["confidence"]),
            metadata=parsed.get("metadata"),
        )
    except (json.JSONDecodeError, KeyError, ValueError, TypeError) as e:
        logger.error(f"Failed to parse or validate Ollama response: {e}")
        raise HTTPException(
            status_code=502,
            detail="Invalid AI service response",
        ) from None
