import logging
import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.clipboard_store import (
    detect_category,
    get_recent_history,
    get_settings,
    purge_expired,
    set_settings,
)
from backend.config import settings


def test_paused_add_stores_nothing(client: TestClient):
    res = client.post("/api/clipboard/settings", json={"paused": True})
    assert res.status_code == 200
    assert res.json()["paused"] is True

    add_text = client.post(
        "/api/clipboard/add",
        json={"content": "hello there"},
    )
    assert add_text.status_code == 200
    assert add_text.json() == {"status": "paused", "category": "text"}

    add_code = client.post(
        "/api/clipboard/add",
        json={"content": "def add(a, b): return a + b"},
    )
    assert add_code.status_code == 200
    assert add_code.json() == {"status": "paused", "category": "code"}

    oversized = "x" * (settings.CLIPBOARD_MAX_CHARS + 1)
    add_oversized = client.post(
        "/api/clipboard/add",
        json={"content": oversized},
    )
    assert add_oversized.status_code == 200
    assert add_oversized.json() == {"status": "paused"}

    hist_res = client.get("/api/clipboard/history")
    assert hist_res.status_code == 200
    assert hist_res.json()["history"] == []


def test_resume_allows_adds(client: TestClient):
    client.post("/api/clipboard/settings", json={"paused": True})
    paused_res = client.post("/api/clipboard/add", json={"content": "ignored"})
    assert paused_res.json() == {"status": "paused", "category": "text"}

    resume_res = client.post("/api/clipboard/settings", json={"paused": False})
    assert resume_res.status_code == 200
    assert resume_res.json()["paused"] is False

    saved_res = client.post("/api/clipboard/add", json={"content": "accepted after resume"})
    assert saved_res.status_code == 200
    assert saved_res.json()["status"] == "saved"

    hist = client.get("/api/clipboard/history").json()["history"]
    assert len(hist) == 1
    assert hist[0]["content"] == "accepted after resume"


def test_too_large_is_skipped_not_truncated(client: TestClient):
    oversized = "x" * (settings.CLIPBOARD_MAX_CHARS + 1)
    res = client.post("/api/clipboard/add", json={"content": oversized})
    assert res.status_code == 200
    assert res.json() == {"status": "too_large"}

    hist = client.get("/api/clipboard/history").json()["history"]
    assert hist == []


def test_exactly_max_chars_is_accepted(client: TestClient):
    exact = "a" * settings.CLIPBOARD_MAX_CHARS
    res = client.post("/api/clipboard/add", json={"content": exact})
    assert res.status_code == 200
    assert res.json()["status"] == "saved"

    hist = client.get("/api/clipboard/history").json()["history"]
    assert len(hist) == 1
    assert len(hist[0]["content"]) == settings.CLIPBOARD_MAX_CHARS
    assert hist[0]["content"] == exact


def test_clear_deletes_all_rows(client: TestClient):
    client.post("/api/clipboard/add", json={"content": "entry one"})
    client.post("/api/clipboard/add", json={"content": "entry two"})

    assert len(client.get("/api/clipboard/history").json()["history"]) == 2

    clear_res = client.post("/api/clipboard/clear")
    assert clear_res.status_code == 200
    assert clear_res.json() == {"status": "cleared", "deleted": 2}

    assert client.get("/api/clipboard/history").json()["history"] == []

    clear_again = client.post("/api/clipboard/clear")
    assert clear_again.status_code == 200
    assert clear_again.json() == {"status": "cleared", "deleted": 0}


def test_clear_removes_content_from_db_and_wal_files(
    client: TestClient, temp_db: Path
):
    marker = "UNIQUE_PRIVACY_MARKER_9F8E7D6C5B4A3210"
    res = client.post("/api/clipboard/add", json={"content": marker})
    assert res.status_code == 200
    assert res.json()["status"] == "saved"

    clear_res = client.post("/api/clipboard/clear")
    assert clear_res.status_code == 200
    assert clear_res.json() == {"status": "cleared", "deleted": 1}

    marker_bytes = marker.encode("utf-8")
    db_bytes = temp_db.read_bytes()
    assert marker_bytes not in db_bytes

    wal_path = Path(f"{temp_db}-wal")
    if wal_path.exists():
        wal_bytes = wal_path.read_bytes()
        assert marker_bytes not in wal_bytes


def test_retention_purges_old_rows(temp_db: Path):
    now = 1_700_000_000.0
    retention_days = 30
    with sqlite3.connect(temp_db) as conn:
        conn.execute(
            "INSERT INTO clipboard_history (content, category, timestamp) VALUES (?, ?, ?);",
            ("old one", "text", now - (retention_days * 86400) - 1),
        )
        conn.execute(
            "INSERT INTO clipboard_history (content, category, timestamp) VALUES (?, ?, ?);",
            ("older two", "text", now - (45 * 86400)),
        )

    deleted = purge_expired(retention_days=retention_days, now=now, db_path=temp_db)
    assert deleted == 2
    assert get_recent_history(db_path=temp_db) == []


def test_retention_keeps_recent_rows(temp_db: Path):
    now = 1_700_000_000.0
    retention_days = 30
    with sqlite3.connect(temp_db) as conn:
        conn.execute(
            "INSERT INTO clipboard_history (content, category, timestamp) VALUES (?, ?, ?);",
            ("expired entry", "text", now - (31 * 86400)),
        )
        conn.execute(
            "INSERT INTO clipboard_history (content, category, timestamp) VALUES (?, ?, ?);",
            ("recent entry", "text", now - (29 * 86400)),
        )
        conn.execute(
            "INSERT INTO clipboard_history (content, category, timestamp) VALUES (?, ?, ?);",
            ("fresh entry", "text", now),
        )

    deleted = purge_expired(retention_days=retention_days, now=now, db_path=temp_db)
    assert deleted == 1

    remaining = [row["content"] for row in get_recent_history(db_path=temp_db)]
    assert remaining == ["fresh entry", "recent entry"]


