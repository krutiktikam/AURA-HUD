"""SQLite WAL Clipboard History Storage Engine."""
import json
import re
import sqlite3
import time
from contextlib import closing
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.config import get_default_clipboard_db_path, settings

_CODE_KEYWORD_RE = re.compile(
    r"^\s*(def|class|import|from|const|let|var|function|public|private|fn|SELECT|#include)\b",
    re.MULTILINE,
)
_CALL_SHAPE_RE = re.compile(r"\b\w+\s*\([^)]*\)\s*(:|\{)")


def get_db_path() -> Path:
    """Return the active database path from settings or platform default."""
    if settings.CLIPBOARD_DB_PATH:
        return Path(settings.CLIPBOARD_DB_PATH)
    return get_default_clipboard_db_path()


def init_db(db_path: Optional[Path] = None) -> None:
    """Initialize the SQLite database with WAL mode for non-blocking concurrent reads/writes."""
    path = db_path or get_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(path)) as conn:
        with conn:
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
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_clipboard_timestamp "
                "ON clipboard_history(timestamp DESC);"
            )
            conn.execute("""
                CREATE TABLE IF NOT EXISTS clipboard_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
            """)


def get_settings(db_path: Optional[Path] = None) -> Dict[str, Any]:
    """Return persisted clipboard privacy settings with default fallbacks."""
    path = db_path or get_db_path()
    paused = False
    retention_days = settings.CLIPBOARD_RETENTION_DAYS

    if not path.exists():
        return {"paused": paused, "retention_days": retention_days}

    with closing(sqlite3.connect(path)) as conn:
        table_exists = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='clipboard_settings';"
        ).fetchone()
        if table_exists is None:
            return {"paused": paused, "retention_days": retention_days}

        rows = conn.execute("SELECT key, value FROM clipboard_settings;").fetchall()
        for key, value in rows:
            if key == "paused":
                paused = value.lower() in ("1", "true", "yes")
            elif key == "retention_days":
                try:
                    parsed = int(value)
                    if 1 <= parsed <= 365:
                        retention_days = parsed
                except ValueError:
                    pass

    return {"paused": paused, "retention_days": retention_days}


def set_settings(
    paused: Optional[bool] = None,
    retention_days: Optional[int] = None,
    db_path: Optional[Path] = None,
) -> Dict[str, Any]:
    """Persist clipboard privacy settings and return the updated settings."""
    if retention_days is not None:
        if isinstance(retention_days, bool) or not (1 <= retention_days <= 365):
            raise ValueError("retention_days must be between 1 and 365")

    path = db_path or get_db_path()
    init_db(db_path=path)

    updates = []
    if paused is not None:
        updates.append(("paused", "true" if paused else "false"))
    if retention_days is not None:
        updates.append(("retention_days", str(retention_days)))

    if updates:
        with closing(sqlite3.connect(path)) as conn:
            with conn:
                conn.executemany(
                    "INSERT INTO clipboard_settings (key, value) VALUES (?, ?) "
                    "ON CONFLICT(key) DO UPDATE SET value = excluded.value;",
                    updates,
                )

    return get_settings(db_path=path)


def db_ok(db_path: Optional[Path] = None) -> bool:
    """Check database health by running SELECT 1 without logging content."""
    try:
        path = db_path or get_db_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(path)) as conn:
            cursor = conn.execute("SELECT 1;")
            row = cursor.fetchone()
            return row is not None and row[0] == 1
    except Exception:
        return False


def detect_category(content: str) -> str:
    """Classify clipboard content into code, json, url, or text."""
    s = content.strip()
    if s.startswith(("http://", "https://", "www.")):
        return "url"

    try:
        parsed = json.loads(s)
        if isinstance(parsed, (dict, list)):
            return "json"
    except (ValueError, TypeError):
        pass

    lines = s.splitlines()
    signals = (
        bool(_CODE_KEYWORD_RE.search(s)),
        "=>" in s,
        any(line.rstrip().endswith(";") for line in lines),
        any(
            (stripped := line.strip()) in ("{", "}") or stripped.endswith("{")
            for line in lines
        ),
        "```" in s,
        bool(_CALL_SHAPE_RE.search(s)),
    )
    if sum(signals) >= 2:
        return "code"
    return "text"


