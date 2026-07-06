const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');

let mainWindow = null;
let backendProcess = null;

function getResourceBase() {
  if (app.isPackaged) {
    return process.resourcesPath;
  }
  return path.join(__dirname, '..');
}

function getBackendDir() {
  return path.join(getResourceBase(), 'backend');
}

function getFrontendFile() {
  return path.join(getResourceBase(), 'frontend', 'index.html');
}

function waitForPort(port, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function check() {
      const sock = new net.Socket();
      sock.setTimeout(1000);
      sock.on('connect', () => { sock.destroy(); resolve(); });
      sock.on('error', () => {
        sock.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Port ${port} not ready after ${timeoutMs}ms`));
        } else {
          setTimeout(check, 300);
        }
      });
      sock.connect(port, '127.0.0.1');
    }
    check();
  });
}

function startBackend() {
  return new Promise((resolve, reject) => {
    const backendDir = getBackendDir();
    const serverScript = path.join(backendDir, 'dist', 'main.js');
    const env = {
      ...process.env,
      PORT: '3000',
      NODE_ENV: 'production',
    };

    backendProcess = spawn('node', [serverScript], {
      env,
      cwd: backendDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const output = [];
    backendProcess.stdout.on('data', (data) => { output.push(data.toString()); });
    backendProcess.stderr.on('data', (data) => { output.push(data.toString()); });

    backendProcess.on('error', (err) => {
      reject(new Error(`Backend start error: ${err.message}\n${output.join('')}`));
    });

    backendProcess.on('exit', (code) => {
      reject(new Error(`Backend exited code=${code}\n${output.join('')}`));
    });

    waitForPort(3000).then(resolve).catch(reject);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'OKX Trading',
    backgroundColor: '#0f1116',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'splash.html'));
  mainWindow.show();

  startBackend()
    .then(() => { mainWindow.loadFile(getFrontendFile()); })
    .catch((err) => {
      mainWindow.loadURL(`data:text/html,
        <html><body style="background:#0f1116;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;flex-direction:column;padding:40px;text-align:center">
          <h2 style="color:#ff4757">Startup Failed</h2>
          <p style="color:#ccc;font-size:14px;max-width:500px;word-break:break-all">${err.message.replace(/\n/g, '<br>')}</p>
        </body></html>
      `);
    });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(createWindow);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (backendProcess) { backendProcess.kill(); backendProcess = null; }
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (backendProcess) { backendProcess.kill(); backendProcess = null; }
});
