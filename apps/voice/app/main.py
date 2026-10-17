import hashlib
import json
import os
import tempfile
import wave
import numpy as np
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from .stt import transcribe_file, read_wav_mono
from . import tts as tts_mod
from .profile import load_profile, save_profile

app = FastAPI(title="jarvis-voice")

FAILOVER = {"mode": os.getenv("STT_MODE", "local")}

VAD_THRESHOLD = float(os.getenv("VAD_THRESHOLD", "0.02"))

VOICE_SIG_DIR = os.path.join(os.getenv("JARVIS_DATA_DIR", "/home/ilkaycan/Belgeler/Default Project/jarvis/data"), "voice_signatures")
os.makedirs(VOICE_SIG_DIR, exist_ok=True)


def _voice_signature(audio_data: np.ndarray) -> dict:
    rms = float(np.sqrt(np.mean(audio_data ** 2)))
    fft = np.abs(np.fft.rfft(audio_data))
    freq_bins = np.array_split(fft, 10)
    band_energies = [float(np.mean(b)) for b in freq_bins]
    zero_crossings = float(np.sum(np.diff(np.sign(audio_data)) != 0)) / len(audio_data)
    return {
        "rms": rms,
        "band_energies": band_energies,
        "zero_crossings": zero_crossings,
        "duration": len(audio_data) / 16000.0,
    }


def _sig_path(user: str) -> str:
    return os.path.join(VOICE_SIG_DIR, f"{user}.json")


def _compare_sig(a: dict, b: dict) -> float:
    try:
        rms_diff = abs(a["rms"] - b["rms"]) / max(a["rms"], b["rms"], 0.001)
        energy_diff = float(np.mean(np.abs(np.array(a["band_energies"]) - np.array(b["band_energies"])))) / max(float(np.mean(a["band_energies"])), 0.001)
        zc_diff = abs(a["zero_crossings"] - b["zero_crossings"])
        score = 1.0 - min(1.0, (rms_diff + energy_diff + zc_diff) / 3.0)
        return max(0.0, min(1.0, score))
    except Exception:
        return 0.0


class EnrollIn(BaseModel):
    user: str


class VerifyIn(BaseModel):
    user: str


class SpoofCheckIn(BaseModel):
    pass

@app.get("/health")
def health():
    return {"ok": True, "stt": os.getenv("STT_MODE", "local"), "model": os.getenv("WHISPER_MODEL", "large-v3-turbo")}

@app.post("/stt")
def stt(audio: UploadFile = File(...)):
    if FAILOVER["mode"] == "cloud":
        raise HTTPException(501, "bulut STT henuz bagli degil")
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(audio.file.read())
        path = tmp.name
    try:
        text, lang = transcribe_file(path)
    finally:
        os.unlink(path)
    return {"text": text, "lang": lang}

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


@app.get("/voices")
def list_voices():
    return {"voices": tts_mod.list_voices(), "default": os.getenv("PIPER_VOICE", tts_mod.DEFAULT_VOICE)}


@app.post("/vad")
def vad(audio: UploadFile = File(...)):
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(audio.file.read())
        path = tmp.name
    try:
        audio_data = read_wav_mono(path)
        rms = float(np.sqrt(np.mean(audio_data ** 2)))
        return {"speech": rms > VAD_THRESHOLD, "rms": rms, "threshold": VAD_THRESHOLD}
    finally:
        os.unlink(path)


class TtsIn(BaseModel):
    text: str
    voice: str | None = None
    speed: float = 1.0

@app.post("/tts")
def tts(inp: TtsIn):
    if not inp.text.strip():
        from fastapi import HTTPException
        raise HTTPException(400, "bos metin")
    wav = tts_mod.synthesize(inp.text, inp.voice, inp.speed)
    return Response(content=wav, media_type="audio/wav")


WAKE_WORDS = ["jarvis", "j.a.r.v.i.s", "jervis", "yarvis"]


@app.post("/wake-word")
def wake_word(audio: UploadFile = File(...)):
    """Ses dosyasinda uyandirma kelimesi (JARVIS) var mi kontrol eder."""
    if FAILOVER["mode"] == "cloud":
        raise HTTPException(501, "bulut STT henuz bagli degil")
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(audio.file.read())
        path = tmp.name
    try:
        text, lang = transcribe_file(path)
        text_lower = text.lower().replace(".", "").replace(" ", "")
        detected = any(ww.replace(".", "").replace(" ", "") in text_lower for ww in WAKE_WORDS)
        return {"detected": detected, "text": text, "lang": lang}
    finally:
        os.unlink(path)


@app.post("/voice/enroll")
def voice_enroll(body: EnrollIn):
    sig_path = _sig_path(body.user)
    if os.path.exists(sig_path):
        return {"ok": True, "enrolled": True, "user": body.user, "note": "zaten kayitli"}
    empty_sig = {"rms": 0.0, "band_energies": [0.0] * 10, "zero_crossings": 0.0, "duration": 0.0}
    with open(sig_path, "w", encoding="utf-8") as f:
        json.dump({"user": body.user, "signature": empty_sig}, f, ensure_ascii=False)
    return {"ok": True, "enrolled": True, "user": body.user, "note": "bos imza kaydedildi, ses kaydiyle guncellenmeli"}


@app.post("/voice/verify")
def voice_verify(body: VerifyIn):
    sig_path = _sig_path(body.user)
    if not os.path.exists(sig_path):
        return {"verified": False, "reason": "kullanici kayitli degil", "score": 0.0}
    with open(sig_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    stored_sig = data.get("signature", {})
    if not stored_sig or stored_sig.get("rms", 0) == 0:
        return {"verified": False, "reason": "gecerli ses imzasi yok, once kayit olunmali", "score": 0.0}
    return {"verified": False, "reason": "ses dogrulama icin ses dosyasi gereklidir", "score": 0.0, "stored": True}


@app.post("/voice/spoof-check")
def voice_spoof_check(inp: SpoofCheckIn):
    return {"spoof_detected": False, "confidence": 0.0, "note": "gercek ses dosyasi ile calistirilmeli"}
