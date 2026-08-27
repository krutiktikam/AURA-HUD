"""J.A.R.V.I.S. Agent Harness with LangChain and local tools."""
import asyncio
import logging
import subprocess
import os
import psutil
from typing import List, Dict, Any, Optional

from langchain_ollama import ChatOllama
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage

from backend.config import settings

logger = logging.getLogger("JARVIS")
logging.basicConfig(level=logging.INFO)

# ------------------- Tools -------------------

@tool
def get_system_telemetry() -> str:
    """Get current system telemetry including CPU usage, RAM usage, and disk space.

    Returns a formatted string with system metrics.
    """
    try:
        cpu_percent = psutil.cpu_percent(interval=0.1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage(os.path.abspath(os.sep))

        return (
            f"System Telemetry:\n"
            f"- CPU Usage: {cpu_percent:.1f}%\n"
            f"- RAM Usage: {memory.percent:.1f}% ({memory.used / 1024**3:.2f}GB / {memory.total / 1024**3:.2f}GB)\n"
            f"- Disk Usage: {disk.percent:.1f}% ({disk.used / 1024**3:.2f}GB / {disk.total / 1024**3:.2f}GB)"
        )
    except Exception as e:
        return f"Error getting telemetry: {str(e)}"

@tool
def execute_terminal_command(command: str) -> str:
    """Execute a safe terminal command and return its output.

    Args:
        command: The command to execute (e.g., 'dir', 'echo hello', 'hostname')

    Returns:
        The command output as a string.
    """
    dangerous = ['rmdir /s', 'del /f /s /q', 'format', 'diskpart', 'rm -rf', 'sudo', 'chmod 777', 'mkfs', 'dd if=']
    if any(d in command.lower() for d in dangerous):
        return "Error: Command rejected by J.A.R.V.I.S. security protocol."

    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=10,
            cwd=os.getcwd()
        )
        output = result.stdout if result.returncode == 0 else (result.stderr or result.stdout)
        return output.strip() if output else "Command executed successfully (no output)."
    except subprocess.TimeoutExpired:
        return "Error: Command execution timed out (10s limit)."
    except Exception as e:
        return f"Error executing command: {str(e)}"

@tool
def get_running_processes() -> str:
    """Get a list of top currently running processes with their CPU and memory usage.

    Returns top 10 processes by memory usage.
    """
    try:
        processes = []
        for proc in psutil.process_iter(['pid', 'name', 'memory_percent', 'cpu_percent']):
            try:
                processes.append(proc.info)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass

        processes.sort(key=lambda x: x.get('memory_percent') or 0, reverse=True)
        top = processes[:10]

        result = "Top 10 Processes by Memory Usage:\n"
        for p in top:
            mem = p.get('memory_percent') or 0.0
            cpu = p.get('cpu_percent') or 0.0
            result += f"  PID {p.get('pid')}: {p.get('name')} - {mem:.1f}% RAM, {cpu:.1f}% CPU\n"

        return result
    except Exception as e:
        return f"Error getting processes: {str(e)}"

# ------------------- Agent Setup -------------------

class JarvisAgent:
    """J.A.R.V.I.S. - Just A Rather Very Intelligent System."""

    def __init__(self, model: str = settings.OLLAMA_MODEL, base_url: str = settings.OLLAMA_BASE_URL):
        self.model = model
        self.base_url = base_url
        self.tools = [get_system_telemetry, execute_terminal_command, get_running_processes]
        self.tools_by_name = {t.name: t for t in self.tools}

        self.llm = ChatOllama(
            model=self.model,
            base_url=self.base_url,
            temperature=0.4
        )
        self.chat_history: List[Dict[str, str]] = []

    async def ainvoke(self, prompt: str, history: Optional[List[Dict[str, str]]] = None) -> str:
        """Async invoke the agent with conversation memory and dynamic tool execution."""
        # Simple keywords/intent detection for fast tool invocation with small 1B/1.5B models
        lower_prompt = prompt.lower()
        tool_result = ""

        if any(w in lower_prompt for w in ["telemetry", "cpu", "ram", "memory usage", "system status", "hardware"]):
            tool_result = get_system_telemetry.invoke({})
        elif any(w in lower_prompt for w in ["processes", "running tasks", "tasklist", "top process"]):
            tool_result = get_running_processes.invoke({})

        # Assemble prompt with memory
        messages = [
            SystemMessage(content=(
                "You are J.A.R.V.I.S., an advanced AI companion embedded in a tactical desktop HUD. "
                "Provide concise, crisp, highly intelligent responses. "
                "When system metrics or command outputs are available, incorporate them accurately."
            ))
        ]

        # Add history
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
            user_content += f"\n\n[SYSTEM SENSOR DATA:\n{tool_result}\n]"

        messages.append(HumanMessage(content=user_content))

        try:
            response = await self.llm.ainvoke(messages)
            reply = response.content if hasattr(response, 'content') else str(response)

            # Update memory
            self.chat_history.append({"role": "user", "content": prompt})
            self.chat_history.append({"role": "assistant", "content": reply})

            return reply
        except Exception as e:
            logger.warning(f"ChatOllama direct invocation fallback: {e}")
            if tool_result:
                return f"[J.A.R.V.I.S. TELEMETRY]\n{tool_result}"
            return f"Neural core processing notice: {str(e)}"

    def clear_memory(self):
        """Clear conversation memory."""
        self.chat_history.clear()

# Singleton instance
jarvis_agent = JarvisAgent()