def add_clipboard_entry(
    content: str, category: Optional[str] = None, db_path: Optional[Path] = None
) -> Dict[str, Any]:
    """Add a new entry to the clipboard history, avoiding consecutive duplicates."""
    path = db_path or get_db_path()
    if get_settings(db_path=path)["paused"]:
        return {"status": "paused"}

    clean_text = content.strip()
    if not clean_text:
        return {"status": "empty"}

    if len(clean_text) > settings.CLIPBOARD_MAX_CHARS:
        return {"status": "too_large"}

    if category is None:
        category = detect_category(clean_text)

    path.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(path)) as conn:
        with conn:
            cursor = conn.execute(
                "SELECT content FROM clipboard_history ORDER BY id DESC LIMIT 1;"
            )
            row = cursor.fetchone()
            if row and row[0] == clean_text:
                return {"status": "duplicate_skipped", "category": category}

            conn.execute(
                "INSERT INTO clipboard_history (content, category, timestamp) VALUES (?, ?, ?);",
                (clean_text, category, time.time()),
            )
    purge_expired(db_path=path)
    return {"status": "saved", "category": category}


def _secure_delete(path: Path, sql: str, params: tuple = ()) -> int:
    """Execute a delete on clipboard_history with secure_delete and WAL checkpointing."""
    if not path.exists():
        return 0

    with closing(sqlite3.connect(path)) as conn:
        table_exists = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='clipboard_history';"
        ).fetchone()
        if table_exists is None:
            return 0

        conn.execute("PRAGMA secure_delete=ON;")
        with conn:
            cursor = conn.execute(sql, params)
            deleted = cursor.rowcount
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE);")
        return deleted


def purge_expired(
    retention_days: Optional[int] = None,
    now: Optional[float] = None,
    db_path: Optional[Path] = None,
) -> int:
    """Delete clipboard entries older than retention_days and scrub freed space."""
    path = db_path or get_db_path()
    days = (
        retention_days
        if retention_days is not None
        else get_settings(db_path=path)["retention_days"]
    )
    current_time = time.time() if now is None else now
    cutoff = current_time - (days * 86400)
    return _secure_delete(
        path,
        "DELETE FROM clipboard_history WHERE timestamp < ?;",
        (cutoff,),
    )


def clear_history(db_path: Optional[Path] = None) -> int:
    """Delete all clipboard history entries and scrub freed space."""
    path = db_path or get_db_path()
    return _secure_delete(path, "DELETE FROM clipboard_history;")


def get_recent_history(
    limit: int = 15, db_path: Optional[Path] = None
) -> List[Dict[str, Any]]:
    """Retrieve the most recent clipboard entries."""
    path = db_path or get_db_path()
    if not path.exists():
        return []

    with closing(sqlite3.connect(path)) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.execute(
            "SELECT id, content, category, timestamp FROM clipboard_history "
            "ORDER BY id DESC LIMIT ?;",
            (limit,),
        )
        return [dict(row) for row in cursor.fetchall()]


def search_history(
    query: str, limit: int = 5, db_path: Optional[Path] = None
) -> List[Dict[str, Any]]:
    """Search clipboard history for keywords with wildcard escaping."""
    path = db_path or get_db_path()
    if not path.exists():
        return []

    # Escape LIKE wildcards % and _ as well as the escape character \
    escaped_query = (
        query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    )

    with closing(sqlite3.connect(path)) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.execute(
            "SELECT id, content, category, timestamp FROM clipboard_history "
            "WHERE content LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT ?;",
            (f"%{escaped_query}%", limit),
        )
        return [dict(row) for row in cursor.fetchall()]
