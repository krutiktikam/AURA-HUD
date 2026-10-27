import os
from pathlib import Path
from typing import List, Optional
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
    HOST: str = "127.0.0.1"
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
    OLLAMA_BASE_URL: str = "http://127.0.0.1:11434"
    OLLAMA_MODEL: str = "llama3.2:1b"
    
    # Text-to-Speech (TTS) Settings
    TTS_ENGINE: str = "system"  # 'system', 'pyttsx3', or 'mock'
    TTS_RATE: int = 175
    
    # Clipboard Settings
    CLIPBOARD_DB_PATH: Optional[str] = None

    # API & WebSocket Settings
    CORS_ORIGINS: List[str] = ["*"]
    API_TIMEOUT_SECONDS: float = 30.0
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
