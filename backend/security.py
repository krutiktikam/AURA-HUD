import asyncio
import json
import logging
import os
import secrets
from typing import Optional, Set

from fastapi import HTTPException, Request, WebSocket, status

from backend.config import settings

logger = logging.getLogger("backend.security")

AUTH_TIMEOUT_SECONDS: float = 5.0


def load_api_token() -> str:
    """Read and validate AURA_API_TOKEN from the environment.

    Fails closed if the variable is missing or shorter than 32 characters.
    """
    token = os.environ.get("AURA_API_TOKEN")
    if not token or len(token) < 32:
        raise RuntimeError(
            "AURA_API_TOKEN environment variable must be set and at least 32 characters long."
        )
    return token


def get_allowed_origins() -> Set[str]:
    """Return allowed origins from settings.CORS_ORIGINS, filtering out wildcards."""
    return {origin for origin in settings.CORS_ORIGINS if "*" not in origin}


def require_token(request: Request) -> str:
    """FastAPI dependency requiring a valid Bearer token in the Authorization header.

    Compares the provided token against app.state.api_token using constant-time comparison.
    Never logs or reveals token contents on failure.
    """
    expected_token = getattr(request.app.state, "api_token", None)
    if not expected_token:
        logger.warning("HTTP request rejected: server api_token not initialized")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized",
            headers={"WWW-Authenticate": "Bearer"},
        )

    auth_header = request.headers.get("Authorization")
    if not auth_header:
        logger.warning("HTTP request rejected: missing Authorization header")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized",
            headers={"WWW-Authenticate": "Bearer"},
        )

    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        logger.warning("HTTP request rejected: malformed Authorization header")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized",
            headers={"WWW-Authenticate": "Bearer"},
        )

    client_token = parts[1]
    if not secrets.compare_digest(client_token, expected_token):
        logger.warning("HTTP request rejected: token mismatch")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return client_token


async def authenticate_websocket(
    websocket: WebSocket,
    timeout: Optional[float] = None,
) -> bool:
    """Authenticate incoming WebSocket connections.

    1. Checks Origin header against allowed origins (rejecting unauthorized origins with code 1008
       before accepting the connection). Missing Origin is permitted for non-browser clients.
    2. Accepts the connection.
    3. Waits up to `timeout` (default AUTH_TIMEOUT_SECONDS) for a text auth message:
       {"type": "auth", "token": "..."}
    4. Validates the token using constant-time comparison. Rejects with close code 4401 on
       timeout, malformed payload, or invalid token.

    Returns True if authenticated, False otherwise.
    """
    origin = websocket.headers.get("origin")
    if origin is not None:
        allowed = get_allowed_origins()
        if origin not in allowed:
            logger.warning("WebSocket rejected before accept: unauthorized origin")
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return False

    await websocket.accept()

    wait_time = timeout if timeout is not None else AUTH_TIMEOUT_SECONDS

    try:
        message = await asyncio.wait_for(
            websocket.receive(),
            timeout=wait_time,
        )
    except asyncio.TimeoutError:
        logger.warning("WebSocket auth failed: handshake timed out")
        try:
            await websocket.close(code=4401)
        except Exception:
            pass
        return False
    except Exception:
        return False

    msg_type = message.get("type")
    if msg_type == "websocket.disconnect":
        return False

    if msg_type != "websocket.receive":
        try:
            await websocket.close(code=4401)
        except Exception:
            pass
        return False

    raw_text = message.get("text")
    if not raw_text:
        logger.warning("WebSocket auth failed: non-text or empty auth message")
        try:
            await websocket.close(code=4401)
        except Exception:
            pass
        return False

    try:
        data = json.loads(raw_text)
        if not isinstance(data, dict):
            raise ValueError("Payload must be a dict")
    except (json.JSONDecodeError, ValueError):
        logger.warning("WebSocket auth failed: malformed JSON payload")
        try:
            await websocket.close(code=4401)
        except Exception:
            pass
        return False

    payload_type = data.get("type")
    client_token = data.get("token")

    if payload_type != "auth" or not isinstance(client_token, str):
        logger.warning("WebSocket auth failed: message type is not 'auth' or token is not a string")
        try:
            await websocket.close(code=4401)
        except Exception:
            pass
        return False

    expected_token = getattr(websocket.app.state, "api_token", None)
    if not expected_token or not secrets.compare_digest(client_token, expected_token):
        logger.warning("WebSocket auth failed: invalid token")
        try:
            await websocket.close(code=4401)
        except Exception:
            pass
        return False

    logger.debug("WebSocket authenticated successfully")
    return True
