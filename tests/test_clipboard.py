import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient


def test_clipboard_add_and_duplicate_skipped(client: TestClient):
    # Add initial entry
    res1 = client.post("/api/clipboard/add", json={"content": "snippet 1", "category": "text"})
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["status"] == "saved"
    assert data1["category"] == "text"

    # Add same content consecutively -> duplicate_skipped
    res2 = client.post("/api/clipboard/add", json={"content": "snippet 1", "category": "text"})
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["status"] == "duplicate_skipped"


def test_clipboard_search_with_percent_in_query(client: TestClient):
    client.post("/api/clipboard/add", json={"content": "Save 50% on items", "category": "text"})
    client.post("/api/clipboard/add", json={"content": "Save 50 dollars", "category": "text"})

    # Search specifically for %
    res = client.get("/api/clipboard/search?q=%")
    assert res.status_code == 200
    results = res.json()["results"]
    assert len(results) == 1
    assert "50%" in results[0]["content"]


def test_clipboard_json_body_accepted(client: TestClient):
    res = client.post("/api/clipboard/add", json={"content": "const x = 10;", "category": "code"})
    assert res.status_code == 200
    assert res.json()["status"] == "saved"
    assert res.json()["category"] == "code"


def test_clipboard_persisted_via_fresh_connection(client: TestClient, temp_db: Path):
    client.post(
        "/api/clipboard/add",
        json={"content": "persistent content", "category": "text"},
    )

    # Open a completely fresh sqlite3 connection directly to the db file on disk
    conn = sqlite3.connect(temp_db)
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT content, category FROM clipboard_history WHERE content = ?;",
            ("persistent content",),
        )
        row = cursor.fetchone()
        assert row is not None
        assert row[0] == "persistent content"
        assert row[1] == "text"
    finally:
        conn.close()
