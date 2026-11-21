const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');
const fs = require('fs');
const crypto = require('crypto');

const BACKEND_PORT = 3000;
const MAX_LOG_LINES = 500;

let mainWindow = null;
let updateWindow = null;
let tray = null;
let quitting = false;
let trayHintShown = false;

/** 'stopped' | 'starting' | 'running' | 'paused' | 'error' */
let backendState = 'stopped';
let backendMessage = '';
let backendProcess = null;
const backendLog = [];

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function getResourceBase() {
  if (app.isPackaged) {
    return process.resourcesPath;
  }
  return path.join(__dirname, '..');
}

function waitForPort(port, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function check() {
      const sock = new net.Socket();
      sock.setTimeout(1000);
      sock.on('connect', () => { sock.destroy(); resolve(); });
      sock.on('error', () => {
        sock.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`后端端口 ${port} 在 ${timeoutMs}ms 内未就绪`));
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
  const resourcesPath = process.resourcesPath || '';
  const packagedNode = resourcesPath ? path.join(resourcesPath, 'node', runtimeName) : '';
  const localNode = path.join(__dirname, 'runtime', runtimeName);
  if (app.isPackaged) {
    if (!packagedNode || !fs.existsSync(packagedNode)) {
      throw new Error(
        `安装包缺少内置 Node 运行时：${packagedNode || '(resources/node)'}。请重新构建安装包，不能依赖用户系统 Node。`,
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

function backendStatus() {
  return { state: backendState, message: backendMessage, port: BACKEND_PORT };
}

function appendBackendLog(chunk) {
  const text = String(chunk);
  backendLog.push(text);
  if (backendLog.length > MAX_LOG_LINES) backendLog.splice(0, backendLog.length - MAX_LOG_LINES);
  try {
    const logDir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, 'backend.log'), text);
  } catch {
    // 日志写失败不影响主流程
  }
}

function broadcastBackendStatus() {
  const payload = backendStatus();
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send('backend:status', payload);
    } catch {
      // 窗口正在销毁，忽略
    }
  }
}

function setBackendState(state, message = '') {
  backendState = state;
  backendMessage = message;
  updateTray();
  broadcastBackendStatus();
}

function backendStateLabel(state) {
  switch (state) {
    case 'running':
      return '后端运行中';
    case 'starting':
      return '后端启动中…';
    case 'paused':
      return '后端已暂停';
    case 'error':
      return '后端启动失败';
    default:
      return '后端已停止';
  }
}

function trayIcon(state) {
  const name = state === 'running' ? 'tray-running.png' : state === 'error' ? 'tray-error.png' : 'tray-paused.png';
  const image = nativeImage.createFromPath(path.join(__dirname, 'assets', name));
  if (image.isEmpty()) return nativeImage.createEmpty();
  return image.resize({ width: 16, height: 16 });
}

function updateTray() {
  if (!tray || tray.isDestroyed()) return;
  const label = backendStateLabel(backendState);
  const running = backendState === 'running';
  const starting = backendState === 'starting';

  const menu = Menu.buildFromTemplate([
    { label: `OKX Trading · ${label}`, enabled: false },
    { type: 'separator' },
    { label: '显示主窗口', click: () => showMainWindow() },
    {
      label: running ? '暂停后端' : '启动后端',
      enabled: !starting,
      click: () => {
        if (backendState === 'running') {
          pauseBackend().catch(() => {});
        } else {
          startBackend().catch(() => {});
        }
      },
    },
    {
      label: '重启后端',
      enabled: !starting,
      click: () => restartBackend().catch(() => {}),
    },
    { type: 'separator' },
    { label: '打开后端日志', click: () => openBackendLog() },
    { type: 'separator' },
    { label: '退出', click: () => quitApp() },
  ]);

  tray.setContextMenu(menu);
  tray.setImage(trayIcon(backendState));
  tray.setToolTip(`OKX Trading · ${label}`);
}

function openBackendLog() {
  const logDir = path.join(app.getPath('userData'), 'logs');
  try {
    fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, 'backend.log');
    if (!fs.existsSync(logFile)) fs.writeFileSync(logFile, '（暂无日志）\n', 'utf-8');
    shell.openPath(logFile);
  } catch (error) {
    console.error('打开日志失败', error);
  }
}

