# AI Companion Device Backend Package

# Import core modules for easier access
from backend.config import settings
from backend.clipboard_store import add_clipboard_entry, get_recent_history, search_history
from backend.voice_pipeline import voice_pipeline

# Import agent components
from backend.agent.router import router as agent_router
from backend.agent.intent import IntentCategory

# Import utility functions
from backend.utils.ollama_client import OllamaClient

__all__ = [
    'settings',
    'add_clipboard_entry',
    'get_recent_history',
    'search_history',
    'voice_pipeline',
    'agent_router',
    'IntentCategory',
    'OllamaClient'
]