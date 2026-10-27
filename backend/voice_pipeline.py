import asyncio
import importlib.util
import io
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np

from backend.config import settings

# Ensure HF_HOME is safe
if "HF_HOME" not in os.environ or os.environ["HF_HOME"].startswith("E:"):
    os.environ["HF_HOME"] = str(Path.home() / ".cache" / "huggingface")

# PyAudio optional import for hardware mic/speaker access
try:
    import pyaudio

    HAS_PYAUDIO = True
except ImportError:
    HAS_PYAUDIO = False

# faster-whisper import with fallback
try:
    from faster_whisper import WhisperModel

    HAS_FASTER_WHISPER = True
except ImportError:
    HAS_FASTER_WHISPER = False

HAS_PYTTSX3 = importlib.util.find_spec("pyttsx3") is not None

logger = logging.getLogger("VoicePipeline")


class STTUnavailableError(Exception):
    """Raised when Speech-to-Text service is unavailable or fails to initialize."""

    pass


class VoicePipeline:
    """100% Offline Voice interaction pipeline combining STT (Faster-Whisper) and audio devices."""

    def __init__(self):
        self.stt_model: Optional[Any] = None
        self._stt_lock = asyncio.Lock()

    async def get_stt_model(self) -> Any:
        """Lazily load Faster-Whisper model on first use behind an asyncio lock."""
        if not HAS_FASTER_WHISPER:
            raise STTUnavailableError("faster-whisper package is not installed")

        if self.stt_model is None:
            async with self._stt_lock:
                if self.stt_model is None:
                    try:
                        loop = asyncio.get_running_loop()
                        download_root = getattr(
                            settings,
                            "WHISPER_DOWNLOAD_ROOT",
                            str(Path.home() / ".cache" / "huggingface" / "hub"),
                        )
                        logger.info(
                            f"Loading Faster-Whisper model '{settings.WHISPER_MODEL_SIZE}' "
                            f"on {settings.WHISPER_DEVICE}..."
                        )

                        def _load_model():
                            return WhisperModel(
                                settings.WHISPER_MODEL_SIZE,
                                device=settings.WHISPER_DEVICE,
                                compute_type=settings.WHISPER_COMPUTE_TYPE,
                                download_root=download_root,
                            )

                        self.stt_model = await loop.run_in_executor(None, _load_model)
                        logger.info("Faster-Whisper model loaded successfully.")
                    except Exception as e:
                        logger.error(f"Could not initialize Faster-Whisper model: {e}")
                        raise STTUnavailableError(
                            f"Could not initialize Faster-Whisper model: {e}"
                        ) from e

        return self.stt_model

    def get_audio_devices(self) -> List[Dict[str, Any]]:
        """Query available input and output hardware audio devices."""
        devices = []
        if not HAS_PYAUDIO:
            return [
                {
                    "id": 0,
                    "name": "Default Audio Device (PyAudio not installed)",
                    "inputs": 1,
                    "outputs": 2,
                }
            ]

        p = pyaudio.PyAudio()
        try:
            for i in range(p.get_device_count()):
                dev = p.get_device_info_by_index(i)
                devices.append({
                    "id": i,
                    "name": dev.get("name"),
                    "max_input_channels": dev.get("maxInputChannels"),
                    "max_output_channels": dev.get("maxOutputChannels"),
                    "default_sample_rate": int(dev.get("defaultSampleRate", 16000)),
                })
        finally:
            p.terminate()
        return devices

    async def transcribe_audio_bytes(self, audio_data: bytes, format: str = "wav") -> str:
        """Transcribe audio bytes (WAV or raw 16kHz PCM) into text using faster-whisper."""
        if not audio_data:
            return ""

        model = await self.get_stt_model()
        try:
            loop = asyncio.get_running_loop()

            def _do_transcribe():
                if audio_data.startswith(b"RIFF"):
                    audio_input = io.BytesIO(audio_data)
                else:
                    audio_input = (
                        np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
                    )

                segments, _ = model.transcribe(
                    audio_input,
                    beam_size=5,
                    language="en",
                )
                return " ".join([segment.text for segment in segments]).strip()

            result = await loop.run_in_executor(None, _do_transcribe)
            return result or ""
        except Exception as e:
            logger.error(f"Error transcribing audio with Faster-Whisper: {e}")
            raise STTUnavailableError(f"Transcription failed: {e}") from e

    async def transcribe_stream(self, audio_chunk: bytes) -> str:
        """Stream raw 16kHz 16-bit Mono PCM audio chunks to Faster-Whisper."""
        if not audio_chunk:
            return ""

        model = await self.get_stt_model()
        try:
            loop = asyncio.get_running_loop()

            def _do_stream_transcribe():
                if audio_chunk.startswith(b"RIFF"):
                    audio_input = io.BytesIO(audio_chunk)
                else:
                    audio_input = (
                        np.frombuffer(audio_chunk, dtype=np.int16).astype(np.float32) / 32768.0
                    )

                segments, _ = model.transcribe(
                    audio_input,
                    beam_size=5,
                    language="en",
                    vad_filter=True,
                    vad_parameters=dict(min_silence_duration_ms=400),
                )
                text_parts = [seg.text for seg in segments]
                return " ".join(text_parts).strip()

            result = await loop.run_in_executor(None, _do_stream_transcribe)
            return result or ""
        except Exception as e:
            logger.error(f"Streaming transcription error: {e}")
            raise STTUnavailableError(f"Streaming transcription failed: {e}") from e


voice_pipeline = VoicePipeline()
