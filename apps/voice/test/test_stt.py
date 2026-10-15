import io, wave
from fastapi.testclient import TestClient
import app.stt as stt
from app.main import app

def wav_bytes() -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
        w.writeframes(b"\x00\x00" * 16000)
    return buf.getvalue()

class FakeModel:
    def transcribe(self, path, language):
        assert language == "tr"
        Seg = type("S", (), {})
        s = Seg(); s.text = "merhaba jarvis"
        return [s], type("I", (), {"language": "tr"})()

def test_stt(monkeypatch):
    monkeypatch.setattr(stt, "_model", FakeModel())
    r = TestClient(app).post("/stt", files={"audio": ("ses.wav", wav_bytes(), "audio/wav")})
    assert r.status_code == 200
    assert r.json() == {"text": "merhaba jarvis", "lang": "tr"}

def test_stt_dosyasiz_400():
    r = TestClient(app).post("/stt")
    assert r.status_code in (400, 422)
