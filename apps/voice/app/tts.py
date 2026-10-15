"""Piper ile Turkce metinden konusmasi (TTS)."""

import os
import subprocess
import tempfile
from pathlib import Path

DEFAULT_VOICE = "tr_TR-dfki-medium"


def voice_dir() -> Path:
    d = Path(os.getenv("JARVIS_DATA_DIR", Path(__file__).resolve().parents[3] / "data")) / "voices"
    d.mkdir(parents=True, exist_ok=True)
    return d


def synthesize(text: str, voice: str | None = None, speed: float = 1.0) -> bytes:
    v = voice or os.getenv("PIPER_VOICE", DEFAULT_VOICE)
    model = voice_dir() / f"{v}.onnx"
    if not model.exists():
        raise FileNotFoundError(
            f"ses modeli yok: {model} "
            "(once 'uv run python -m piper.download_voices tr_TR-dfki-medium --download-dir ../../data/voices')"
        )
    with tempfile.NamedTemporaryFile(suffix=".wav") as out:
        subprocess.run(
            ["piper", "--model", str(model), "--output_file", out.name,
             "--length-scale", str(1.0 / max(speed, 0.1))],
            input=text.encode("utf-8"),
            check=True,
        )
        return Path(out.name).read_bytes()
