# Notera 多包工程基础设施实施计划

> **执行约束：** 遵守仓库根目录 `AGENTS.md`。按完整功能模块实施和提交，不拆分微步骤，不启用逐任务审核或额外审核代理。

**目标：** 把当前单包 Electron 工程改造成可直接开发五个内部包的 npm workspace，并建立快速单元测试、TypeScript 类型检查、Webpack 源码打包和模块依赖边界检查。

**架构：** 五个 `@notera/*` 包使用各自的 `package.json` 和 `tsconfig.json` 声明公开入口与直接依赖，Webpack 和 Jest 都直接消费包内 TypeScript 源码，不要求预先生成包产物。根工程统一编排类型检查、单元测试、依赖边界、Lint 和应用构建；依赖方向由包清单和 dependency-cruiser 共同约束。

**技术栈：** npm workspaces、TypeScript 5、Jest 29、ts-jest、Webpack 5、dependency-cruiser、GitHub Actions

---

## 范围

本计划只建立工程基础设施和空的公开包入口，不实现领域模型、加密算法、SQLCipher、附件存储、应用用例或 IPC schema，也不引入任何同步相关实现或占位代码。

完成后的项目内依赖必须符合下表：

| 模块 | 允许依赖的项目内模块 |
| --- | --- |
| `packages/domain` | 无 |
| `packages/crypto` | 无 |
| `src/shared` | 无 |
| `packages/storage-sqlcipher` | `domain` |
| `packages/attachments` | `domain`、`crypto` |
| `packages/application` | `domain`、`crypto`、`storage-sqlcipher`、`attachments` |
| `src/main` | `src/shared` 和全部五个包 |
| `src/main/preload.ts` | 仅 `src/shared` |
| `src/renderer` | 仅 `src/shared` |

## 文件布局

本计划新增以下结构：

```text
packages/
  domain/{package.json,tsconfig.json,src/index.ts}
  crypto/{package.json,tsconfig.json,src/index.ts}
  storage-sqlcipher/{package.json,tsconfig.json,src/index.ts}
  attachments/{package.json,tsconfig.json,src/index.ts}
  application/{package.json,tsconfig.json,src/index.ts}
src/
  shared/index.ts
  __tests__/setup.ts
  __tests__/workspace-resolution.test.ts
tsconfig.base.json
jest.config.cjs
.dependency-cruiser.cjs
```

所有 `src/index.ts` 在本计划中只包含 `export {};`，用于建立稳定公开入口；后续功能计划再从这些入口导出真实 API。

### 功能模块 1：建立 npm workspace 与独立类型检查

**涉及文件：**

- 修改：`package.json`
- 修改：`package-lock.json`
- 修改：`tsconfig.json`
- 新增：`tsconfig.base.json`
- 新增：`packages/domain/package.json`
- 新增：`packages/domain/tsconfig.json`
- 新增：`packages/domain/src/index.ts`
- 新增：`packages/crypto/package.json`
- 新增：`packages/crypto/tsconfig.json`
- 新增：`packages/crypto/src/index.ts`
- 新增：`packages/storage-sqlcipher/package.json`
- 新增：`packages/storage-sqlcipher/tsconfig.json`
- 新增：`packages/storage-sqlcipher/src/index.ts`
- 新增：`packages/attachments/package.json`
- 新增：`packages/attachments/tsconfig.json`
- 新增：`packages/attachments/src/index.ts`
- 新增：`packages/application/package.json`
- 新增：`packages/application/tsconfig.json`
- 新增：`packages/application/src/index.ts`
- 新增：`src/shared/index.ts`

**实现要求：**

- 将根包标记为 `private: true`，配置 `workspaces: ["packages/*"]`。
- 内部包统一使用 `@notera/<name>`、`version: "0.0.0"` 和 `private: true`，并把 `src/index.ts` 同时声明为 `main`、`types` 和唯一的 `exports["."]`。这样 Jest、Webpack 和 TypeScript 都使用同一公开入口，且外部代码不能通过包导出访问内部深层文件。
- 每个包只在 `dependencies` 中声明依赖矩阵允许的直接内部依赖，内部版本统一写为 `"0.0.0"`。`domain`、`crypto` 不声明项目内依赖。
- 将当前通用编译选项移到 `tsconfig.base.json`。根 `tsconfig.json` 只覆盖 Electron 工程需要的 `incremental`、`noEmit`、包含目录和排除目录；各包的 `tsconfig.json` 继承基础配置，设置 `noEmit: true`，只包含本包 `src/**/*.ts`。
- 根脚本新增：
  - `typecheck:app`: `tsc --noEmit -p tsconfig.json`
  - `typecheck:packages`: `npm run typecheck --workspaces --if-present`
  - `typecheck`: 依次执行包级和应用级类型检查
- 每个内部包提供 `typecheck: tsc --noEmit -p tsconfig.json`。不为包增加独立构建产物或发布脚本。
- 执行 `npm install`，让 npm 创建 workspace 链接并更新 `package-lock.json`；不得手工编辑锁文件。

**模块验证：**

- 运行 `npm run typecheck`。
- 预期：五个包和根 Electron 工程均无 TypeScript 错误，命令退出码为 0。

**提交：** `chore: establish workspace package structure`

### 功能模块 2：建立不依赖 Electron 构建产物的快速单元测试

**涉及文件：**

- 修改：`package.json`
- 修改：`src/__tests__/App.test.tsx`
- 删除：`.erb/scripts/check-build-exists.ts`
- 新增：`jest.config.cjs`
- 新增：`src/__tests__/setup.ts`
- 新增：`src/__tests__/workspace-resolution.test.ts`

