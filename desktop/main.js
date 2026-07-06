const { app, BrowserWindow } = require('electron');
const { fork } = require('child_process');
const path = require('path');

let mainWindow = null;
let backendProcess = null;

function startBackend() {
  return new Promise((resolve, reject) => {
    const isPackaged = app.isPackaged;
    const basePath = isPackaged
      ? process.resourcesPath
      : path.join(__dirname, '..');

    const backendDist = isPackaged
      ? path.join(basePath, 'backend')
      : path.join(basePath, 'backend', 'dist');

    const backendCwd = isPackaged
      ? path.join(basePath, 'backend')
      : path.join(basePath, 'backend');

    const dbPath = isPackaged
      ? `file:${path.join(backendCwd, 'dev.db').replace(/\\/g, '/')}`
      : 'file:./dev.db';

    const env = {
      ...process.env,
      PORT: '3000',
      NODE_ENV: 'production',
      DATABASE_URL: dbPath,
    };

    const serverScript = path.join(backendDist, 'main.js');
    backendProcess = fork(serverScript, [], {
      env,
      cwd: backendCwd,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });

    let started = false;

    backendProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (!started) {
        started = true;
        resolve();
      }
    });

    backendProcess.stderr.on('data', (data) => {
      const output = data.toString();
      if (!started) {
        started = true;
        resolve();
      }
    });

    backendProcess.on('error', (err) => {
      if (!started) reject(err);
    });

    backendProcess.on('exit', (code) => {
      if (!started) reject(new Error(`Backend exited with code ${code}`));
    });

    setTimeout(() => {
      if (!started) {
        started = true;
        resolve();
      }
    }, 5000);
  });
}

function createWindow() {
  const isPackaged = app.isPackaged;
  const basePath = isPackaged
    ? process.resourcesPath
    : path.join(__dirname, '..');

  const frontendPath = isPackaged
    ? path.join(basePath, 'frontend', 'index.html')
    : path.join(basePath, 'frontend', 'dist', 'index.html');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'OKX Trading',
    backgroundColor: '#0f1116',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(frontendPath);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    await startBackend();
  } catch (err) {
    console.error('Failed to start backend:', err.message);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
});
