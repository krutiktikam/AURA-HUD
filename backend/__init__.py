# AI Companion Device Backend Package

# Import core modules for easier access
from backend.agent.intent import IntentCategory

# Import agent components
from backend.agent.router import router as agent_router
from backend.clipboard_store import add_clipboard_entry, get_recent_history, search_history
from backend.config import settings

# Import utility functions
from backend.utils.ollama_client import OllamaClient
from backend.voice_pipeline import voice_pipeline

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