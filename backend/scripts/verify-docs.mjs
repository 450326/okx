import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const markerPath = path.resolve(here, '../.simulation-selftest.json');
const readmePath = path.resolve(here, '../../README.md');
const write = process.argv.includes('--write');

if (!fs.existsSync(markerPath)) {
  console.error('缺少自测结果，请先运行 npm run test:simulation');
  process.exit(1);
}

const result = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
const count = Number(result.passed);
if (!Number.isInteger(count) || count <= 0) {
  console.error(`自测结果中的项数无效: ${result.passed}`);
  process.exit(1);
}

let readme = fs.readFileSync(readmePath, 'utf8');
const patterns = [
  /（\d+ 项，含预测盘交易）/g,
  /（\d+ 项，含预测盘、现货交易和权益恒等式）/g,
];
const replacements = [
  `（${count} 项，含预测盘交易）`,
  `（${count} 项，含预测盘、现货交易和权益恒等式）`,
];

let found = 0;
patterns.forEach((pattern, index) => {
  readme = readme.replace(pattern, () => {
    found += 1;
    return replacements[index];
  });
});

if (!found) {
  console.error('README 中未找到自测项数占位文本，请补充“（N 项，含预测盘交易）”或自测命令说明');
  process.exit(1);
}

if (write) {
  fs.writeFileSync(readmePath, readme, 'utf8');
  console.log(`README 自测项数已同步为 ${count} 项`);
} else {
  const actual = fs.readFileSync(readmePath, 'utf8');
  if (actual !== readme) {
    console.error(`README 自测项数与实际 ${count} 项不一致，请运行 npm run docs:sync`);
    process.exit(1);
  }
  console.log(`README 自测项数与实际一致：${count} 项`);
}
