@echo off
chcp 65001 >nul
title JARVIS Yükleyici

echo ========================================
echo   JARVIS AI Asistan - Windows Yükleyici
echo ========================================
echo.

:: Kontrol: Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [HATA] Node.js bulunamadi!
    echo Lutfen https://nodejs.org/ adresinden Node.js (LTS) indirin ve kurun.
    echo Kurduktan sonra bu dosyayi tekrar calistirin.
    echo.
    pause
    exit /b 1
)

:: Kontrol: Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [HATA] Python bulunamadi!
    echo Lutfen https://www.python.org/ adresinden Python 3.12 indirin ve kurun.
    echo Kurarken "Add Python to PATH" isaretli olmali.
    echo.
    pause
    exit /b 1
)

:: Kontrol: uv
where uv >nul 2>&1
if %errorlevel% neq 0 (
    echo [BILGI] uv yukleniyor...
    powershell -Command "irm https://astral.sh/uv/install.ps1 | iex" >nul 2>&1
    where uv >nul 2>&1
    if %errorlevel% neq 0 (
        echo [UYARI] uv yuklenemedi. Voice servisi kismi calismayabilir.
    ) else (
        echo [TAMAM] uv yuklendi.
    )
)

:: Kontrol: ffmpeg
where ffmpeg >nul 2>&1
if %errorlevel% neq 0 (
    echo [UYARI] ffmpeg bulunamadi. Kamera/video ozelligi kismi calismayabilir.
    echo ffmpeg icin: https://ffmpeg.org/download.html
)

echo.
echo [1/6] Repoyu indiriliyor...
if not exist "jarvis-ai" (
    git clone https://github.com/Can-5/jarvis-ai.git
    if %errorlevel% neq 0 (
        echo [HATA] Repo indirilemedi. Internet baglantinizi kontrol edin.
        pause
        exit /b 1
    )
)
cd jarvis-ai

echo [2/6] Node paketleri yukleniyor...
npm install --legacy-peer-deps
if %errorlevel% neq 0 (
    echo [HATA] npm install basarisiz oldu.
    pause
    exit /b 1
)

echo [3/6] Python voice servisi yukleniyor...
cd apps/voice
uv sync
if %errorlevel% neq 0 (
    echo [HATA] uv sync basarisiz oldu.
    cd ..\..
    pause
    exit /b 1
)

echo [4/6] Turkce TTS modeli indiriliyor...
uv run python -m piper.download_voices tr_TR-dfki-medium --download-dir ..\data\voices
if %errorlevel% neq 0 (
    echo [UYARI] TTS modeli indirilemedi. Sesli cevap kismi calismayabilir.
)
cd ..\..

echo [5/6] Masaustu kisa yolu olusturulur...
set "SHORTCUT=%USERPROFILE%\Desktop\JARVIS.lnk"
powershell -Command "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%SHORTCUT%'); $Shortcut.TargetPath = 'cmd.exe'; $Shortcut.Arguments = '/c cd /d %CD% && npm run start'; $Shortcut.WorkingDirectory = '%CD%'; $Shortcut.IconLocation = '%CD%\apps\web\public\icon.svg'; $Shortcut.Description = 'JARVIS AI Asistan'; $Shortcut.Save()"
echo [TAMAM] Masaustunda 'JARVIS' kisa yolu olusturuldu.

echo [6/6] JARVIS baslatiliyor...
start cmd /k "npm run start"

echo.
echo ========================================
echo   JARVIS baslatildi!
echo   Tarayici: http://localhost:3000
echo   Masaustu kisa yolu: JARVIS.lnk
echo ========================================
echo.
pause
