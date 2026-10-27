import os
import subprocess
import sys
from pathlib import Path


def build_backend():
    """Build the backend as a standalone executable using PyInstaller."""

    # Get the project root directory
    project_root = Path(__file__).parent

    # Ensure we're in the project root
    os.chdir(project_root)

    # PyInstaller command - configure to treat backend as root module
    pyinstaller_cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--onefile",                    # Create a single executable file
        "--name=aura-backend",          # Name of the executable
        "--add-data=backend/config.py;backend",  # Include config file
        "--add-data=backend/agent;backend/agent", # Include agent module
        "--add-data=backend/models;backend/models", # Include models module
        "--add-data=backend/utils;backend/utils", # Include utils module
        "--add-data=backend/voice_pipeline.py;backend", # Include voice pipeline
        "--add-data=backend/clipboard_store.py;backend", # Include clipboard store
        "--add-data=backend/__init__.py;backend", # Include backend init
        "--add-data=backend/agent/__init__.py;backend/agent", # Include agent init
        "--add-data=backend/models/__init__.py;backend/models", # Include models init
        "--hidden-import=pydantic",     # Ensure pydantic is included
        "--hidden-import=fastapi",      # Ensure fastapi is included
        "--hidden-import=uvicorn",      # Ensure uvicorn is included
        "--hidden-import=sqlite3",      # Ensure sqlite3 is included
        "--hidden-import=httpx",        # Ensure httpx is included
        "--hidden-import=psutil",       # Ensure psutil is included (if used)
        "--hidden-import=faster_whisper", # Include faster_whisper
        "--hidden-import=ctranslate2",  # Include ctranslate2
        "--hidden-import=backend",      # Explicitly include backend package
        "--hidden-import=backend.models", # Explicitly include models
        "--hidden-import=backend.agent", # Explicitly include agent
        "--hidden-import=backend.utils", # Explicitly include utils
        "--collect-all=backend",        # Collect all backend files
        "--paths=.",                    # Add current directory to Python path
        "backend/main.py"               # Main entry point
    ]

    # On Windows, use .exe extension implicitly
    # PyInstaller will handle the platform-specific naming

    print("Building backend executable...")
    print(f"Command: {' '.join(pyinstaller_cmd)}")

    try:
        # Run PyInstaller
        result = subprocess.run(pyinstaller_cmd, check=True, capture_output=True, text=True)
        print("Build successful!")
        print(result.stdout)

        # Show the location of the built executable
        dist_dir = project_root / "dist"
        executable_name = "aura-backend.exe" if sys.platform == "win32" else "aura-backend"
        executable_path = dist_dir / executable_name

        if executable_path.exists():
            print(f"\nExecutable created at: {executable_path.absolute()}")
            print(f"Size: {executable_path.stat().st_size / (1024*1024):.2f} MB")
        else:
            print(f"Warning: Expected executable not found at {executable_path}")

    except subprocess.CalledProcessError as e:
        print("Build failed!")
        print(f"Return code: {e.returncode}")
        print(f"Stdout: {e.stdout}")
        print(f"Stderr: {e.stderr}")
        sys.exit(1)
    except FileNotFoundError:
        print("Error: PyInstaller not found. Please install it with: pip install pyinstaller")
        sys.exit(1)

if __name__ == "__main__":
    build_backend()