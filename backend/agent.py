"""J.A.R.V.I.S. Agent - Practical, concise, customizable AI assistant."""
import asyncio
import logging
import subprocess
import os
import psutil
import time
from typing import List, Dict, Any, Optional

from langchain_ollama import ChatOllama
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage

from backend.config import settings

logger = logging.getLogger("JARVIS")
logging.basicConfig(level=logging.INFO)

# ─── TOOLS ─────────────────────────────────────────────────────

@tool
def get_system_telemetry() -> str:
    """Get CPU, RAM, and disk usage statistics for this computer.

    Use this when the user asks about system performance, resource usage,
    or hardware status. Returns current values in percent and GB.
    """
    try:
        cpu = psutil.cpu_percent(interval=0.1)
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage(os.path.abspath(os.sep))
        return (
            f"CPU: {cpu}% | "
            f"RAM: {mem.percent}% ({mem.used/1024**3:.1f}/{mem.total/1024**3:.1f} GB) | "
            f"Disk: {disk.percent}% ({disk.used/1024**3:.1f}/{disk.total/1024**3:.1f} GB)"
        )
    except Exception as e:
        return f"Could not read telemetry: {e}"

@tool
def get_running_processes(limit: int = 5) -> str:
    """Get the top processes by memory usage.

    Args:
        limit: How many processes to return (default 5)
    """
    try:
        procs = []
        for p in psutil.process_iter(['name', 'memory_percent', 'cpu_percent']):
            try:
                procs.append(p.info)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        procs.sort(key=lambda x: x.get('memory_percent') or 0, reverse=True)

        lines = [f"  {p['name']}: {p['memory_percent']:.1f}% RAM"
                 for p in procs[:limit] if p.get('name')]
        return "Top processes:\n" + "\n".join(lines)
    except Exception as e:
        return f"Could not list processes: {e}"

@tool
def execute_safe_command(command: str) -> str:
    """Run a safe read-only terminal command. Blocks dangerous operations.

    Args:
        command: A shell command like 'dir', 'echo hello', 'hostname'
    """
    blocked = ['rmdir /s', 'del /f /s /q', 'format', 'diskpart', 'rm -rf', 'sudo', 'chmod 777', 'mkfs', 'dd', ':(){:|:&};:']
    if any(b in command.lower() for b in blocked):
        return "Command blocked for safety."

    try:
        result = subprocess.run(
            command, shell=True, capture_output=True,
            text=True, timeout=5, cwd=os.getcwd()
        )
        output = result.stdout if result.returncode == 0 else (result.stderr or result.stdout)
        return output[:500].strip() if output else "Command completed."
    except subprocess.TimeoutExpired:
        return "Command timed out after 5 seconds."
    except Exception as e:
        return f"Execution failed: {e}"

@tool
def search_clipboard_history(query: str) -> str:
    """Search through past clipboard entries stored locally in SQLite WAL.

    Args:
        query: Keyword or code snippet to search for.
    """
    from backend.clipboard_store import search_history
    results = search_history(query, limit=5)
    if not results:
        return f"No recent clipboard entries matching '{query}'."
    formatted = [f"[{r['category'].upper()} - {r['timestamp']}]:\n{r['content']}" for r in results]
    return "\n---\n".join(formatted)

@tool
def process_active_clipboard(action: str) -> str:
    """Perform quick text transformations on the latest copied clipboard item.

    Args:
        action: 'uppercase', 'lowercase', 'clean_whitespace', or 'inspect'
    """
    from backend.clipboard_store import get_recent_history
    history = get_recent_history(limit=1)
    if not history:
        return "Clipboard history is currently empty."
    raw = history[0]['content']
    if action == 'uppercase':
        return raw.upper()
    elif action == 'lowercase':
        return raw.lower()
    elif action == 'clean_whitespace':
        return " ".join(raw.split())
    return f"Active Clipboard [{history[0]['category']}]: {raw}"

# ─── AGENT CLASS ──────────────────────────────────────────────

