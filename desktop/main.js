const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');
const fs = require('fs');
const crypto = require('crypto');

let mainWindow = null;
let backendProcess = null;
let updateWindow = null;

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function getResourceBase() {
  if (app.isPackaged) {
    return process.resourcesPath;
  }
  return path.join(__dirname, '..');
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

function getBackendNode() {
  const runtimeName = process.platform === 'win32' ? 'node.exe' : 'node';
  const packagedNode = path.join(process.resourcesPath, 'node', runtimeName);
  const localNode = path.join(__dirname, 'runtime', runtimeName);
  if (app.isPackaged) {
    if (!fs.existsSync(packagedNode)) {
      throw new Error(
        `安装包缺少内置 Node 运行时：${packagedNode}。请重新构建安装包，不能依赖用户系统 Node。`,
      );
    }
    return packagedNode;
  }
  if (fs.existsSync(localNode)) return localNode;
  const configured = process.env.OKX_NODE_BINARY;
  if (configured && fs.existsSync(configured)) return configured;
  return 'node';
}

/**
 * 安装包不再携带 backend/.env。
 *
 * 后端在 NODE_ENV=production 下必须拿到 ACCOUNT_ENCRYPTION_KEY，因此这里为每台机器
 * 生成独立密钥并保存在用户数据目录：升级时保留，不同用户/机器之间互不相同。
 * 如需集中管理，可用同名环境变量覆盖。
 */
function loadOrCreateSecrets() {
  const dir = app.getPath('userData');
  const file = path.join(dir, 'runtime-secrets.json');
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (
      typeof saved.accountEncryptionKey === 'string' &&
      /^[0-9a-fA-F]{64}$/.test(saved.accountEncryptionKey) &&
      typeof saved.authJwtSecret === 'string' &&
      saved.authJwtSecret.length >= 32
    ) {
      return saved;
    }
  } catch {
    // 首次启动或文件损坏时重新生成
  }

  const secrets = {
    accountEncryptionKey: crypto.randomBytes(32).toString('hex'),
    authJwtSecret: crypto.randomBytes(48).toString('hex'),
  };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(secrets, null, 2), { encoding: 'utf-8', mode: 0o600 });
  return secrets;
}

function startBackend() {
  return new Promise((resolve, reject) => {
    const backendDir = path.join(getResourceBase(), 'backend');
    const serverScript = path.join(backendDir, 'dist', 'main.js');
    let nodeBinary;
    try {
      nodeBinary = getBackendNode();
    } catch (error) {
      reject(error);
      return;
    }
    const secrets = loadOrCreateSecrets();
    const env = {
      ...process.env,
      PORT: '3000',
      NODE_ENV: 'production',
      ACCOUNT_ENCRYPTION_KEY: process.env.ACCOUNT_ENCRYPTION_KEY || secrets.accountEncryptionKey,
      AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET || secrets.authJwtSecret,
    };

    backendProcess = spawn(nodeBinary, [serverScript], {
      env,
      cwd: backendDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const output = [];
    backendProcess.stdout.on('data', (d) => { output.push(d.toString()); });
    backendProcess.stderr.on('data', (d) => { output.push(d.toString()); });
    backendProcess.on('error', (err) => {
      reject(new Error(`Backend start error: ${err.message}\n${output.join('')}`));
    });
    backendProcess.on('exit', (code) => {
      reject(new Error(`Backend exited code=${code}\n${output.join('')}`));
    });

    waitForPort(3000).then(resolve).catch(reject);
  });
}

function loadMainApp() {
  const frontendFile = path.join(getResourceBase(), 'frontend', 'index.html');
  if (updateWindow) {
    updateWindow.close();
    updateWindow = null;
  }
  if (mainWindow) {
    mainWindow.loadFile(frontendFile);
  }
}

function showUpdatePrompt(info) {
  if (!mainWindow) return;
  updateWindow = new BrowserWindow({
    width: 480,
    height: 300,
    parent: mainWindow,
    modal: true,
    resizable: false,
    frame: false,
    backgroundColor: '#0f1116',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  const query = new URLSearchParams({
    version: info.version,
    current: app.getVersion(),
  });
  updateWindow.loadFile(path.join(__dirname, 'update.html'), { query: Object.fromEntries(query) });
}

ipcMain.on('update-skip', () => {
  if (updateWindow) { updateWindow.close(); updateWindow = null; }
  loadMainApp();
});

ipcMain.on('update-download', () => {
  if (updateWindow) {
    updateWindow.loadFile(path.join(__dirname, 'update.html'), { query: { downloading: '1' } });
  }
  autoUpdater.downloadUpdate();
});

autoUpdater.on('update-available', (info) => {
  showUpdatePrompt(info);
});

autoUpdater.on('download-progress', (progress) => {
  if (updateWindow && !updateWindow.isDestroyed()) {
    try {
      updateWindow.webContents.send('download-progress', progress.percent.toFixed(1));
    } catch {}
  }
});

autoUpdater.on('update-downloaded', () => {
  if (updateWindow && !updateWindow.isDestroyed()) {
    try {
      updateWindow.loadFile(path.join(__dirname, 'update.html'), { query: { ready: '1' } });
    } catch {}
  }
});

ipcMain.on('update-install', () => {
  autoUpdater.quitAndInstall();
});

autoUpdater.on('error', (err) => {
  console.error('Auto-updater error:', err.message);
});

autoUpdater.on('update-not-available', () => {});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900,
    minWidth: 1024, minHeight: 700,
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

  autoUpdater.checkForUpdates().catch(() => {});

  startBackend()
    .then(() => {
      if (!updateWindow) loadMainApp();
    })
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
