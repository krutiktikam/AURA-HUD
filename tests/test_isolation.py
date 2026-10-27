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
