import json
import os
from pathlib import Path


def base() -> Path:
    d = Path(os.getenv("JARVIS_DATA_DIR", Path(__file__).resolve().parents[3] / "data")) / "voice_profiles"
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
