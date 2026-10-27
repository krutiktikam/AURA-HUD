import os

import pytest

from backend.voice_pipeline import HAS_FASTER_WHISPER, VoicePipeline


@pytest.mark.stt
@pytest.mark.skipif(
    not HAS_FASTER_WHISPER or not os.environ.get("RUN_STT_TESTS"),
    reason="Real STT integration tests are skipped by default. Set RUN_STT_TESTS=1 to run.",
)
@pytest.mark.asyncio
async def test_real_faster_whisper_tiny_en():
    pipeline = VoicePipeline()
    model = await pipeline.get_stt_model()
    assert model is not None
    assert pipeline.stt_model is not None
