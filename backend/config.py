import os
from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict

# Ensure default cache paths are local and not pointing to missing drive letters
DEFAULT_CACHE_DIR = str(Path.home() / ".cache" / "huggingface")
if "HF_HOME" not in os.environ or os.environ["HF_HOME"].startswith("E:"):
    os.environ["HF_HOME"] = DEFAULT_CACHE_DIR

class Settings(BaseSettings):
    """Configuration settings for the AI Companion Device."""
    
    # General Settings
    APP_NAME: str = "Hardware AI Companion"
    COMPANION_NAME: str = "J.A.R.V.I.S."
    DEBUG: bool = True
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    # Audio Settings
    AUDIO_INPUT_DEVICE_INDEX: int = 0
    AUDIO_OUTPUT_DEVICE_INDEX: int = 0
    SAMPLE_RATE: int = 16000
    CHANNELS: int = 1
    CHUNK_SIZE: int = 1024
    
    # Speech-to-Text (STT) Settings - 100% Offline with Faster-Whisper
    WHISPER_MODEL_SIZE: str = "tiny.en"
    WHISPER_DEVICE: str = "cpu"
    WHISPER_COMPUTE_TYPE: str = "int8"
    WHISPER_DOWNLOAD_ROOT: str = str(Path.home() / ".cache" / "huggingface" / "hub")
    
    # LLM Settings (Ollama - 100% Offline Local Model)
    OLLAMA_BASE_URL: str = "http://127.0.0.1:11435"
    OLLAMA_MODEL: str = "llama3.2:1b"
    SYSTEM_PROMPT: str = (
        "You are a helpful, practical AI assistant running on a local desktop device. "
        "Your name is {companion_name}. "
        "\n\n"
        "CORE BEHAVIOR:\n"
        "- Be concise and direct. Aim for 1-3 sentences unless asked for detail.\n"
        "- Use simple, friendly language. No movie-script drama.\n"
        "- When asked about system info (CPU, RAM, processes), use the available tools.\n"
        "- Never claim to be 'tactical', 'strategic', 'operator', or 'classified'.\n"
        "- Never invent capabilities you don't have.\n"
        "- If you don't know something, say so plainly.\n"
        "\n"
        "RESPONSE STYLE:\n"
        "- Casual and conversational, like a helpful friend.\n"
        "- Avoid theatrical language, military jargon, or sci-fi tropes.\n"
        "- Use natural contractions (I'm, you're, let's).\n"
        "- Keep responses under 50 words when possible.\n"
        "\n"
        "TOOL USAGE:\n"
        "- Use get_system_telemetry when asked about system status, CPU, RAM, or disk.\n"
        "- Use get_running_processes when asked about active processes or tasklist.\n"
        "- Use execute_safe_command only for safe, read-only commands.\n"
        "- Report tool results concisely without embellishment."
    )
    
    # Text-to-Speech (TTS) Settings
    TTS_ENGINE: str = "system"  # 'system', 'pyttsx3', or 'mock'
    TTS_RATE: int = 175
    
    # API & WebSocket Settings
    CORS_ORIGINS: List[str] = ["*"]
    API_TIMEOUT_SECONDS: float = 30.0
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
