# 文档—实现一致性检查清单

在每个里程碑验收前逐项执行，避免 README、接口文档和实现再次漂移。

## 1. 自测项数

```bash
pnpm --dir backend run test:simulation
pnpm --dir backend run docs:check
```

- 自测脚本会生成 `backend/.simulation-selftest.json`
- `posttest:simulation` 会自动把实际项数同步到 README
- `docs:check` 会在 README 数字与实际不一致时失败
- 禁止手工修改 README 中的自测项数

## 2. API 与前端调用

- [ ] 新增/删除接口后，检查所有 `@Controller` 路由
- [ ] 对照 `frontend/src/api/services.ts` 是否有未使用或缺失调用
- [ ] 检查 README 示例中的路径、方法、字段
- [ ] 检查错误码文档与 `backend/src/common/error-codes.ts`

## 3. 环境变量

- [ ] `backend/.env.example` 覆盖后端变量
- [ ] `frontend/.env.example` 覆盖 `VITE_API_BASE_URL`
- [ ] README 不描述不存在的变量
- [ ] 生产必需变量在启动时确实会校验

## 4. 数据库结构

- [ ] 运行时 SQLite 表与 `prisma/schema.prisma` 同步（该文件仅为文档镜像，不参与构建）
- [ ] 金额字段标注最小单位或精度
- [ ] 新增表包含在迁移/建表逻辑中
- [ ] 清理脚本覆盖用户数据、账本、风控和资金费表

## 5. 构建与测试

```bash
pnpm --dir backend run build
pnpm --dir backend run test:simulation

pnpm --dir frontend exec vue-tsc --noEmit
pnpm --dir frontend run build
```

- [ ] 后端构建无 TypeScript 错误
- [ ] 前端类型检查无错误
- [ ] 自测输出与 README 一致
- [ ] 模拟盘、实盘只读、实盘交易模式至少各做一次页面冒烟

## 6. 临时文件与忽略规则

```bash
git status --short
Get-ChildItem backend/data -Force
```

- [ ] 不提交 `backend/data/` 下的数据库、密钥、账户文件
- [ ] 不保留 `*.before-*`
- [ ] 不保留 `.tmp*`、测试截图、临时 CDP 脚本
- [ ] `backend/.simulation-selftest.json` 已被忽略

## 7. 提交前

- [ ] 只有本次范围的文件被修改
- [ ] 没有误提交本地密钥或数据库
- [ ] 文档中的路由、字段、项数和实际一致
- [ ] 需要上传时再明确执行 push