**实现要求：**

- 把 `package.json` 内嵌的 Jest 配置迁移到 `jest.config.cjs`，保留现有静态资源和样式映射。
- Jest 默认使用 `node` 环境，搜索范围覆盖 `packages` 和 `src`；只有 React Renderer 测试通过文件头 `@jest-environment jsdom` 使用 JSDOM。
- `src/__tests__/setup.ts` 统一加载 `@testing-library/jest-dom`，并在缺失时从 `node:util` 安装 `TextEncoder`、`TextDecoder`。
- 完全删除单元测试对 `.erb/dll`、`release/app/dist/main` 和 `release/app/dist/renderer` 的预构建检查。运行单元测试不得隐式触发 Webpack、Electron Builder 或 DLL 构建。
- 保留根 `test: jest`，新增 `test:unit: jest`，方便最终验证和开发时定向执行。
- `workspace-resolution.test.ts` 分别导入五个 `@notera/*` 公开入口并断言模块可解析，验证 npm workspace、ts-jest 和包导出配置能够协同工作；不要给空包添加仅供测试使用的业务常量。
- 更新 `App.test.tsx` 使用公共 setup，不再在测试文件内重复加载 jest-dom。

**单元测试：**

- 运行 `npm run test:unit -- --runInBand src/__tests__/workspace-resolution.test.ts`。
- 预期：五个内部包都能通过公开包名解析，测试通过。
- 运行 `npm run test:unit -- --runInBand src/__tests__/App.test.tsx`。
- 预期：React 测试在 JSDOM 中通过，且不要求 Main 或 Renderer bundle 已存在。

**提交：** `test: decouple unit tests from electron bundles`

### 功能模块 3：自动执行模块依赖边界

**涉及文件：**

- 修改：`package.json`
- 修改：`package-lock.json`
- 新增：`.dependency-cruiser.cjs`

**实现要求：**

- 通过 `npm install --save-dev dependency-cruiser` 安装依赖分析工具并更新锁文件。
- 新增 `check:deps: depcruise --config .dependency-cruiser.cjs src packages`。
- 配置忽略 `node_modules`、构建产物、声明文件和测试覆盖率产物，但分析 TypeScript 预编译依赖。
- 把本计划“范围”中的依赖矩阵逐条转换为 `forbidden` 规则，并额外禁止循环依赖。
- `src/main/preload.ts` 使用独立规则：允许外部依赖和 `src/shared`，禁止导入其他 `src/main` 文件、Renderer 或任何内部包。
- `src/renderer` 禁止导入任何 `packages` 文件和 `src/main`；`src/main`（Preload 除外）禁止导入 Renderer。
- 所有内部包禁止导入 `src`；包之间只允许矩阵列出的方向。规则名称必须包含来源和禁止目标，例如 `domain-no-project-dependencies`、`renderer-no-packages`，让失败信息可以直接定位边界。
- 只允许通过 `@notera/<name>` 的公开入口访问包；各包 `exports` 不暴露深层路径。

**模块验证：**

- 运行 `npm run check:deps`。
- 预期：输出 0 个依赖违规并以退出码 0 结束。

**提交：** `build: enforce module dependency boundaries`

### 功能模块 4：让 Webpack、统一验证和 CI 使用多包基础设施

**涉及文件：**

- 修改：`.erb/configs/webpack.paths.ts`
- 修改：`.erb/configs/webpack.config.base.ts`
- 修改：`package.json`
- 修改：`.github/workflows/test.yml`

**实现要求：**

- 在 `webpack.paths.ts` 增加根 `packagesPath`。
- Webpack 的 TypeScript loader 明确包含 `srcPath` 和 `packagesPath`，继续排除普通第三方 `node_modules`；解析 workspace 符号链接后必须能转译五个包的 `.ts` 源码。
- 保留 `TsconfigPathsPlugin` 和现有 Electron Main/Renderer 入口，不在此阶段修改业务入口或添加占位导入。
- 根脚本新增唯一的完整验证入口：`verify: npm run typecheck && npm run test:unit -- --runInBand && npm run check:deps && npm run lint && npm run build`。
- GitHub Actions 使用 `npm ci`，然后只运行 `npm run verify`；移除测试工作流中的 Electron 安装包构建 `npm run package` 和重复的 lint、tsc、test 命令。发布工作流仍负责真正的安装包构建。

**最终验证：**

- 运行一次 `npm run verify`。
- 预期：类型检查、全部现有单元测试、依赖边界、ESLint、Main/Renderer 生产构建全部通过。
- 检查 `git status --short`，确认没有把 `.erb/dll`、`release/app/dist`、覆盖率文件或其他生成物纳入提交。

**提交：** `build: integrate workspaces with electron toolchain`

## 完成标准

- `packages` 下只有 `domain`、`crypto`、`storage-sqlcipher`、`attachments`、`application` 五个内部包。
- 任一包可以通过根命令单独或统一执行类型检查和单元测试。
- 单元测试不依赖 Webpack、Electron Builder 或已有 bundle。
- 非法跨层导入和循环依赖会使 `npm run check:deps` 失败。
- Electron Main 与 Renderer 能从 workspace 包的公开入口打包 TypeScript 源码。
- CI 不再执行安装包构建或重复验证，只调用一次统一验证入口。
- 没有加入同步协议、同步引擎或同步数据库占位结构。
