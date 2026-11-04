import os
import subprocess
import sys
from pathlib import Path


def test_import_backend_main_isolation(tmp_path: Path):
    db_path = tmp_path / "test_clipboard.db"
    env = os.environ.copy()
    env["CLIPBOARD_DB_PATH"] = str(db_path)

    cmd = [
        sys.executable,
        "-c",
        (
            "import os; import backend.main; "
            "from backend.voice_pipeline import voice_pipeline; "
            "assert voice_pipeline.stt_model is None, "
            "'Whisper model should not be loaded on import'; "
            "assert not os.path.exists(os.environ['CLIPBOARD_DB_PATH']), "
            "'DB should not be created on import'"
        ),
    ]

    result = subprocess.run(
        cmd,
        env=env,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, f"Subprocess failed: {result.stderr}"
    assert not db_path.exists(), "Clipboard database was created on import"


def test_env_example_host_and_defaults():
    env_example_path = Path(__file__).parent.parent / ".env.example"
    content = env_example_path.read_text(encoding="utf-8")
    assert 'HOST="0.0.0.0"' not in content
    assert 'HOST="127.0.0.1"' in content
    assert 'WHISPER_MODEL_SIZE="tiny.en"' in content


def test_reload_enabled(monkeypatch):
    from backend.main import reload_enabled

    # Enabled only when AURA_RELOAD == "1"
    assert reload_enabled({"AURA_RELOAD": "1"}) is True
    assert reload_enabled({"AURA_RELOAD": "0"}) is False
    assert reload_enabled({"AURA_RELOAD": "true"}) is False
    assert reload_enabled({}) is False

    # Frozen builds never reload even with AURA_RELOAD == "1"
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    assert reload_enabled({"AURA_RELOAD": "1"}) is False
