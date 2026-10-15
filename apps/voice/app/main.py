import os
import tempfile
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from .stt import transcribe_file
from . import tts as tts_mod
from .profile import load_profile, save_profile

app = FastAPI(title="jarvis-voice")

FAILOVER = {"mode": os.getenv("STT_MODE", "local")}

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
