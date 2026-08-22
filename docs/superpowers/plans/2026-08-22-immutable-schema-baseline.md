# Notera 不可变 Schema 基线实施计划

> **执行约束：** 实施时必须使用 `superpowers:executing-plans`，并遵守仓库根目录 `AGENTS.md`。按完整、可独立测试的功能模块实施，一模块一提交；测试先表达行为再实现，但不把红、绿、重构拆成独立计划步骤；不启用子代理驱动开发、逐任务审核或额外审核代理。

**目标：** 用永久不可变的 v1 基线和连续生产版本文件取代需要手工维护的最新完整 Schema 快照，让新建数据库与旧数据库通过同一迁移历史到达当前版本。

**架构：** `schema/baseline-v1.ts` 固定保存首次发布的 v1 DDL 与历史初始值，未来的 `schema/v2.ts`、`schema/v3.ts` 分别保存不可变的单版本增量；`migrations/registry.ts` 是生产版本序列、派生当前版本和区间选择的唯一入口。`database.ts` 无论新建还是打开都先取得数据库实际版本，再选择并运行 `(actualVersion, CURRENT_SCHEMA_VERSION]` 的连续迁移，最后验证版本及 Vault 元数据。

**技术栈：** TypeScript 5、Jest 29、ts-jest、`@notera/sqlcipher@13.0.3-sqlcipher.4.17.0`、SQLCipher Community 4.17.0

**规格：** `docs/superpowers/specs/2026-08-22-offline-sqlcipher-storage-design.md`

---

## 范围与不变量

- 当前产品 Schema 仍是 v1，`PRODUCTION_MIGRATIONS` 保持空数组；本次不得创建没有真实结构变化的 `schema/v2.ts`。
- v1 基线不定义或启用外键，现有关系预检查与 `checkIntegrity()` 职责不变。
- 新库始终先创建合法 v1，再重放全部适用生产迁移；不能重新引入最新完整 Schema SQL。
- 已存在数据库迁移失败时只关闭连接，不删除、替换或重建 DB/WAL/SHM。
- 新建数据库初始化或迁移失败时，只清理本次新建的精确 DB/WAL/SHM。
- 迁移注入、原生连接和任意 SQL 只能用于包内部测试，不得从 `src/index.ts` 暴露。
- 同步协议、同步引擎、云端 API、同步 Outbox、冲突和远端附件状态不在本计划范围内。

## 实施后的文件职责

```text
packages/storage-sqlcipher/src/
  file-format.ts                    # 当前数据库文件格式版本
  database.ts                       # 新建/打开后的统一迁移与最终验证
  integrity.ts                      # 从各自权威模块读取当前策略常量
  index.ts                          # 从迁移注册表导出当前 Schema 版本
  repositories/
    attachments.ts                  # 当前附件 Manifest 上限及附件读写
  search/
    normalize.ts                    # 当前搜索规范化版本，保持既有权威
  schema/
    baseline-v1.ts                  # 永久不可变的 v1 DDL、历史初始值和创建函数
    inspect.ts                      # 读取 Schema 版本、按当前文件格式验证 Vault 元数据
    v2.ts                           # 未来真实 v2 才创建；本次不存在
  migrations/
    types.ts                        # Migration 协议
    registry.ts                     # 生产注册、派生当前版本、连续区间选择
    runner.ts                       # 每个目标版本独立事务执行
  __tests__/
    schema.test.ts                  # v1 基线、公开边界和创建/打开行为
    migrations.test.ts              # 注册表区间、runner 和生命周期迁移行为
    attachments.test.ts             # 附件当前 Manifest 上限行为
    integrity.test.ts               # 当前版本及附件限制的完整性扫描行为
```

删除 `packages/storage-sqlcipher/src/schema/current.ts`。文件迁移时必须保持 v1 DDL 字符串逐字等价，不顺手调整表、索引、约束、FTS、外键或历史限制。

## 功能模块 1：不可变 v1 基线、策略常量拆分与派生版本注册表

