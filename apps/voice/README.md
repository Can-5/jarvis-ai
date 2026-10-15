# jarvis-voice (port 8765)

İzole Python ses servisi: yerel Whisper STT + Piper Türkçe TTS + ses profili + bulut failover prizi.
Çökse bile chat/kod modu çalışmaya devam eder (ayrı süreç).

```bash
uv sync --group dev
uv run pytest                    # hizli testler
SMOKE=1 uv run pytest            # gercek model testi (RTX3060, model indirir)
uv run uvicorn app.main:app --port 8765
```

Env: `WHISPER_MODEL` (varsayılan small), `JARVIS_DATA_DIR`, `PIPER_VOICE`,
`PIPER_BIN`, `PIPER_VOICE_PATH`, `STT_MODE`, `CLOUD_STT_URL`.
Türkçe ses: `tr_TR-dfki-medium` (63MB, `data/voices/` altında — git dışı).