def test_settings_roundtrip_and_validation(client: TestClient, temp_db: Path):
    initial = client.get("/api/clipboard/settings")
    assert initial.status_code == 200
    assert initial.json() == {
        "paused": False,
        "retention_days": settings.CLIPBOARD_RETENTION_DAYS,
        "max_chars": settings.CLIPBOARD_MAX_CHARS,
    }

    updated = client.post(
        "/api/clipboard/settings",
        json={"paused": True, "retention_days": 14},
    )
    assert updated.status_code == 200
    assert updated.json() == {
        "paused": True,
        "retention_days": 14,
        "max_chars": settings.CLIPBOARD_MAX_CHARS,
    }

    fetched = client.get("/api/clipboard/settings")
    assert fetched.status_code == 200
    assert fetched.json() == updated.json()

    assert client.post("/api/clipboard/settings", json={"retention_days": 0}).status_code == 422
    assert client.post("/api/clipboard/settings", json={"retention_days": 366}).status_code == 422

    with pytest.raises(ValueError):
        set_settings(retention_days=0, db_path=temp_db)
    with pytest.raises(ValueError):
        set_settings(retention_days=366, db_path=temp_db)


def test_settings_persist_across_connections(temp_db: Path):
    saved = set_settings(paused=True, retention_days=7, db_path=temp_db)
    assert saved == {"paused": True, "retention_days": 7}

    conn = sqlite3.connect(temp_db)
    try:
        rows = dict(conn.execute("SELECT key, value FROM clipboard_settings;").fetchall())
        assert rows == {"paused": "true", "retention_days": "7"}
    finally:
        conn.close()

    assert get_settings(db_path=temp_db) == {"paused": True, "retention_days": 7}


def test_no_clipboard_content_in_logs(
    client: TestClient, caplog: pytest.LogCaptureFixture
):
    marker = "SENSITIVE_CLIPBOARD_TOKEN_BODY_88421"
    with caplog.at_level(logging.DEBUG):
        client.post("/api/clipboard/add", json={"content": marker})
        client.get("/api/clipboard/search?q=SENSITIVE_CLIPBOARD")
        client.get("/api/clipboard/history")
        client.get("/api/clipboard/settings")
        client.post("/api/clipboard/settings", json={"paused": True})
        client.post("/api/clipboard/settings", json={"paused": False})
        client.post("/api/clipboard/clear")

    for record in caplog.records:
        assert marker not in record.getMessage()


def test_history_and_search_limit_bounds(client: TestClient):
    assert client.get("/api/clipboard/history?limit=0").status_code == 422
    assert client.get("/api/clipboard/history?limit=101").status_code == 422
    assert client.get("/api/clipboard/history?limit=1").status_code == 200
    assert client.get("/api/clipboard/history?limit=100").status_code == 200

    assert client.get("/api/clipboard/search?limit=0").status_code == 422
    assert client.get("/api/clipboard/search?limit=51").status_code == 422
    assert client.get("/api/clipboard/search?limit=1").status_code == 200
    assert client.get("/api/clipboard/search?limit=50").status_code == 200

    too_long_q = "a" * 201
    ok_q = "a" * 200
    assert client.get(f"/api/clipboard/search?q={too_long_q}").status_code == 422
    assert client.get(f"/api/clipboard/search?q={ok_q}").status_code == 200


def test_unknown_category_rejected(client: TestClient):
    res = client.post(
        "/api/clipboard/add",
        json={"content": "hello world", "category": "binary"},
    )
    assert res.status_code == 422

    for valid in ("text", "code", "json", "url"):
        ok_res = client.post(
            "/api/clipboard/add",
            json={"content": f"sample {valid}", "category": valid},
        )
        assert ok_res.status_code == 200
        assert ok_res.json()["category"] == valid


@pytest.mark.parametrize(
    "sample",
    [
        "let me know if you need anything else today.",
        "let me know if that works",
        "Please return the signed agreement before noon.",
        "Please return the book and import the files",
        "We plan to import new parts next week.",
        "From the evidence file, run the script",
        (
            "When you return to the office, please let me know so we can "
            "review the import schedule together. The team will discuss every "
            "item from the list, verify the class schedule, and select a date "
            "for the next meeting without any rush or extra overhead."
        ),
        "12345",
    ],
)
def test_detect_category_prose_is_text(sample: str):
    assert detect_category(sample) == "text"


@pytest.mark.parametrize(
    ("sample", "expected"),
    [
        ("https://example.com/docs", "url"),
        ("http://127.0.0.1:8000/health", "url"),
        ("www.example.org/test", "url"),
        ('{"key": "value", "items": [1, 2]}', "json"),
        ('[1, 2, {"ok": true}]', "json"),
        ("const total = 42;", "code"),
        ("def add(a, b): return a + b", "code"),
        ("const x = () => 1;", "code"),
        ("SELECT * FROM users;", "code"),
        ("function f(x) { return x; }", "code"),
        ("function greet(name) {\n  return name;\n}", "code"),
        ("const handler = (x) => {\n  return x + 1;\n};", "code"),
        ("```python\ndef run():\n    pass\n```", "code"),
    ],
)
def test_detect_category_code_json_url(sample: str, expected: str):
    assert detect_category(sample) == expected
