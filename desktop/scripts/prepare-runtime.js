/**
 * 把构建机的 Node 运行时复制到桌面安装包的 extraResources。
 *
 * 后端使用 node:sqlite（Node >= 22.5），因此不能依赖用户机器安装 Node，
 * 也不能使用 Electron 自带的 Node 20 运行时。该脚本必须在 electron-builder 之前执行。
 */
const fs = require('fs');
const path = require('path');

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