- [ ] 完成不可变基线与版本注册表模块，并提交一次

**目标与功能逻辑**

把 `schema/current.ts` 等价迁移为 `schema/baseline-v1.ts`，使它只负责首次发布的 v1 历史。当前文件格式、搜索规范化版本和附件 Manifest 上限分别由对应职责模块管理；`CURRENT_SCHEMA_VERSION` 不再手写，而是由生产迁移注册表最后一个 `targetVersion` 推导。注册表先验证完整历史连续，再根据数据库实际版本返回适用后缀，防止将来从 v2 升 v3 时错误重放 v2。

**关键接口与实现约束**

`schema/baseline-v1.ts` 使用以下公开到包内部的接口；创建函数内用于 v1 元数据的文件格式版本和搜索规范化版本是私有历史常量 `1`，不能引用未来会变化的当前策略常量：

```ts
export const BASE_SCHEMA_VERSION = 1;

export interface BaselineV1Input {
  readonly identity: VaultIdentity;
  readonly profileName: string;
  readonly vaultMetaDigest: Uint8Array;
  readonly createdAt: number;
}

export function createBaselineV1(
  database: SqlcipherConnection,
  input: BaselineV1Input,
): void;
```

`file-format.ts` 只声明当前文件格式策略：

```ts
export const CURRENT_FILE_FORMAT_VERSION = 1;
```

`repositories/attachments.ts` 将现有私有 `MAX_MANIFEST` 改成该职责模块的具名导出，并让 Repository 与完整性扫描共用同一当前上限：

```ts
export const MAX_ATTACHMENT_MANIFEST_BYTES = 1024 * 1024;
```

`search/normalize.ts` 的 `NORMALIZER_VERSION` 保持当前搜索规范化版本的唯一权威；删除 `schema/current.ts` 中重复的 `SEARCH_NORMALIZER_VERSION`。v1 基线仍把历史初始值 `1` 写入 `search_metadata`，本次不改变搜索重建流程。

`migrations/registry.ts` 保持生产数组为空，但增加派生版本与连续后缀选择：

```ts
export const PRODUCTION_MIGRATIONS: readonly Migration[] = Object.freeze([]);

export const CURRENT_SCHEMA_VERSION =
  PRODUCTION_MIGRATIONS.at(-1)?.targetVersion ?? BASE_SCHEMA_VERSION;

export function selectMigrationRange(
  migrations: readonly Migration[],
  baseVersion: number,
  fromVersion: number,
): readonly Migration[];

export function selectProductionMigrations(
  fromVersion: number,
): readonly Migration[];
```

`selectMigrationRange()` 必须按以下顺序工作：

1. 从完整数组末项推导注册表当前版本；空数组时使用 `baseVersion`。
2. 用现有 `validateMigrationRegistry()` 验证从基线到注册表当前版本的完整历史，拒绝重复、缺口、乱序和错误起点。
3. 拒绝非安全整数、低于基线或高于注册表当前版本的 `fromVersion`。
4. 筛选 `fromVersion < migration.targetVersion <= registryCurrentVersion`。
5. 再验证所选后缀从 `fromVersion` 到注册表当前版本连续，返回只读数组。

`selectProductionMigrations()` 固定将 `PRODUCTION_MIGRATIONS`、`BASE_SCHEMA_VERSION` 和调用方实际版本交给上述通用选择器。不得接收调用方 SQL、回调或任意生产迁移数组。

同步修改消费者：

- `database.ts` 改为调用 `createBaselineV1()`，并从注册表读取 `CURRENT_SCHEMA_VERSION`；本模块暂不改变创建/打开时 runner 的调用流程。
- `integrity.ts` 分别从注册表、`file-format.ts` 和 `repositories/attachments.ts` 导入当前值。
- `schema/inspect.ts` 用 `CURRENT_FILE_FORMAT_VERSION` 代替硬编码的当前值判断。
- `index.ts` 从注册表导出 `CURRENT_SCHEMA_VERSION`，继续不暴露基线 SQL、注册表数组、选择器或 runner。
- `migrations.test.ts` 的历史基线夹具改为调用 `createBaselineV1()`；不得通过创建当前结构后手工把版本号改回 1。