async function stopBackendProcess() {
  const child = backendProcess;
  backendProcess = null;
  if (!child) return;
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    child.once('exit', finish);
    try {
      child.kill();
    } catch {
      finish();
    }
    setTimeout(() => {
      try {
        if (child.exitCode === null) child.kill('SIGKILL');
      } catch {
        // 进程可能已退出
      }
      finish();
    }, 3000);
  });
}

async function startBackend() {
  if (backendProcess) return backendStatus();
  if (backendState === 'starting') return backendStatus();

  setBackendState('starting');
  const backendDir = path.join(getResourceBase(), 'backend');
  const serverScript = path.join(backendDir, 'dist', 'main.js');

  let nodeBinary;
  try {
    nodeBinary = getBackendNode();
  } catch (error) {
    setBackendState('error', error.message);
    throw error;
  }

  const secrets = loadOrCreateSecrets();
  const env = {
    ...process.env,
    PORT: String(BACKEND_PORT),
    // 桌面端只监听本机，避免同一局域网内的页面直接访问 API
    HOST: '127.0.0.1',
    NODE_ENV: 'production',
    // file:// 页面的 Origin 是字符串 "null"，这里显式加入白名单
    CORS_ORIGINS: process.env.CORS_ORIGINS || 'null',
    ACCOUNT_ENCRYPTION_KEY: process.env.ACCOUNT_ENCRYPTION_KEY || secrets.accountEncryptionKey,
    AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET || secrets.authJwtSecret,
  };

  const child = spawn(nodeBinary, [serverScript], {
    env,
    cwd: backendDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  backendProcess = child;
  child.stdout.on('data', appendBackendLog);
  child.stderr.on('data', appendBackendLog);
  child.on('error', (error) => appendBackendLog(`\n[spawn error] ${error.message}\n`));
  child.on('exit', (code, signal) => {
    if (backendProcess !== child) return; // 主动暂停/重启
    backendProcess = null;
    setBackendState('error', `后端进程退出（code=${code}，signal=${signal || '-'}），可查看后端日志`);
  });

  try {
    await waitForPort(BACKEND_PORT);
  } catch (error) {
    await stopBackendProcess();
    setBackendState('error', error.message);
    throw error;
  }

  if (backendProcess === child) setBackendState('running');
  return backendStatus();
}

async function pauseBackend() {
  await stopBackendProcess();
  setBackendState('paused');
  return backendStatus();
}

async function restartBackend() {
  await stopBackendProcess();
  // startBackend 自己会把状态切到 starting
  return startBackend();
}

async function quitApp() {
  quitting = true;
  await pauseBackend().catch(() => {});
  if (tray && !tray.isDestroyed()) tray.destroy();
  tray = null;
  app.quit();
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function toggleMainWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
    mainWindow.hide();
  } else {
    showMainWindow();
  }
}

function createTray() {
  if (tray && !tray.isDestroyed()) return;
  tray = new Tray(trayIcon(backendState));
  tray.on('click', () => toggleMainWindow());
  tray.on('double-click', () => showMainWindow());
  updateTray();
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

// 托盘 / 应用内控制共用同一套后端状态
ipcMain.handle('backend:status', () => backendStatus());
ipcMain.handle('backend:start', async () => {
  await startBackend().catch(() => {});
  return backendStatus();
});
ipcMain.handle('backend:pause', async () => {
  await pauseBackend().catch(() => {});
  return backendStatus();
});
ipcMain.handle('backend:restart', async () => {
  await restartBackend().catch(() => {});
  return backendStatus();
});

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

  // 后端失败也进入主界面：前端会用「后端已暂停 / 启动失败」覆盖层提供重试按钮
  startBackend()
    .catch(() => {})
    .finally(() => {
      if (!updateWindow) loadMainApp();
    });

  // 关闭窗口只收起到托盘，后端继续运行；真正退出走托盘菜单
  mainWindow.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    mainWindow.hide();
    if (!trayHintShown) {
      trayHintShown = true;
      try {
        tray.displayBalloon?.({
          title: 'OKX Trading',
          content: '已最小化到托盘，后端继续运行。右键托盘图标可暂停或启动后端。',
        });
      } catch {
        // 部分环境不支持气泡提示
      }
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());

  app.whenReady().then(() => {
    createTray();
    createWindow();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showMainWindow();
  });

  // 托盘常驻：关闭全部窗口不退出应用
  app.on('window-all-closed', () => {});

  app.on('before-quit', () => {
    quitting = true;
    const child = backendProcess;
    backendProcess = null;
    if (child) {
      try { child.kill(); } catch {}
    }
  });
}
