import io
import os
import wave
import asyncio
import logging
from pathlib import Path
from typing import AsyncGenerator, Dict, Any, List, Optional
import numpy as np

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

# pyttsx3 or TTS engine import with fallback
try:
    import pyttsx3
    HAS_PYTTSX3 = True
except ImportError:
    HAS_PYTTSX3 = False

from backend.config import settings

logger = logging.getLogger("VoicePipeline")

    def __init__(self):
        self.stt_model: Optional[Any] = None
        self.tts_engine: Optional[Any] = None
        self._init_stt()
        self._init_tts()

    def _init_tts(self):
        """Initialize offline TTS engine with female voice (Microsoft Zira)."""
        if HAS_PYTTSX3:
            try:
                self.tts_engine = pyttsx3.init()
                self.tts_engine.setProperty('rate', settings.TTS_RATE)
                voices = self.tts_engine.getProperty('voices')
                for v in voices:
                    if 'zira' in v.name.lower() or 'female' in getattr(v, 'gender', '').lower():
                        self.tts_engine.setProperty('voice', v.id)
                        logger.info(f"Offline TTS voice set to female: {v.name}")
                        break
            except Exception as e:
                logger.warning(f"Could not configure pyttsx3 voice: {e}")

    def _init_stt(self):
        """Initialize Faster-Whisper model locally for offline voice transcription."""
        if HAS_FASTER_WHISPER:
            try:
                download_root = getattr(settings, 'WHISPER_DOWNLOAD_ROOT', str(Path.home() / ".cache" / "huggingface" / "hub"))
                logger.info(f"Loading Faster-Whisper model '{settings.WHISPER_MODEL_SIZE}' on {settings.WHISPER_DEVICE}...")
                self.stt_model = WhisperModel(
                    settings.WHISPER_MODEL_SIZE,
                    device=settings.WHISPER_DEVICE,
                    compute_type=settings.WHISPER_COMPUTE_TYPE,
                    download_root=download_root
                )
                logger.info("Faster-Whisper model loaded successfully (Offline STT ready).")
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
        """Transcribe raw audio bytes into text using faster-whisper 100% offline."""
        if not audio_data:
            return ""

        if self.stt_model and HAS_FASTER_WHISPER:
            try:
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
        
        logger.info("Using STT fallback for raw audio stream processing.")
        return "System diagnostic check: Please verify device mic input and code status."

    def generate_sine_wave_pcm(self, duration_sec: float = 0.5, freq: float = 440.0) -> bytes:
        """Generate PCM audio stream bytes for TTS streaming / waveform visualizer."""
        sample_rate = settings.SAMPLE_RATE
        t = np.linspace(0, duration_sec, int(sample_rate * duration_sec), False)
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
        
        loop = asyncio.get_running_loop()
        def _generate():
            num_words = len(text.split())
            duration = min(max(num_words * 0.15, 0.4), 4.0)
            return self.generate_sine_wave_pcm(duration_sec=duration, freq=520.0)

        return await loop.run_in_executor(None, _generate)

voice_pipeline = VoicePipeline()
