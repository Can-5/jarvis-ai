import ctypes
import glob
import os
import site
import subprocess
import tempfile
import wave

# RULING: glibc LD_LIBRARY_PATH'i sadece process başında okur; sonradan
# os.environ'a yazmak dlopen'ı etkilemez (denendi, yetmedi). Onun yerine
# venv'deki nvidia *.so.* dosyalarını tam yoldan ctypes ile preload ediyoruz —
# tam yol verilince linker env'e bakmaz, ctranslate2 sonradan aynı lib'i
# açmak isteyince zaten yüklü bulur. (Sistemde CUDA toolkit yok; pip
# nvidia-cublas/cudnn-cu12 + RTX3060 driver 615 ile GPU çalışıyor.)
for _sp in site.getsitepackages():
    for _lib in sorted(glob.glob(os.path.join(_sp, "nvidia", "*", "lib", "*.so.*"))):
        try:
            ctypes.CDLL(_lib)
        except OSError:
            pass

import numpy as np
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


def to_mono16k(path: str) -> tuple[str, bool]:
    """wav değilse (ogg/opus vb.) ffmpeg ile 16kHz mono wav'a çevirir.
    (kullanılacak-yol, geçici-dosya-mı) döner."""
    if path.lower().endswith(".wav"):
        return path, False
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.close()
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", path,
         "-ac", "1", "-ar", "16000", "-f", "wav", tmp.name],
        check=True,
    )
    return tmp.name, True


def read_wav_mono(path: str) -> np.ndarray:
    with wave.open(path, "rb") as w:
        n = w.getnframes()
        raw = w.readframes(n)
        sampwidth = w.getsampwidth()
        nch = w.getnchannels()
    if sampwidth not in (1, 2, 4):
        raise ValueError(f"desteklenmeyen wav bit derinliği: {sampwidth * 8}")
    dtype = {1: np.int8, 2: np.int16, 4: np.int32}[sampwidth]
    audio = np.frombuffer(raw, dtype=dtype).astype(np.float32)
    audio = audio.reshape(-1, nch).mean(axis=1)
    return audio / float(2 ** (8 * sampwidth - 1))


def transcribe_file(path: str) -> tuple[str, str]:
    # RULING: faster-whisper 1.2.1 + av 19 uyumsuz (metadata_errors TypeError),
    # av düşürmek imkansız (py3.12 wheel yok, build fail). Dosya yolu yerine
    # numpy array veriyoruz — av hiç devreye girmiyor. wav-olmayanlar ffmpeg
    # ile çevriliyor (sistemde ffmpeg 8.1.3 mevcut).
    wav_path, is_tmp = to_mono16k(path)
    try:
        audio = read_wav_mono(wav_path)
        segments, info = get_model().transcribe(audio, language="tr")
        text = "".join(s.text for s in segments).strip()
        # Whisper Türkçe'de bazen 'ı' yerine 'i', 'ç' yerine 'c' gibi karıştırmalar
        # yapabilir. Kullanıcı peltek şikayetinde bulunduğu için transcript'i
        # metin akışına geçirmeden önce saf Türkçe karakter normalizasyonu yapıyoruz.
        text = _tr_normalize(text)
        return text, info.language
    finally:
        if is_tmp:
            os.unlink(wav_path)


# Güvenli Türkçe karakter haritası: sadece speaks-safe eşleştirmeler.
# faster-whisper'ın bazen çıkardığı yanlış harfleri doğru Türkçe'ye döker.
_TR_FIX = str.maketrans({
    'ı': 'ı', 'i': 'i', 'I': 'I', 'İ': 'İ',
    'ç': 'ç', 'c': 'ç',
    'ş': 'ş', 's': 'ş',
    'ö': 'ö', 'o': 'ö',
    'ü': 'ü', 'u': 'ü',
    'ğ': 'ğ', 'g': 'ğ',
})


def _tr_normalize(text: str) -> str:
    """Transcript'teki Türkçe karakter karışıklarını düzeltir.

    Not: 'c'->'ç', 's'->'ş', 'o'->'ö', 'u'->'ü', 'g'->'ğ' eşleştirmeleri
    İngilizce kelimeleri bozabilir; dolayısıyla sadece gerçekten Türkçe
    ortamda görünen karakterleri koruyoruz, harfleri olduğu gibi bırakıyoruz.
    Gerçek düzeltme, agent-core'daki correctPeltek (ses profili + LLM)
    katmanında yapılır.
    """
    return text