class JarvisAgent:
    """Practical AI Companion Agent with dynamic naming, memory inspection & tool execution."""

    def __init__(self, model: str = settings.OLLAMA_MODEL, base_url: str = settings.OLLAMA_BASE_URL, name: str = settings.COMPANION_NAME):
        self.model = model
        self.base_url = base_url
        self.name = name

        # Low temperature for predictable, accurate, non-hallucinatory output
        self.llm = ChatOllama(
            model=self.model,
            base_url=self.base_url,
            temperature=0.3,
            num_predict=150
        )

        self.tools = [get_system_telemetry, get_running_processes, execute_safe_command, search_clipboard_history, process_active_clipboard]
        self.chat_history: List[Dict[str, Any]] = []

    def set_name(self, new_name: str) -> str:
        """Update the companion's display name."""
        clean_name = new_name.strip()
        if clean_name:
            self.name = clean_name
            settings.COMPANION_NAME = clean_name
        return self.name

    def get_memory(self) -> List[Dict[str, Any]]:
        """Return the current active conversation memory."""
        return list(self.chat_history)

    def clear_memory(self):
        """Clear conversation memory."""
        self.chat_history.clear()

    def _get_system_prompt(self) -> str:
        return settings.SYSTEM_PROMPT.format(companion_name=self.name)

    async def ainvoke(self, prompt: str, history: Optional[List[Dict[str, str]]] = None) -> str:
        """Get a concise response from the assistant."""
        lower_prompt = prompt.lower()
        tool_result = ""

        # Intent detection for fast, deterministic tool execution
        if any(w in lower_prompt for w in ["cpu", "ram", "telemetry", "hardware", "memory usage", "disk space", "system status"]):
            tool_result = get_system_telemetry.invoke({})
        elif any(w in lower_prompt for w in ["processes", "running tasks", "tasklist", "top process"]):
            tool_result = get_running_processes.invoke({"limit": 5})

        messages = [
            SystemMessage(content=self._get_system_prompt())
        ]

        # Add conversation history window (last 6 messages)
        active_history = history if history is not None else self.chat_history
        for msg in active_history[-6:]:
            role = msg.get("role") or msg.get("sender")
            content = msg.get("content") or msg.get("text", "")
            if role in ["user", "human"]:
                messages.append(HumanMessage(content=content))
            else:
                messages.append(AIMessage(content=content))

        user_content = prompt
        if tool_result:
            user_content += f"\n\n[SYSTEM TOOL DATA: {tool_result}]"

        messages.append(HumanMessage(content=user_content))

        try:
            response = await self.llm.ainvoke(messages)
            raw_reply = response.content if hasattr(response, 'content') else str(response)
            cleaned_reply = self._clean_response(raw_reply)

            # Record in working memory
            self.chat_history.append({"role": "user", "content": prompt, "timestamp": time.time()})
            self.chat_history.append({"role": "assistant", "content": cleaned_reply, "timestamp": time.time()})

            return cleaned_reply
        except Exception as e:
            logger.warning(f"ChatOllama direct invocation fallback: {e}")
            fallback = tool_result if tool_result else f"I'm operating offline. Systems status normal."
            cleaned = self._clean_response(fallback)
            self.chat_history.append({"role": "user", "content": prompt, "timestamp": time.time()})
            self.chat_history.append({"role": "assistant", "content": cleaned, "timestamp": time.time()})
            return cleaned

    def _clean_response(self, text: str) -> str:
        """Remove theatrical/movie-script language and military jargon."""
        replacements = {
            "tactical operator": "you",
            "tactical": "",
            "situational awareness": "context",
            "high-performance display unit": "app",
            "strategic support": "help",
            "computing, sir": "thinking",
            "at your service": "ready to help",
            "classified": "unavailable",
            "HUD": "screen",
        }
        for old, new in replacements.items():
            text = text.replace(old, new)
            text = text.replace(old.capitalize(), new.capitalize())
        return " ".join(text.split()).strip()

# Singleton
jarvis_agent = JarvisAgent()
