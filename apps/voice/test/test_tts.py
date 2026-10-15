from fastapi.testclient import TestClient

import app.tts as tts
from app.main import app


def test_tts(monkeypatch):
    monkeypatch.setattr(tts, "synthesize", lambda text, voice, speed: b"RIFF-FAKE-WAV")
    r = TestClient(app).post("/tts", json={"text": "selam", "speed": 1.0})
    assert r.status_code == 200
    assert r.headers["content-type"] == "audio/wav"
    assert r.content.startswith(b"RIFF")


def test_tts_bos_metin_400():
    r = TestClient(app).post("/tts", json={"text": "  "})
    assert r.status_code == 400
