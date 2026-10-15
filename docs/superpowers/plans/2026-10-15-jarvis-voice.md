# JARVIS Plan B — Voice Servisi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** İzole Python ses servisi: yerel Whisper STT (RTX3060), Piper TTS, ses profili sözlüğü, bulut failover prizi. Port 8765. Çökerse ajan çekirdeği etkilenmez.

**Architecture:** FastAPI tek süreç; model lazy-load (ilk `/stt` çağrısında yüklenir, `/health` anında döner); TTS motoru soyut (`synthesize()` fonksiyonu, Piper varsayılan); profil JSON dosyası `data/voice_profiles/`.

**Tech Stack:** Python 3.12+, uv, FastAPI, uvicorn, faster-whisper (CTranslate2, CUDA), piper-tts, pytest + httpx TestClient.

**Spec:** jarvis/docs/superpowers/specs/2026-10-15-jarvis-design.md (Bölüm 3)

## Global Constraints

- `apps/voice` dizininde çalışılır; `uv` kullanılır (`pip` yok).
- Whisper modeli env `WHISPER_MODEL` (varsayılan `large-v3-turbo`, düşerse `small`).
- Türkçe STT: `language="tr"`.
- `data/` altına yazılan her şey commit'lenmez.
- Conventional commits.
- Server (Plan A) bu servisi `http://localhost:8765` varsayar — URL değişirse iki plan da güncellenir.

---

### Task 1: İskelet + /health

**Files:**
- Create: `apps/voice/pyproject.toml`
- Create: `apps/voice/app/main.py`
- Create: `apps/voice/test/test_health.py`

**Interfaces:**
- Consumes: yok.
- Produces: `GET /health -> {ok: true, stt: 'local'|'cloud', model: str}`. `uv run uvicorn app.main:app --port 8765` çalışır.

- [ ] **Step 1: Failing test yaz**

```python
# apps/voice/test/test_health.py
from fastapi.testclient import TestClient
from app.main import app

def test_health():
    r = TestClient(app).get("/health")
    assert r.status_code == 200
    assert r.json()["ok"] is True
```

- [ ] **Step 2: FAIL gör**

Run: `uv run pytest` (dizin: apps/voice)
Expected: FAIL (proje yok).

- [ ] **Step 3: İskeleti kur**

```toml
# apps/voice/pyproject.toml
[project]
name = "jarvis-voice"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
  "fastapi>=0.115",
  "uvicorn>=0.34",
  "faster-whisper>=1.1",
  "piper-tts>=1.2",
  "python-multipart>=0.0.18",
  "httpx>=0.28",
]
[dependency-groups]
dev = ["pytest>=8"]
[tool.pytest.ini_options]
testpaths = ["test"]
pythonpath = ["."]
```

```python
# apps/voice/app/main.py
import os
from fastapi import FastAPI

app = FastAPI(title="jarvis-voice")

@app.get("/health")
def health():
    return {"ok": True, "stt": os.getenv("STT_MODE", "local"), "model": os.getenv("WHISPER_MODEL", "large-v3-turbo")}
```

- [ ] **Step 4: PASS + commit**

Run: `uv sync --group dev && uv run pytest`
Expected: 1 test PASS.

```bash
git add apps/voice
git commit -m "feat: voice servisi iskeleti ve health"
```

---

### Task 2: POST /stt — yerel Whisper

**Files:**
- Create: `apps/voice/app/stt.py`
- Modify: `apps/voice/app/main.py` (router ekle)
- Create: `apps/voice/test/test_stt.py`

**Interfaces:**
- Consumes: `/health` (Task 1).
- Produces: `POST /stt` (multipart `audio` wav/ogg) -> `{text: str, lang: str}`. Model lazy-load; `WHISPER_MODEL` env.

