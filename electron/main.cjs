const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');

let mainWindow;
let serverProcess;
let voiceProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'JARVIS',
    icon: path.join(__dirname, '../apps/web/public/icon.svg'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    show: false,
  });

  mainWindow.loadURL('http://localhost:3000');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

async function tryStartServer() {
  try {
    await new Promise((resolve, reject) => {
      const serverBin = path.join(__dirname, '../apps/server/dist/src/index.js');
      serverProcess = spawn('node', [serverBin], {
        cwd: path.join(__dirname, '..'),
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, JARVIS_SERVE: '1' },
      });

      let resolved = false;
      serverProcess.stdout.on('data', (data) => {
        const line = data.toString();
        if (line.includes(':3000 dinliyor') && !resolved) {
          resolved = true;
          resolve();
        }
      });

      serverProcess.stderr.on('data', () => {});

      serverProcess.on('error', (err) => {
        if (!resolved) reject(err);
      });

      setTimeout(() => {
        if (!resolved) {
          console.warn('[server] zaten çalışıyor olabilir, devam ediliyor');
          resolve();
        }
      }, 8000);
    });
  } catch (err) {
    console.warn('[server] başlatılamadı:', err.message);
  }
}

async function tryStartVoice() {
  try {
    await new Promise((resolve) => {
      const voiceDir = path.join(__dirname, '../apps/voice');
      const venvPython = path.join(voiceDir, '.venv', 'bin', 'python');
      const pythonCmd = fs.existsSync(venvPython) ? venvPython : 'python3';

      voiceProcess = spawn(pythonCmd, ['-m', 'uvicorn', 'app.main:app', '--port', '8765'], {
        cwd: voiceDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, JARVIS_DATA_DIR: path.join(__dirname, '..', 'data') },
      });

      voiceProcess.stdout.on('data', (data) => {
        const line = data.toString();
        if (line.includes('Uvicorn running') || line.includes('Application startup complete')) {
          resolve();
        }
      });

      voiceProcess.stderr.on('data', () => {});

      voiceProcess.on('error', () => resolve());

      setTimeout(() => resolve(), 8000);
    });
  } catch (err) {
    console.warn('[voice] başlatılamadı:', err.message);
  }
}

async function stopProcesses() {
  if (serverProcess) {
    try { serverProcess.kill('SIGTERM'); } catch (_) {}
    serverProcess = null;
  }
  if (voiceProcess) {
    try { voiceProcess.kill('SIGTERM'); } catch (_) {}
    voiceProcess = null;
  }
  await promisify(exec)("pkill -f 'cloudflared.*3000'").catch(() => undefined);
}

app.whenReady().then(async () => {
  await tryStartServer();
  await tryStartVoice();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopProcesses();
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', async () => {
  await stopProcesses();
});

ipcMain.handle('app:quit', async () => {
  await stopProcesses();
  app.quit();
});
