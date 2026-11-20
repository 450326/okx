/**
 * 把构建机的 Node 运行时复制到桌面安装包的 extraResources。
 *
 * 后端使用 node:sqlite（Node >= 22.5），因此不能依赖用户机器安装 Node，
 * 也不能使用 Electron 自带的 Node 20 运行时。该脚本必须在 electron-builder 之前执行。
 */
const fs = require('fs');
const path = require('path');

/**
 * 安装包绝不能携带 .env：里面的 ACCOUNT_ENCRYPTION_KEY / AUTH_JWT_SECRET 会随 exe 分发给所有用户。
 * 这里在 electron-builder 之前做一次构建期拦截，避免以后有人把 ".env" 加回 filter。
 */
function assertNoEnvInPackage() {
  const pkgPath = path.resolve(__dirname, '../package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const build = pkg.build || {};
  const leaks = [];

  const isEnvPattern = (pattern) => {
    const text = String(pattern || '');
    if (text.startsWith('!')) return false;
    return /(^|[\\/])\.env($|[.*])/.test(text);
  };

  for (const pattern of build.files || []) {
    const text = typeof pattern === 'string' ? pattern : pattern && pattern.from;
    if (isEnvPattern(text)) leaks.push(`files: ${text}`);
  }

  for (const entry of build.extraResources || []) {
    if (isEnvPattern(entry.from) || isEnvPattern(entry.to)) {
      leaks.push(`extraResources: ${entry.from} -> ${entry.to}`);
    }
    for (const pattern of entry.filter || []) {
      if (isEnvPattern(pattern)) leaks.push(`extraResources(${entry.to || entry.from}): ${pattern}`);
    }
  }

  if (leaks.length) {
    console.error(
      '[prepare-runtime] 安装包配置包含 .env，可能泄露 ACCOUNT_ENCRYPTION_KEY / AUTH_JWT_SECRET：\n  ' +
        leaks.join('\n  ') +
        '\n请从 desktop/package.json 的 files / extraResources 中移除。',
    );
    process.exit(1);
  }

  const localEnv = path.resolve(__dirname, '../../backend/.env');
  if (fs.existsSync(localEnv)) {
    console.warn(
      '[prepare-runtime] 检测到 backend/.env：安装包不包含任何 .env，' +
        '桌面端首次启动会在用户数据目录生成独立密钥并注入后端。',
    );
  }
}

assertNoEnvInPackage();

const MIN_NODE = [22, 5, 0];
const current = process.versions.node.split('.').map(Number);
const isSupported =
  current[0] > MIN_NODE[0] ||
  (current[0] === MIN_NODE[0] &&
    (current[1] > MIN_NODE[1] ||
      (current[1] === MIN_NODE[1] && current[2] >= MIN_NODE[2])));

if (!isSupported) {
  console.error(
    `[prepare-runtime] 需要 Node >= ${MIN_NODE.join('.')}（当前 ${process.versions.node}）。` +
      '后端依赖 node:sqlite，请使用 Node 22.5+ 构建。',
  );
  process.exit(1);
}

const source = process.env.OKX_NODE_BINARY || process.execPath;
if (!fs.existsSync(source)) {
  console.error(`[prepare-runtime] 找不到 Node 可执行文件：${source}`);
  process.exit(1);
}

const targetDir = path.resolve(__dirname, '../runtime');
const targetName = process.platform === 'win32' ? 'node.exe' : 'node';
const target = path.join(targetDir, targetName);
fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);
if (process.platform !== 'win32') fs.chmodSync(target, 0o755);

const size = fs.statSync(target).size;
if (size < 1_000_000) {
  console.error(`[prepare-runtime] 复制后的 Node 可执行文件异常（${size} bytes）`);
  process.exit(1);
}

console.log(
  `[prepare-runtime] 已打包 Node ${process.versions.node} (${process.arch}) -> ${target}`,
);