**涉及文件**

- 创建：`packages/storage-sqlcipher/src/schema/baseline-v1.ts`
- 创建：`packages/storage-sqlcipher/src/file-format.ts`
- 删除：`packages/storage-sqlcipher/src/schema/current.ts`
- 修改：`packages/storage-sqlcipher/src/migrations/registry.ts`
- 修改：`packages/storage-sqlcipher/src/database.ts`
- 修改：`packages/storage-sqlcipher/src/schema/inspect.ts`
- 修改：`packages/storage-sqlcipher/src/repositories/attachments.ts`
- 修改：`packages/storage-sqlcipher/src/integrity.ts`
- 修改：`packages/storage-sqlcipher/src/index.ts`
- 修改：`packages/storage-sqlcipher/src/__tests__/schema.test.ts`
- 修改：`packages/storage-sqlcipher/src/__tests__/migrations.test.ts`
- 按编译需要修改：`packages/storage-sqlcipher/src/__tests__/attachments.test.ts`
- 按编译需要修改：`packages/storage-sqlcipher/src/__tests__/integrity.test.ts`

**单元测试**

- v1 基线创建出的 `sqlite_master` 规范化结果、元数据、Root Folder、FTS trigram 和无外键状态与重构前一致，`schema_version` 恰好为 1。
- 空生产注册表派生 `CURRENT_SCHEMA_VERSION === BASE_SCHEMA_VERSION === 1`，从 v1 选择得到空数组。
- 合成连续历史 `[v2, v3]` 时，从 v1 选择 `[v2, v3]`，从 v2 只选择 `[v3]`，从 v3 选择空数组。
- 即使实际版本位于缺口之后，完整注册表中的重复、缺口、乱序或错误起点仍返回 `MIGRATION_FAILED`。
- 非安全整数、低于基线和高于当前版本的实际版本返回 `MIGRATION_FAILED`。
- 附件 Repository 与 `checkIntegrity()` 对 Manifest 上限使用同一个常量，边界 `1048576` 字节有效，超出 1 字节无效。
- 包入口只导出派生的 `CURRENT_SCHEMA_VERSION`，不导出基线 SQL、`PRODUCTION_MIGRATIONS`、选择器、原生连接或 runner。

**当前模块精确测试命令**

```powershell
npm run test:unit -- packages/storage-sqlcipher/src/__tests__/schema.test.ts packages/storage-sqlcipher/src/__tests__/migrations.test.ts packages/storage-sqlcipher/src/__tests__/attachments.test.ts packages/storage-sqlcipher/src/__tests__/integrity.test.ts --runInBand
```

预期：4 个测试套件全部通过，无快照差异、迁移注册错误或公开 API 泄漏。

**提交**

```powershell
git add -- packages/storage-sqlcipher/src/schema/baseline-v1.ts packages/storage-sqlcipher/src/file-format.ts packages/storage-sqlcipher/src/migrations/registry.ts packages/storage-sqlcipher/src/database.ts packages/storage-sqlcipher/src/schema/inspect.ts packages/storage-sqlcipher/src/repositories/attachments.ts packages/storage-sqlcipher/src/integrity.ts packages/storage-sqlcipher/src/index.ts packages/storage-sqlcipher/src/__tests__/schema.test.ts packages/storage-sqlcipher/src/__tests__/migrations.test.ts packages/storage-sqlcipher/src/__tests__/attachments.test.ts packages/storage-sqlcipher/src/__tests__/integrity.test.ts
git add -u -- packages/storage-sqlcipher/src/schema/current.ts
git commit -m "refactor(storage): establish immutable schema baseline"
```

## 功能模块 2：新建与打开数据库统一重放连续生产迁移

- [ ] 完成数据库生命周期统一迁移模块，并提交一次

**目标与功能逻辑**

