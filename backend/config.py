import os
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    """Configuration settings for the AI Companion Device."""
    
    # General Settings
    APP_NAME: str = "Hardware AI Companion"
    DEBUG: bool = True
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    # Audio Settings
    AUDIO_INPUT_DEVICE_INDEX: int = 0
    AUDIO_OUTPUT_DEVICE_INDEX: int = 0
    SAMPLE_RATE: int = 16000
    CHANNELS: int = 1
    CHUNK_SIZE: int = 1024
    
    # Speech-to-Text (STT) Settings
    WHISPER_MODEL_SIZE: str = "base"
    WHISPER_DEVICE: str = "cpu"
    WHISPER_COMPUTE_TYPE: str = "int8"
    
    # LLM Settings (Ollama)
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.2:1b"
    SYSTEM_PROMPT: str = (
        "You are an embedded hardware AI companion assistant running on a touch-screen device. "
        "Provide concise, intelligent, and helpful responses. When code is requested, "
        "provide clean, modular code with minimal preamble. Tailor answers for voice read-back."
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
