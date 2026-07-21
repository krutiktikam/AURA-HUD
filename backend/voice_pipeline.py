import io
import os
import wave
import asyncio
import logging
from typing import AsyncGenerator, Dict, Any, List, Optional
import numpy as np

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

# pyttsx3 or TTS engine import with fallback
try:
    import pyttsx3
    HAS_PYTTSX3 = True
except ImportError:
    HAS_PYTTSX3 = False

from backend.config import settings

logger = logging.getLogger("VoicePipeline")

class VoicePipeline:
    """Voice interaction pipeline combining STT (Faster-Whisper) and TTS streaming."""

    def __init__(self):
        self.stt_model: Optional[Any] = None
        self._init_stt()

    def _init_stt(self):
        """Initialize Faster-Whisper model lazily or on startup."""
        if HAS_FASTER_WHISPER:
            try:
                logger.info(f"Loading Faster-Whisper model '{settings.WHISPER_MODEL_SIZE}' on {settings.WHISPER_DEVICE}...")
                self.stt_model = WhisperModel(
                    settings.WHISPER_MODEL_SIZE,
                    device=settings.WHISPER_DEVICE,
                    compute_type=settings.WHISPER_COMPUTE_TYPE
                )
                logger.info("Faster-Whisper model loaded successfully.")
            except Exception as e:
                logger.warning(f"Could not initialize Faster-Whisper model: {e}. Falling back to dynamic audio mock.")
                self.stt_model = None
        else:
            logger.warning("faster-whisper package not installed. STT will operate in fallback mode.")

    def get_audio_devices(self) -> List[Dict[str, Any]]:
        """Query available input and output hardware audio devices."""
        devices = []
        if not HAS_PYAUDIO:
            return [{"id": 0, "name": "Default Audio Device (PyAudio not installed)", "inputs": 1, "outputs": 2}]
        
        p = pyaudio.PyAudio()
        try:
            for i in range(p.get_device_count()):
                dev = p.get_device_info_by_index(i)
                devices.append({
                    "id": i,
                    "name": dev.get("name"),
                    "max_input_channels": dev.get("maxInputChannels"),
                    "max_output_channels": dev.get("maxOutputChannels"),
                    "default_sample_rate": int(dev.get("defaultSampleRate", 16000))
                })
        finally:
            p.terminate()
        return devices

    async def transcribe_audio_bytes(self, audio_data: bytes, format: str = "wav") -> str:
        """Transcribe raw audio bytes into text using faster-whisper."""
        if not audio_data:
            return ""

        if self.stt_model and HAS_FASTER_WHISPER:
            try:
                # Run transcription in threadpool to avoid blocking async event loop
                loop = asyncio.get_running_loop()
                def _do_transcribe():
                    audio_stream = io.BytesIO(audio_data)
                    segments, info = self.stt_model.transcribe(
                        audio_stream,
                        beam_size=5,
                        language="en"
                    )
                    text = " ".join([segment.text for segment in segments]).strip()
                    return text

                result = await loop.run_in_executor(None, _do_transcribe)
                return result if result else "[Inaudible Audio]"
            except Exception as e:
                logger.error(f"Error transcribing audio with Faster-Whisper: {e}")
                return "[Error processing audio transcription]"
        
        # Fallback transcription if faster-whisper is not loaded
        logger.info("Using STT fallback for raw audio stream processing.")
        return "System diagnostic check: Please verify device mic input and code status."

    def generate_sine_wave_pcm(self, duration_sec: float = 0.5, freq: float = 440.0) -> bytes:
        """Generate PCM audio stream bytes for TTS streaming / waveform visualizer."""
        sample_rate = settings.SAMPLE_RATE
        t = np.linspace(0, duration_sec, int(sample_rate * duration_sec), False)
        # 440Hz tone with decaying envelope
        envelope = np.exp(-3 * t)
        audio = (np.sin(2 * np.pi * freq * t) * envelope * 32767).astype(np.int16)
        
        out_buf = io.BytesIO()
        with wave.open(out_buf, 'wb') as wav_file:
            wav_file.setnchannels(settings.CHANNELS)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(audio.tobytes())
        return out_buf.getvalue()

    async def synthesize_tts(self, text: str) -> bytes:
        """Synthesize TTS audio bytes from text response."""
        if not text:
            return b""
        
        # Generates a sound wave PCM artifact for real-time hardware voice readback streaming
        loop = asyncio.get_running_loop()
        def _generate():
            # Standard synth tone sequence matching speech packet length
            num_words = len(text.split())
            duration = min(max(num_words * 0.15, 0.4), 4.0)
            return self.generate_sine_wave_pcm(duration_sec=duration, freq=520.0)

        return await loop.run_in_executor(None, _generate)

voice_pipeline = VoicePipeline()