让 `createVaultDatabase()` 和 `openVaultDatabase()` 使用同一条“读取实际版本—拒绝过新版本—选择适用生产迁移—逐版本运行—验证最终版本—验证 Vault 元数据”路径。新建数据库只比打开流程多一步：先在独立事务中创建 v1 基线；基线提交后才运行 runner，因此每个后续目标版本仍由 runner 独立提交或回滚。

**关键接口与实现约束**

在 `database.ts` 内增加不导出到包入口的生命周期辅助函数，固定使用生产注册表：

```ts
function migrateToCurrentSchema(
  connection: SqlcipherConnection,
  actualVersion: number,
): void {
  if (actualVersion > CURRENT_SCHEMA_VERSION) {
    throw new StorageError('DB_SCHEMA_TOO_NEW');
  }
  const migrations = selectProductionMigrations(actualVersion);
  runMigrations(
    connection,
    actualVersion,
    CURRENT_SCHEMA_VERSION,
    migrations,
  );
  if (readSchemaVersion(connection) !== CURRENT_SCHEMA_VERSION) {
    throw new StorageError('DB_CORRUPT');
  }
}
```

即使 `actualVersion === CURRENT_SCHEMA_VERSION`，也可以把空区间交给 runner；`validateMigrationRegistry([], current, current)` 必须成功。不要把完整 `PRODUCTION_MIGRATIONS` 直接传给 runner。

`createVaultDatabase()` 的顺序固定为：

```text
CREATE 模式建立连接
-> 单一事务内 createBaselineV1()
-> readSchemaVersion() 得到 BASE_SCHEMA_VERSION
-> migrateToCurrentSchema()
-> validateVaultMetadata(identity.id, vaultMetaDigest)
-> 返回 VaultDatabase
```

任一步失败都先关闭连接，再删除本次创建的精确 DB、`-wal`、`-shm`。保持现有 CREATE 模式的“不覆盖既有数据库”边界，不扩大清理目标，不使用目录递归、通配符或推导出的其他路径。

`openVaultDatabase()` 的顺序固定为：

```text
OPEN_EXISTING 模式建立连接
-> readSchemaVersion()
-> migrateToCurrentSchema()
-> validateVaultMetadata(expectedVaultId, expectedVaultMetaDigest)
-> 返回 VaultDatabase
```

打开流程任一步失败只关闭连接并映射安全错误，绝不调用 `removeCreatedDatabaseFiles()`。迁移异常继续由 runner 映射为 `MIGRATION_FAILED`，不得回显 SQL、数据库路径、Key、标题、ADF 或其他绑定值。

本次仍不创建真实 `schema/v2.ts`。`migrations.test.ts` 使用 Jest 的模块隔离与内部 mock 提供仅测试可见的 `[v2]` 注册表：测试 v2 的 `migrate()` 创建固定探针表，`validate()` 查询该表；失败场景在 `migrate()` 或 `validate()` 抛出固定测试异常。mock 只能替换包内部 `migrations/registry`，`src/index.ts` 不增加注入参数或测试入口。

**涉及文件**

- 修改：`packages/storage-sqlcipher/src/database.ts`
- 修改：`packages/storage-sqlcipher/src/__tests__/schema.test.ts`
- 修改：`packages/storage-sqlcipher/src/__tests__/migrations.test.ts`

**单元测试**

- 当前空生产注册表下，新库创建 v1 基线并经过空迁移区间，最终版本为 1，Vault ID、Root Folder 和摘要验证成功。
- 内部测试注册表为 `[v2]` 时，新库先产生真实空 v1，再执行测试 v2；探针表存在且最终版本为 2，证明没有第二份 v2 快照创建路径。
- 真实 v1 旧库在 `[v2]` 测试注册表下只执行 v2；已是 v2 的数据库再次打开不重放 v2。
- 合成 `[v2, v3]` 时，v1 依次执行两步，v2 只执行 v3；v3 失败时 v2 保持已提交，下次从 v3 续迁。
- 新库的测试迁移在 DDL、回填或 `validate()` 失败时，精确 DB/WAL/SHM 均不存在。
- 旧库的测试迁移失败时，数据库文件仍存在，当前版本事务回滚，更早已提交版本保留，文件不被替换或重建。
- 高于应用当前版本的数据库在选择区间前返回 `DB_SCHEMA_TOO_NEW`；缺失或非法版本元数据返回 `DB_CORRUPT`。
- 迁移成功但最终版本不等于派生当前版本时返回 `DB_CORRUPT`，且不会返回半初始化的 `VaultDatabase`。
- 包入口仍不暴露生产注册表、迁移选择器、runner、原生连接或测试注入能力。

