# apps/voice/test/test_smoke.py
import io
import os
import wave

import pytest


def wav_1s() -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(b"\x00\x00" * 16000)
    return buf.getvalue()


@pytest.mark.skipif(os.getenv("SMOKE") != "1", reason="agir model testi")
def test_gercek_stt():
    from app.stt import transcribe_file
    import tempfile

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as t:
        t.write(wav_1s())
        p = t.name
    text, lang = transcribe_file(p)
    assert lang == "tr"


@pytest.mark.skipif(os.getenv("SMOKE") != "1", reason="agir model testi")
def test_gercek_tts():
    from app.tts import synthesize

    wav = synthesize("merhaba")
    assert wav[:4] == b"RIFF"
