"""SQLite WAL Clipboard History Storage Engine."""
import sqlite3
import time
from pathlib import Path
from typing import List, Dict, Any

DB_PATH = Path.home() / ".cache" / "ai_companion_clipboard.db"

def init_db():
    """Initialize the SQLite database with WAL mode for non-blocking concurrent reads/writes."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS clipboard_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                category TEXT DEFAULT 'text',
                timestamp REAL NOT NULL
            );
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_clipboard_timestamp ON clipboard_history(timestamp DESC);")

def detect_category(content: str) -> str:
    """Classify clipboard content into code, json, url, or text."""
    s = content.strip()
    if s.startswith(('http://', 'https://', 'www.')):
        return 'url'
    if (s.startswith('{') and s.endswith('}')) or (s.startswith('[') and s.endswith(']')):
        return 'json'
    code_keywords = ['def ', 'const ', 'let ', 'var ', 'function ', 'class ', 'import ', 'return ', '=>', 'SELECT ', 'public ', 'fn ']
    if any(k in s for k in code_keywords) or '\n' in s and ('{' in s or ';' in s):
        return 'code'
    return 'text'

def add_clipboard_entry(content: str, category: str = None) -> Dict[str, Any]:
    """Add a new entry to the clipboard history, avoiding consecutive duplicates."""
    clean_text = content.strip()
    if not clean_text:
        return {"status": "empty"}

    if category is None:
        category = detect_category(clean_text)

    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.execute("SELECT content FROM clipboard_history ORDER BY id DESC LIMIT 1;")
        row = cursor.fetchone()
        if row and row[0] == clean_text:
            return {"status": "duplicate_skipped", "category": category}

        conn.execute(
            "INSERT INTO clipboard_history (content, category, timestamp) VALUES (?, ?, ?);",
            (clean_text, category, time.time())
        )
    return {"status": "saved", "category": category}

def get_recent_history(limit: int = 15) -> List[Dict[str, Any]]:
    """Retrieve the most recent clipboard entries."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.execute(
            "SELECT id, content, category, timestamp FROM clipboard_history ORDER BY id DESC LIMIT ?;",
            (limit,)
        )
        return [dict(row) for row in cursor.fetchall()]

def search_history(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    """Search clipboard history for keywords."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.execute(
            "SELECT id, content, category, timestamp FROM clipboard_history WHERE content LIKE ? ORDER BY id DESC LIMIT ?;",
            (f"%{query}%", limit)
        )
        return [dict(row) for row in cursor.fetchall()]

# Initialize database schema on module load
init_db()
