from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from enum import Enum
import json
import logging

from backend.utils.ollama_client import OllamaClient
from backend.models.intent import IntentCategory

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agent", tags=["Agent"])

class AgentQueryRequest(BaseModel):
    prompt: str = Field(..., description="User input prompt")
    context: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Additional context for the agent"
    )
    intent: Optional[IntentCategory] = Field(
        default=None,
        description="Explicit intent category if known"
    )

class AgentResponse(BaseModel):
    response: str
    intent: IntentCategory
    confidence: float = Field(
        ...,
        description="Confidence score between 0 and 1",
        ge=0,
        le=1
    )
    metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Additional metadata about the response"
    )

@router.post("/query", response_model=AgentResponse)
async def query_agent(request: AgentQueryRequest):
    try:
        # Initialize Ollama client
        ollama = OllamaClient()

        # Prepare the prompt with JSON mode
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
                        "GENERAL_CHAT"
                    ]
                },
                "confidence": {"type": "number"},
                "metadata": {"type": "object"}
            },
            "required": ["response", "intent", "confidence"]
        }

        # Build the system prompt
        system_prompt = f"""
        You are an AI assistant for AURA HUD. Analyze the user's request and respond with a structured JSON object.

        Intent Categories:
        - CLIPBOARD_ACTION: Actions related to clipboard content
        - KNOWLEDGE_QUERY: Questions about stored knowledge or facts
        - SYSTEM_DIAGNOSTIC: Requests for system status or diagnostics
        - GENERAL_CHAT: General conversation or requests

        Respond with a JSON object matching this schema:
        {json.dumps(json_schema, indent=2)}
        """

        # Combine prompts
        full_prompt = f"{system_prompt}\n\nUser Request: {request.prompt}"

        # Call Ollama with JSON mode
        response = await ollama.generate(
            prompt=full_prompt,
            format="json",
            options={"temperature": 0.3}
        )

        # Parse and validate the response
        try:
            parsed = json.loads(response)
            return AgentResponse(
                response=parsed["response"],
                intent=IntentCategory(parsed["intent"]),
                confidence=parsed["confidence"],
                metadata=parsed.get("metadata")
            )
        except (json.JSONDecodeError, KeyError) as e:
            logger.error(f"Failed to parse Ollama response: {e}")
            raise HTTPException(
                status_code=500,
                detail="Failed to parse AI response"
            )

    except Exception as e:
        logger.error(f"Agent query failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )