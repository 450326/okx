/**
 * Node 运行时前置检查：后端持久化直接使用内置模块 node:sqlite。
 *
 * node:sqlite 在 Node 22.5 才加入，且 22.5–22.12 需要 --experimental-sqlite 才能加载，
 * 22.13 / 23.4 起才默认可用。Node 18/20 上直接 require 只会得到
 * "Cannot find module 'node:sqlite'"，很难定位，所以这里统一给出可读的提示。
 *
 * 注意：本文件不能 import 任何使用 node:sqlite 的模块，否则检查会失效。
 */
export const MIN_NODE_VERSION = [22, 13, 0] as const;
export const MIN_NODE_VERSION_TEXT = MIN_NODE_VERSION.join('.');

/** 解析 "v22.13.0" / "22.13.0-rc.1" 形式的主次修订号 */
export function parseNodeVersion(version: string): [number, number, number] {
  const [major = 0, minor = 0, patch = 0] = version
    .replace(/^v/i, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
  return [major, minor, patch];
}

/**
 * 当前版本是否可用：
 * - 22.x 需要 22.13 起（22.13 取消 --experimental-sqlite）
 * - 23.x 需要 23.4 起
 * - 24 及以上默认可用
 */
export function isNodeVersionSupported(version: string): boolean {
  const [major, minor] = parseNodeVersion(version);
  if (major >= 24) return true;
  if (major === 23) return minor >= 4;
  if (major === 22) return minor >= 13;
  return false;
}

function describeRequirement(detail?: string, version = process.versions.node): string {
  const lines = [
    `[backend] 当前 Node v${version} 不满足运行要求：后端持久化依赖内置模块 node:sqlite。`,
    `[backend] 需要 Node >= ${MIN_NODE_VERSION_TEXT}（23.x 需 >= 23.4，24+ 默认可用）；22.5–22.12 还需额外加 --experimental-sqlite。`,
    '[backend] 请升级到 Node 22 LTS 最新版或 Node 24+ 后重新启动。',
  ];
  if (detail) lines.push(`[backend] 检测到的错误：${detail}`);
  return lines.join('\n');
}

/** 加载 node:sqlite；失败时抛出带修复提示的错误，而不是裸的 MODULE_NOT_FOUND */
export function requireNodeSqlite(): any {
  try {
    const sqlite = require('node:sqlite');
    if (typeof sqlite?.DatabaseSync !== 'function') {
      throw new Error('node:sqlite 未导出 DatabaseSync');
    }
    return sqlite;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(describeRequirement(detail));
  }
}

/** 进程入口使用：版本或模块不可用时打印可读提示并以 1 退出 */
export function assertNodeSqliteRuntime(version: string = process.versions.node): void {
  if (!isNodeVersionSupported(version)) {
    console.error(describeRequirement(undefined, version));
    process.exit(1);
  }
  try {
    requireNodeSqlite();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