**当前模块精确测试命令**

```powershell
npm run test:unit -- packages/storage-sqlcipher/src/__tests__/schema.test.ts packages/storage-sqlcipher/src/__tests__/migrations.test.ts --runInBand
```

预期：2 个测试套件全部通过；新库和旧库的区间选择、逐版本事务、失败清理与安全打开行为均符合上述断言。

**提交**

```powershell
git add -- packages/storage-sqlcipher/src/database.ts packages/storage-sqlcipher/src/__tests__/schema.test.ts packages/storage-sqlcipher/src/__tests__/migrations.test.ts
git commit -m "refactor(storage): replay migrations for every database"
```

## 最终验证（所有模块完成后只执行一次，不单独提交）

- [ ] 执行一次必要的相关测试全集与静态检查

先运行本次改动覆盖到的相关单元测试全集：

```powershell
npm run test:unit -- packages/storage-sqlcipher/src/__tests__/schema.test.ts packages/storage-sqlcipher/src/__tests__/migrations.test.ts packages/storage-sqlcipher/src/__tests__/attachments.test.ts packages/storage-sqlcipher/src/__tests__/integrity.test.ts --runInBand
```

随后运行 Storage 包类型检查、受影响文件 lint、依赖边界检查和差异格式检查：

```powershell
npm run typecheck -w @notera/storage-sqlcipher
npx eslint packages/storage-sqlcipher/src/file-format.ts packages/storage-sqlcipher/src/schema packages/storage-sqlcipher/src/migrations packages/storage-sqlcipher/src/repositories/attachments.ts packages/storage-sqlcipher/src/database.ts packages/storage-sqlcipher/src/integrity.ts packages/storage-sqlcipher/src/index.ts packages/storage-sqlcipher/src/__tests__/schema.test.ts packages/storage-sqlcipher/src/__tests__/migrations.test.ts packages/storage-sqlcipher/src/__tests__/attachments.test.ts packages/storage-sqlcipher/src/__tests__/integrity.test.ts --ext .ts
npm run check:deps
git diff --check
```

预期：相关测试全集、Storage typecheck、目标 lint 和依赖检查全部通过，`git diff --check` 无输出。此次只改变 Storage 内部 TypeScript 模块边界和数据库初始化流程，不改变 Electron 打包入口或原生二进制，因此不重复运行 SQLCipher 二进制探测和应用 build。若某项失败，只修复对应原因并复测该失败项；不重复运行已经通过且未受修复影响的检查。

## 完成标准

- 仓库不存在 `schema/current.ts` 或需要随版本维护的最新完整 Schema SQL。
- `schema/baseline-v1.ts` 与原 v1 结构等价，并明确作为永久历史基线。
- 当前 Schema 版本只由 `PRODUCTION_MIGRATIONS` 最后一项或 v1 基线派生。
- 版本文件未来位于 `schema/vN.ts`；`migrations/` 只保留通用协议、注册表和 runner。
- 新建和打开数据库都只运行实际版本之后的连续生产迁移，并验证最终版本和 Vault 元数据。
- 新库失败只清理本次文件，旧库失败不删除或替换任何数据库文件。
- 无外键设计、搜索规范化独立版本、文件格式独立版本和附件当前限制职责保持成立。
- 本次没有虚假 v2、同步占位、远端附件字段或新增公开底层接口。