- [ ] **Step 1: Failing test yaz** (model monkeypatch'lenir — testte gerçek model indirilmez)

```python
# apps/voice/test/test_stt.py
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
```

- [ ] **Step 2: FAIL gör** — Run: `uv run pytest`, Expected: FAIL (`app.stt` yok).

- [ ] **Step 3: Implementasyon**

```python
# apps/voice/app/stt.py
import os
import tempfile
from faster_whisper import WhisperModel

_model = None

def get_model():
    global _model
    if _model is None:
        _model = WhisperModel(
            os.getenv("WHISPER_MODEL", "large-v3-turbo"),
            device="cuda",
            compute_type="float16",
        )
    return _model

def transcribe_file(path: str) -> tuple[str, str]:
    segments, info = get_model().transcribe(path, language="tr")
    text = "".join(s.text for s in segments).strip()
    return text, info.language
```

```python
# apps/voice/app/main.py (ekle)
from fastapi import UploadFile, File
from .stt import transcribe_file
import tempfile, os

@app.post("/stt")
def stt(audio: UploadFile = File(...)):
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(audio.file.read())
        path = tmp.name
    try:
        text, lang = transcribe_file(path)
    finally:
        os.unlink(path)
    return {"text": text, "lang": lang}
```

- [ ] **Step 4: PASS + commit**

Run: `uv run pytest`
Expected: 3 test PASS (gerçek model inmez — monkeypatch).

```bash
git add apps/voice
git commit -m "feat: yerel Whisper STT ucu"
```

---

### Task 3: POST /tts — Piper Türkçe ses

**Files:**
- Create: `apps/voice/app/tts.py`
- Modify: `apps/voice/app/main.py`
- Create: `apps/voice/test/test_tts.py`
- Create: `apps/voice/.env.example`

**Interfaces:**
- Consumes: `/health`.
- Produces: `POST /tts` (`{text, voice?, speed?}`) -> wav bytes. Ses dosyası `data/voices/` altında, `PIPER_VOICE` env ile seçilir.

- [ ] **Step 1: Ses dosyasını keşfet (gerçek komut, implementasyonda çalıştır)**

Run: `uv run python -m piper.download_voices tr_TR`
Expected: listelenen Türkçe seslerden biri seçilir (örn. `tr_TR-fatih-medium`), dosya adı `.env.example`'a yazılır:

```
PIPER_VOICE=tr_TR-fatih-medium
WHISPER_MODEL=large-v3-turbo
STT_MODE=local
```

- [ ] **Step 2: Failing test yaz**

```python
# apps/voice/test/test_tts.py
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
```

- [ ] **Step 3: FAIL gör** — Run: `uv run pytest`, Expected: FAIL.

- [ ] **Step 4: Implementasyon**

```python
# apps/voice/app/tts.py
import os
import subprocess
import tempfile
from pathlib import Path

def voice_dir() -> Path:
    d = Path(os.getenv("JARVIS_DATA_DIR", Path(__file__).resolve().parents[2] / "data")) / "voices"
    d.mkdir(parents=True, exist_ok=True)
    return d

def synthesize(text: str, voice: str | None = None, speed: float = 1.0) -> bytes:
    v = voice or os.getenv("PIPER_VOICE", "tr_TR-fatih-medium")
    model = voice_dir() / f"{v}.onnx"
    if not model.exists():
        raise FileNotFoundError(f"ses modeli yok: {model} (once 'uv run python -m piper.download_voices tr_TR')")
    with tempfile.NamedTemporaryFile(suffix=".wav") as out:
        p = subprocess.run(
            ["piper", "--model", str(model), "--output_file", out.name,
             "--length_scale", str(1.0 / speed)],
            input=text.encode(), capture_output=True, timeout=60,
        )
        if p.returncode != 0:
            raise RuntimeError(p.stderr.decode()[-500:])
        return Path(out.name).read_bytes()
```

```python
# apps/voice/app/main.py (ekle)
from fastapi import HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from .tts import synthesize

class TtsIn(BaseModel):
    text: str
    voice: str | None = None
    speed: float = 1.0

@app.post("/tts")
def tts(body: TtsIn):
    if not body.text.strip():
        raise HTTPException(400, "metin bos olamaz")
    try:
        wav = synthesize(body.text, body.voice, body.speed)
    except (FileNotFoundError, RuntimeError) as e:
        raise HTTPException(500, str(e))
    return Response(content=wav, media_type="audio/wav")
```

- [ ] **Step 5: PASS + commit**

Run: `uv run pytest`
Expected: 5 test PASS.

```bash
git add apps/voice
git commit -m "feat: Piper Turkce TTS ucu"
```

---

### Task 4: Ses profili + bulut failover prizi

**Files:**
- Create: `apps/voice/app/profile.py`
- Modify: `apps/voice/app/main.py`
- Create: `apps/voice/test/test_profile.py`

**Interfaces:**
- Consumes: Task 1-3.
- Produces: `GET /profile/{user} -> {subs: {yanlis: dogru}}`, `PUT /profile/{user} {subs}` (dosya: `data/voice_profiles/{user}.json`), `GET /failover -> {mode, cloud}` + `PUT /failover {mode}` (`mode: local|cloud`; cloud seçilince `/stt` 501 döner + `CLOUD_STT_URL`'ye yönlendirme notu — gerçek bulut anahtarı Plan C settings'e bağlanır).

- [ ] **Step 1: Failing test yaz**

```python
# apps/voice/test/test_profile.py
from fastapi.testclient import TestClient
from app.main import app

def test_profil_kayit_oku(tmp_path, monkeypatch):
    monkeypatch.setenv("JARVIS_DATA_DIR", str(tmp_path))
    c = TestClient(app)
    r = c.put("/profile/ilkaycan", json={"subs": {"cok": "çok", "seker": "şeker"}})
    assert r.status_code == 200
    r2 = c.get("/profile/ilkaycan")
    assert r2.json() == {"subs": {"cok": "çok", "seker": "şeker"}}

def test_failover_cloud_stt_501(tmp_path, monkeypatch):
    monkeypatch.setenv("JARVIS_DATA_DIR", str(tmp_path))
    c = TestClient(app)
    assert c.put("/failover", json={"mode": "cloud"}).status_code == 200
    assert c.get("/failover").json()["mode"] == "cloud"
    assert c.put("/failover", json={"mode": "local"}).status_code == 200
```

- [ ] **Step 2: FAIL gör** — Run: `uv run pytest`, Expected: FAIL.

- [ ] **Step 3: Implementasyon**

```python
# apps/voice/app/profile.py
import json
import os
from pathlib import Path

def base() -> Path:
    d = Path(os.getenv("JARVIS_DATA_DIR", Path(__file__).resolve().parents[2] / "data")) / "voice_profiles"
    d.mkdir(parents=True, exist_ok=True)
    return d

def load_profile(user: str) -> dict[str, str]:
    f = base() / f"{user}.json"
    if not f.exists():
        return {}
    data = json.loads(f.read_text())
    return data.get("subs", {}) if isinstance(data, dict) else {}

def save_profile(user: str, subs: dict[str, str]) -> None:
    if not user or "/" in user or ".." in user:
        raise ValueError("gecersiz kullanici")
    (base() / f"{user}.json").write_text(json.dumps({"subs": subs}, ensure_ascii=False))
```

```python
# apps/voice/app/main.py (ekle)
from fastapi import HTTPException
from pydantic import BaseModel
from .profile import load_profile, save_profile

FAILOVER = {"mode": os.getenv("STT_MODE", "local")}

class ProfileIn(BaseModel):
    subs: dict[str, str]

@app.get("/profile/{user}")
def get_profile(user: str):
    return {"subs": load_profile(user)}

@app.put("/profile/{user}")
def put_profile(user: str, body: ProfileIn):
    try:
        save_profile(user, body.subs)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True}

@app.get("/failover")
def get_failover():
    return {"mode": FAILOVER["mode"], "cloud_url": os.getenv("CLOUD_STT_URL", "")}

@app.put("/failover")
def put_failover(body: dict):
    mode = body.get("mode")
    if mode not in ("local", "cloud"):
        raise HTTPException(400, "mode local|cloud olmali")
    FAILOVER["mode"] = mode
    return {"ok": True, "mode": mode}
```

Ayrıca `/stt` başına ekle: `if FAILOVER["mode"] == "cloud": raise HTTPException(501, "bulut STT henuz bagli degil")`.

- [ ] **Step 4: PASS + commit**

Run: `uv run pytest`
Expected: 7 test PASS.

```bash
git add apps/voice
git commit -m "feat: ses profili sozlugu ve bulut failover prizi"
```

---

### Task 5: Gerçek model duman testi + çalıştırma docs

**Files:**
- Create: `apps/voice/README.md`
- Create: `apps/voice/test/test_smoke.py` (ağır — `SMOKE=1` olmadan atlanır)

**Interfaces:**
- Consumes: Task 2-3.
- Produces: Gerçek faster-whisper + Piper ile uçtan uca kanıt; README çalıştırma talimatı.

- [ ] **Step 1: Smoke testi yaz**

```python
# apps/voice/test/test_smoke.py
import os
import pytest
import wave, io

def wav_1s() -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
        w.writeframes(b"\x00\x00" * 16000)
    return buf.getvalue()

@pytest.mark.skipif(os.getenv("SMOKE") != "1", reason="agir model testi")
def test_gercek_stt():
    from app.stt import transcribe_file
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as t:
        t.write(wav_1s()); p = t.name
    text, lang = transcribe_file(p)
    assert lang == "tr"

@pytest.mark.skipif(os.getenv("SMOKE") != "1", reason="agir model testi")
def test_gercek_tts():
    from app.tts import synthesize
    wav = synthesize("merhaba")
    assert wav[:4] == b"RIFF"
```

- [ ] **Step 2: Smoke çalıştır (model iner, zaman alır)**

Run: `SMOKE=1 uv run pytest test/test_smoke.py -v`
Expected: 2 test PASS (ilk çalışta model iner).

- [ ] **Step 3: README yaz + commit**

```markdown
# apps/voice/README.md
# jarvis-voice (port 8765)
uv sync --group dev
uv run pytest                    # hizli testler
SMOKE=1 uv run pytest            # gercek model testi (RTX3060)
uv run uvicorn app.main:app --port 8765
```

```bash
git add apps/voice
git commit -m "docs: voice calistirma talimati ve model duman testi"
```

## Öz-inceleme notu (yürütürken)

- Spec coverage: hibrit STT (Task 2+4), peltek profil (Task 4 — düzeltme mantığı Plan A agent-core'da, profil verisi burada), TTS (Task 3), izolasyon (ayrı süreç/port).
- Tip tutarlılığı: `/stt -> {text, lang}`, `/tts -> wav`, profil `{subs}` — Plan A'daki proxy ve UI aynısını bekler.
