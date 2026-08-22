# Notera 离线 Profile 生命周期实施计划

> **执行约束：** 实施时必须使用 `superpowers:executing-plans`，并遵守仓库根目录 `AGENTS.md`。按完整、可独立测试的功能模块实施，一模块一提交；测试先表达行为再实现，但不把红、绿、重构拆成独立计划步骤；不启用子代理驱动开发、逐任务审核或额外审核代理。

**目标：** 在 `@notera/application` 中实现崩溃安全的本地 Profile 索引、Meta、Session 与完整生命周期，并以正式 SQLCipher Schema v2 支撑原子主密码修改。

**架构：** `ProfileManager` 是唯一业务编排入口，单向调用互不依赖的 `ProfileCatalog` 与 `VaultMetaStore`，并独占一个持有 SQLCipher、Attachment Store 和 Session 密钥的 `ProfileSession`。Catalog、Meta 和 Profile 目录使用同目录临时文件、原子替换、创建标记与删除隔离目录收敛崩溃状态；主密码修改通过 SQLCipher pending Meta 摘要和 `vault.meta` 原子替换形成两阶段提交。

**技术栈：** TypeScript 5、Node.js 文件系统与 Crypto、Jest 29、ts-jest、`@notera/domain`、`@notera/crypto`、`@notera/storage-sqlcipher`、`@notera/attachments`、SQLCipher Community 4.17.0

**规格：** `docs/superpowers/specs/2026-08-22-offline-profile-lifecycle-design.md`

---

## 范围与实施顺序

本计划严格按以下依赖顺序执行：

1. 先发布 Storage Schema v2 与 pending Meta 摘要事务接口；
2. 再实现不依赖数据库的 Profile 路径、原子文件和 `VaultMetaStore`；
3. 在 Meta 能力之上实现 `ProfileCatalog` 与启动恢复；
4. 实现独立的 `ProfileSession` 资源生命周期；
5. 组合前述能力实现创建、解锁、锁定、切换、列表和重命名；
6. 接入 Storage v2 实现崩溃安全的主密码修改；
7. 完成永久移除、启动续删和包公共 API 收口。

本计划不实现本地笔记用例、附件引用事务、Electron Main/Preload/IPC、Renderer、Media Gateway、导出或任何同步能力。`src/shared` 已有 Profile IPC 合约只作为后续 Main 适配边界，本次不修改或提前注册 handler。

## 实施后的文件职责

```text
packages/storage-sqlcipher/src/
  schema/
    baseline-v1.ts                   # 永久不变的 v1 基线
    v2.ts                            # pending Vault Meta 摘要的不可变 v2 迁移
    inspect.ts                       # 接受当前或 pending 摘要的 Vault 校验
  migrations/registry.ts            # 注册 v2 并派生 CURRENT_SCHEMA_VERSION
  repositories/profile-metadata.ts  # 名称及两阶段摘要事务写入
  types.ts                           # Profile Metadata 公开 Storage 契约
  __tests__/
    migrations.test.ts              # v1→v2、重放与基线保护
    schema.test.ts                   # 当前 v2 建库与摘要打开行为
    transactions-folders.test.ts    # 两阶段摘要事务和防御性复制

packages/application/src/
  errors.ts                          # 稳定 ApplicationError 与底层错误映射
  types.ts                           # ProfileManager 公共 DTO 和接口
  paths.ts                           # 只从可信根与规范 ID 推导内部路径
  atomic-file.ts                     # 同目录排他临时文件、fsync 与原子替换
  vault-meta.ts                      # Meta v1 严格编解码、摘要和 next 文件
  pagination.ts                      # Profile Catalog 稳定 Cursor 分页
  catalog.ts                         # profile-index.json 状态与原子缓存写入
  recovery.ts                        # 创建残留、失效索引和删除隔离区恢复
  session.ts                         # 密钥、数据库与 Attachment Store 生命周期
  manager.ts                         # 唯一 Profile 生命周期编排入口
  index.ts                           # 受限的 @notera/application 公共入口
  __tests__/
    helpers.ts                       # 临时目录、固定 ID、受控工厂和故障注入
    vault-meta.test.ts
    catalog.test.ts
    session.test.ts
    manager.test.ts
    manager.integration.test.ts
    password-change.test.ts
    removal.test.ts

src/__tests__/workspace-resolution.test.ts  # Application 公共入口与隐藏内部验证
```

不创建通用依赖注入容器、Repository 基类、任意路径文件 API、同步目录或空实现。Application 内部测试接缝只允许替换时间/UUID、原子文件边界、Crypto 用例、数据库工厂、Attachment Store 工厂和删除操作。

---

## 功能模块 1：SQLCipher Schema v2 与两阶段 Meta 摘要

- [ ] 完成本模块的测试、实现、相关单元验证和一次提交。

**目标：** 发布首个真实生产迁移，在不修改 v1 基线的前提下为 `vault_metadata` 增加 pending 摘要，并提供具备期望值保护的准备、完成和取消接口。

**关键接口与功能逻辑：**

创建 `schema/v2.ts`，只导出一个包内部 `Migration`：

```ts
export const V2_PENDING_VAULT_META_DIGEST: Migration = Object.freeze({
  targetVersion: 2,
  migrate(database) {
    database.exec(`
      ALTER TABLE vault_metadata
      ADD COLUMN pending_vault_meta_digest BLOB
      CHECK(
        pending_vault_meta_digest IS NULL
        OR length(pending_vault_meta_digest) = 32
      );
    `);
  },
  validate(database) {
    // 严格确认列存在、类型为 BLOB、可空且全部既有行保持 NULL。
  },
});
```

`migrations/registry.ts` 将其作为唯一生产迁移注册，`CURRENT_SCHEMA_VERSION` 因而变为 2。新库仍先创建逐字不变的 v1 基线，再通过 runner 重放 v2；旧 v1 数据库只运行 v2。不得把新列写回 `baseline-v1.ts`，也不得另建“当前完整 Schema”。

`types.ts` 将 Profile Metadata 契约改为：

```ts
export interface ProfileMetadata {
  readonly profileName: string;
  readonly vaultMetaDigest: Uint8Array;
  readonly pendingVaultMetaDigest?: Uint8Array;
}

export interface VaultMetaDigestTransition {
  readonly currentDigest: Uint8Array;
  readonly pendingDigest: Uint8Array;
}

export interface ProfileMetadataWriter extends ProfileMetadataReader {
  rename(profileName: string): void;
  prepareVaultMetaDigest(input: VaultMetaDigestTransition): void;
  finalizeVaultMetaDigest(input: VaultMetaDigestTransition): void;
  cancelVaultMetaDigest(input: VaultMetaDigestTransition): void;
}
```

三个写接口必须验证两个摘要均为 32 字节并复制输入：

- `prepare` 只在当前摘要等于 `currentDigest` 且 pending 为 `NULL` 时写入 `pendingDigest`；
- `finalize` 只在当前和 pending 同时期望匹配时把 pending 提升为当前并清空 pending；
- `cancel` 只在当前和 pending 同时期望匹配时清空 pending；
- 影响行数不是 1 时返回 `STORAGE_OPERATION_FAILED`，元数据行缺失或结构非法仍返回 `DB_CORRUPT`。

`ProfileMetadataRepository.get()` 返回摘要的新副本，调用方修改 current 或 pending 结果不得改变数据库。删除旧的无期望值 `replaceVaultMetaDigest()`，同步更新测试中的局部 API 类型。

`schema/inspect.ts` 读取 pending 列，并使用 `timingSafeEqual()` 接受调用方摘要匹配 current 或非空 pending；Vault ID、根目录、Profile 名称和文件格式验证保持不变。非法 pending 类型或长度统一视为 `DB_CORRUPT`。

**涉及文件：**

- 创建：`packages/storage-sqlcipher/src/schema/v2.ts`
- 修改：`packages/storage-sqlcipher/src/migrations/registry.ts`
- 修改：`packages/storage-sqlcipher/src/schema/inspect.ts`
- 修改：`packages/storage-sqlcipher/src/repositories/profile-metadata.ts`
- 修改：`packages/storage-sqlcipher/src/types.ts`
- 修改：`packages/storage-sqlcipher/src/__tests__/migrations.test.ts`
- 修改：`packages/storage-sqlcipher/src/__tests__/schema.test.ts`
- 修改：`packages/storage-sqlcipher/src/__tests__/transactions-folders.test.ts`

**单元测试：**

- `CURRENT_SCHEMA_VERSION === 2`，生产注册表从 v1 选择 v2、从 v2 选择空数组；
- 真实 v1 夹具迁移后新增可空 BLOB 列，既有摘要、名称、Vault ID 和根目录不变，pending 为 `NULL`；
- 新库先创建 v1 再重放 v2，新库与迁移库规范化结构一致；v1 基线 SQL/哈希保护不发生变化；
- 非 `NULL` 的 31 或 33 字节 pending 被约束拒绝，v2 校验失败整体回滚到 v1；
- current 摘要和 pending 摘要均可打开数据库，第三个摘要被拒绝；
- prepare、finalize、cancel 在匹配时正确提交，在错误 current/pending、重复竞争和事务回滚时不产生部分状态；
- current/pending 返回值防御性复制，非法长度输入返回稳定 Storage 错误；
- v2 已发布后从 v2 打开不重复执行迁移，过高版本仍返回 `DB_SCHEMA_TOO_NEW`。

**精确测试命令：**

```powershell
npm run test:unit -- packages/storage-sqlcipher/src/__tests__/migrations.test.ts packages/storage-sqlcipher/src/__tests__/schema.test.ts packages/storage-sqlcipher/src/__tests__/transactions-folders.test.ts --runInBand
```

预期：3 个测试套件全部通过，当前 Schema 为 2，v1 基线保护无差异，摘要事务测试 0 个失败。

**完成后提交：**

```powershell
git add packages/storage-sqlcipher/src/schema/v2.ts packages/storage-sqlcipher/src/migrations/registry.ts packages/storage-sqlcipher/src/schema/inspect.ts packages/storage-sqlcipher/src/repositories/profile-metadata.ts packages/storage-sqlcipher/src/types.ts packages/storage-sqlcipher/src/__tests__/migrations.test.ts packages/storage-sqlcipher/src/__tests__/schema.test.ts packages/storage-sqlcipher/src/__tests__/transactions-folders.test.ts
git commit -m "feat(storage): add pending profile meta digest"
```

---

## 功能模块 2：安全路径、原子文件与 VaultMetaStore

- [ ] 完成本模块的测试、实现、相关单元验证和一次提交。

**目标：** 建立 Application 的稳定错误模型、可信 Profile 路径和确定性 Meta v1，使后续 Catalog 与 Manager 无法接受任意路径或含糊的引导数据。

**关键接口与功能逻辑：**

`errors.ts` 定义不含底层消息的 `ApplicationError`，首批错误码覆盖设计中的 `PROFILE_LOCKED`、`ENTITY_NOT_FOUND`、`INVALID_NAME`、`WRONG_PASSWORD`、`VAULT_META_INVALID`、`CRYPTO_UNAVAILABLE`、`DB_CORRUPT`、`DB_SCHEMA_TOO_NEW`、`MIGRATION_FAILED`、`DISK_FULL`、`SAVE_FAILED`、`REMOVE_FAILED`、`APPLICATION_CLOSED` 和 `OPERATION_FAILED`。文件错误只把 `ENOSPC` 映射为 `DISK_FULL`，其他未知错误映射为当前操作的稳定码，不携带路径或原文。

`paths.ts` 创建并 `realpath()` 规范应用数据根和 `profiles/`，输出包内部不可变路径对象。Profile 子路径只能接收 `asLocalProfileId()` 验证后的 ID；临时文件会话名固定为 32 位小写十六进制。公开类型和错误均不返回路径。

`atomic-file.ts` 提供包内部受约束能力：同目录 `open('wx', 0o600)` 创建临时文件，循环处理短写，`FileHandle.sync()` 后关闭，再执行同文件系统原子替换；失败清理只删除本次创建的精确临时文件。Catalog 写入额外先把当前有效字节持久化到 `.bak`，再替换正式文件。测试通过文件操作适配器注入短写、零进度、`ENOSPC`、rename 失败和崩溃边界。

`vault-meta.ts` 定义且只接受以下逻辑结构：

```ts
interface VaultMetaV1 {
  readonly metaVersion: 1;
  readonly localProfileId: LocalProfileId;
  readonly vaultId: VaultId;
  readonly fileFormatVersion: 1;
  readonly keyPackage: PasswordKeyPackage;
}

interface ReadVaultMeta {
  readonly value: VaultMetaV1;
  readonly bytes: Uint8Array;
  readonly digest: Uint8Array;
}
```

编码顺序固定为 `metaVersion`、`localProfileId`、`vaultId`、`fileFormatVersion`、`keyPackage`，嵌套 Key Package 和 Envelope 同样使用固定键顺序，UTF-8 文本只带一个结尾换行。解析要求 JSON 对象字段集合精确匹配，UUID 规范，版本为 1，Base64 往返规范，并验证 salt 为 16 字节、nonce 为 24 字节、包装密文为 48 字节。摘要是最终原始字节的 SHA-256；返回的字节、摘要和嵌套对象均复制并冻结外壳。

`VaultMetaStore` 只暴露包内部 `writeInitial()`、`read()`、`writeNext()`、`promoteNext()` 和 `discardNext()`。普通解锁只读正式 `vault.meta`，绝不把 `vault.meta.next` 当候选。初始写入不得覆盖既有文件，next 写入同样排他。

**涉及文件：**

- 创建：`packages/application/src/errors.ts`
- 创建：`packages/application/src/types.ts`
- 创建：`packages/application/src/paths.ts`
- 创建：`packages/application/src/atomic-file.ts`
- 创建：`packages/application/src/vault-meta.ts`
- 创建：`packages/application/src/__tests__/helpers.ts`
- 创建：`packages/application/src/__tests__/vault-meta.test.ts`

**单元测试：**

- 固定 Meta 编码为固定 UTF-8/十六进制夹具，重复编码及 SHA-256 完全相同；
- 编解码往返后 Local Profile ID、Vault ID、格式版本和 Key Package 精确一致；修改输入、返回字节、摘要或嵌套外壳不影响 Store 内状态；
- 未知/缺失字段、非对象、数组、尾随非空白、错误 UUID、版本、Base64、salt、nonce 和密文长度返回 `VAULT_META_INVALID`；
- 初始写入和 next 写入不覆盖已有文件，临时文件与目标位于同目录且权限参数为 `0o600`；
- 短写会继续到完整，零进度、sync、close、rename 和磁盘满失败均关闭句柄并只清理本次临时文件；
- 正式文件替换是提交点，提交前错误保留旧内容，提交后清理错误不破坏新内容；
- 相对、链接和大小写等价根路径规范化，非法 Profile ID 和内部会话名不能生成子路径；
- 错误对象不包含 Meta、密码、Key Package、文件名、Profile 路径或底层消息。

**精确测试命令：**

```powershell
npm run test:unit -- packages/application/src/__tests__/vault-meta.test.ts --runInBand
```

预期：Vault Meta、原子文件和路径测试全部通过，0 个失败且无临时文件泄漏。

**完成后提交：**

```powershell
git add packages/application/src/errors.ts packages/application/src/types.ts packages/application/src/paths.ts packages/application/src/atomic-file.ts packages/application/src/vault-meta.ts packages/application/src/__tests__/helpers.ts packages/application/src/__tests__/vault-meta.test.ts
git commit -m "feat(application): persist strict profile metadata"
```

---

## 功能模块 3：ProfileCatalog、分页与启动恢复

- [ ] 完成本模块的测试、实现、相关单元验证和一次提交。

**目标：** 用原子、可重建的非敏感 Catalog 管理本地 Profile 列表，并在启动时收敛创建残留、失效条目、未索引有效 Profile 和删除隔离目录。

**关键接口与功能逻辑：**

`catalog.ts` 的持久化格式固定为版本 1 和最多 1000 个 Profile：

```ts
interface CatalogEntry {
  readonly localProfileId: LocalProfileId;
  readonly displayName: string;
  readonly sortOrder: number;
  readonly lastUsedAt: Timestamp;
}

interface ProfileCatalog {
  get(id: LocalProfileId): CatalogEntry | undefined;
  has(id: LocalProfileId): boolean;
  list(input: PageRequest, currentId?: LocalProfileId): Page<ProfileSummary>;
  add(entry: CatalogEntry): Promise<void>;
  updateCache(entry: CatalogEntry): Promise<void>;
  remove(id: LocalProfileId): Promise<void>;
}
```

显示名修剪首尾空白后必须为 1–100 个 Unicode 码点；排序和时间必须是非负安全整数；ID 唯一。排序固定为 `sortOrder ASC, localProfileId ASC`。`pagination.ts` 使用 Base64URL 编码的 `[sortOrder, localProfileId]` Cursor，严格限制 `1 <= limit <= 100`，拒绝未知字段、非法 Base64、错误元组和不存在的排序位置。

Catalog 每次变更先生成完整不可变快照，再通过模块 2 的备份与原子替换提交；写入失败不改变内存快照。正式索引损坏时读取 `.bak` 并修复正式文件；两者都损坏时从 Profile 目录重建。

`recovery.ts` 在 `createProfileCatalog()` 返回前完成一次对账：

- Catalog 条目缺少规范目录时从新快照移除；
- `.creating` 且 Catalog 已有 ID 时保留目录并删除标记；
- `.creating` 且 Catalog 无 ID 时，只删除经真实路径验证的本次未发布目录；
- 无标记、路径 ID 与严格 Meta ID 匹配且 Catalog 无条目时，以 `Profile <ID前8位>`、稳定排序和时间 0 重建；
- `.deleting/<id>.<32hex>` 只在是普通目录、真实路径位于隔离根时续删，同时移除对应 Catalog 条目；
- 未知、链接、嵌套或结构异常条目保持原样，只增加不含名称的 `unexpectedEntryCount`。

删除适配器必须接收已经解析并再次验证的绝对路径，禁止调用方传入 glob、根目录或未决变量。启动报告只返回恢复和异常计数。

**涉及文件：**

- 创建：`packages/application/src/pagination.ts`
- 创建：`packages/application/src/catalog.ts`
- 创建：`packages/application/src/recovery.ts`
- 创建：`packages/application/src/__tests__/catalog.test.ts`
- 修改：`packages/application/src/paths.ts`
- 修改：`packages/application/src/types.ts`
- 修改：`packages/application/src/errors.ts`
- 修改：`packages/application/src/__tests__/helpers.ts`

**单元测试：**

- 缺失索引创建空 Catalog；健康索引严格读取；正式损坏时从备份恢复；双重损坏时从有效 Meta 重建；
- 未知字段、重复 ID/排序、超过 1000 项、非法名称/时间/版本和超大文件受控失败；
- add、update 和 remove 原子更新文件与内存，注入写入失败时两者都保持旧快照；
- 稳定排序、1/100 条边界、连续分页、错误 Cursor、被篡改 Cursor 和当前 Profile 的 `isCurrent` 正确；
- 四类 `.creating`/目录/Catalog 组合按设计保留、清理或重建；
- 正常和失败续删 `.deleting`，失败项保留供下次重试，Catalog 不重新暴露逻辑删除 Profile；
- 符号链接、junction、未知文件/目录和 ID/Meta 不匹配不被跟随或删除；
- 占位显示名首次 `updateCache()` 后替换为真实名称；报告和错误不含条目名称或路径。

**精确测试命令：**

```powershell
npm run test:unit -- packages/application/src/__tests__/catalog.test.ts --runInBand
```

预期：Catalog、分页和启动恢复测试全部通过，0 个失败，异常文件树保持不变。

**完成后提交：**

```powershell
git add packages/application/src/pagination.ts packages/application/src/catalog.ts packages/application/src/recovery.ts packages/application/src/paths.ts packages/application/src/types.ts packages/application/src/errors.ts packages/application/src/__tests__/helpers.ts packages/application/src/__tests__/catalog.test.ts
git commit -m "feat(application): recover local profile catalog"
```

---

## 功能模块 4：ProfileSession 资源所有权与关闭门

- [ ] 完成本模块的测试、实现、相关单元验证和一次提交。

**目标：** 用一个不可重新开放的 Session 独占当前 Profile 密钥、数据库和附件资源，为后续本地业务用例提供统一操作登记与安全关闭。

**关键接口与功能逻辑：**

`session.ts` 定义包内部接口，不从包根导出：

```ts
interface SessionResources {
  readonly database: VaultDatabase;
  readonly attachments: AttachmentStore;
  readonly signal: AbortSignal;
}

interface ProfileSession {
  readonly summary: UnlockedSession;
  run<Result>(
    operation: (resources: SessionResources) => Promise<Result> | Result,
  ): Promise<Result>;
  updateDisplayName(displayName: string): void;
  close(): Promise<void>;
}
```

创建 Session 时校验身份和两把 32 字节 Key，复制 Key 后冻结公开摘要；调用方无论创建成功或失败都继续负责清零原始输入。Session 只把资源暴露给包内部 `run()` 回调，回调在任何异步工作前登记到活跃集合。关闭标记设置后 `run()` 立即返回 `PROFILE_LOCKED`。

`updateDisplayName()` 只允许未关闭 Session 在数据库重命名提交后替换内部不可变摘要；它不访问 Catalog 或数据库，非法名称和关闭状态均拒绝。这样 `ProfileManager` 可以更新当前 Session DTO，而不让 Catalog 或 Storage 反向依赖 Session。

`close()` 首次调用同步标记关闭并触发内部 AbortController，然后等待所有已登记操作 settle，调用 `AttachmentStore.close()`，再调用 `VaultDatabase.close()`，最后无条件 `wipeBytes()` 两把 Session Key 并清除资源引用。每个边界用独立 `try/finally` 保证前一失败不阻止后续动作；返回第一个映射后的稳定错误。并发和重复 `close()` 复用同一 Promise，不重复关闭底层资源。

为测试提供包内部只读的关闭观察钩子或工厂依赖，不增加公共调试 API。不得使用 JSON、日志或错误保存 Key。

**涉及文件：**

- 创建：`packages/application/src/session.ts`
- 创建：`packages/application/src/__tests__/session.test.ts`
- 修改：`packages/application/src/types.ts`
- 修改：`packages/application/src/errors.ts`
- 修改：`packages/application/src/__tests__/helpers.ts`

**单元测试：**

- Session 复制并持有两把 Key，调用方修改原输入不影响 Session 工作；
- 同步和异步 `run()` 都先登记，关闭等待活跃操作完成且拒绝后续操作；
- AbortSignal 在关闭开始时触发，活跃操作可以观察取消并退出；
- 固定顺序为等待操作、关闭 Attachments、关闭数据库、清零两把 Key；
- Attachments 关闭失败、数据库关闭失败和两者同时失败时仍继续后续清理并只返回第一个稳定错误；
- 并发/重复关闭只执行一次底层关闭，关闭后的摘要仍不包含底层资源；
- 数据库重命名提交后可替换显示名称摘要，关闭后或非法名称不能修改摘要；
- 错误、快照和公共入口不出现 Key、路径、数据库或 Attachment Store。

**精确测试命令：**

```powershell
npm run test:unit -- packages/application/src/__tests__/session.test.ts --runInBand
```

预期：Session 生命周期与故障注入测试全部通过，底层资源各关闭一次且密钥观察值全部为 0。

**完成后提交：**

```powershell
git add packages/application/src/session.ts packages/application/src/types.ts packages/application/src/errors.ts packages/application/src/__tests__/helpers.ts packages/application/src/__tests__/session.test.ts
git commit -m "feat(application): own unlocked profile sessions"
```

---

## 功能模块 5：ProfileManager 创建、解锁、切换与重命名

- [ ] 完成本模块的测试、实现、相关单元验证和一次提交。

**目标：** 组合 Catalog、Meta、Crypto、SQLCipher、Attachments 和 Session，完成除改密与永久移除外的 Profile 生命周期，并保证全局最多一个已解锁 Session。

**关键接口与功能逻辑：**

`types.ts` 收口公共 DTO 与接口：

```ts
export interface ProfileSummary {
  readonly localProfileId: LocalProfileId;
  readonly displayName: string;
  readonly lastUsedAt: Timestamp;
  readonly isCurrent: boolean;
}

export type SessionState =
  | Readonly<{ state: 'LOCKED' }>
  | Readonly<{
      state: 'UNLOCKED';
      localProfileId: LocalProfileId;
      displayName: string;
      rootFolderId: FolderId;
    }>;

export interface ProfileManager {
  listProfiles(input: PageRequest): Page<ProfileSummary>;
  getSessionState(): SessionState;
  createProfile(input: {
    readonly displayName: string;
    readonly password: string;
  }): Promise<Extract<SessionState, { state: 'UNLOCKED' }>>;
  unlockProfile(input: {
    readonly localProfileId: LocalProfileId;
    readonly password: string;
  }): Promise<Extract<SessionState, { state: 'UNLOCKED' }>>;
  lockProfile(): Promise<void>;
  switchProfile(input: {
    readonly localProfileId: LocalProfileId;
    readonly password: string;
  }): Promise<Extract<SessionState, { state: 'UNLOCKED' }>>;
  renameProfile(displayName: string): Promise<ProfileSummary>;
  changeProfilePassword(input: {
    readonly oldPassword: string;
    readonly newPassword: string;
  }): Promise<void>;
  removeProfileFromDevice(localProfileId: LocalProfileId): Promise<void>;
  close(): Promise<void>;
}
```

`manager.ts` 内部使用单一 Promise 队列串行化全部生命周期写操作；`close()` 先同步设置终止标志，使排队及新操作不能发布 Session。名称保存修剪后的 1–100 Unicode 码点；密码保持原字节语义，不 trim、不 Unicode 规范化，只允许 1–1024 Unicode 码点。

创建流程严格使用 `.creating` 标记：生成三个 UUID，调用 `createProfileKeyPackage()`，写 Meta 和摘要，创建 SQLCipher v2 数据库与 Root Folder，初始化 Attachment Store，构造 Session，最后原子新增 Catalog。Catalog 新增是发布提交点；此前失败关闭资源、清零 Key 并只删除本次带标记目录，此后标记清理失败不把成功改成失败。

解锁按 Catalog、正式 Meta、Crypto、SQLCipher、摘要恢复、Attachments、Root Folder、Session 顺序执行。Root Folder 从 `database.folders.listAll()` 中取得且必须恰好一个 `kind === 'ROOT'`；Profile 名称从 `database.profileMetadata.get()` 取得。失败始终关闭部分资源、清零 Crypto 返回 Key 并保持锁定。

锁定幂等调用 Session close。切换必须先锁定当前 Profile，再尝试目标解锁，失败不恢复旧 Session。重命名在数据库事务中提交真实名称后更新 Session 摘要，Catalog 缓存更新为尽力操作；缓存失败不回滚或误报数据库已提交的重命名。

错误映射严格按类和 code：Crypto 认证失败仅在 Meta 已严格有效时映射 `WRONG_PASSWORD`；Crypto 初始化/操作失败映射 `CRYPTO_UNAVAILABLE`；Storage 和 Attachments 的已知码映射为设计中的稳定 Application 码；未知错误统一为 `OPERATION_FAILED`，不保留原文。

`manager.integration.test.ts` 至少一次使用公开生产工厂和临时目录，执行真实 Crypto Profile Key Package、SQLCipher v2 建库、Attachment Store 初始化、锁定和重新解锁；其他故障与并发测试使用受控内部工厂，避免重复高成本 KDF。

**涉及文件：**

- 创建：`packages/application/src/manager.ts`
- 创建：`packages/application/src/__tests__/manager.test.ts`
- 创建：`packages/application/src/__tests__/manager.integration.test.ts`
- 修改：`packages/application/src/types.ts`
- 修改：`packages/application/src/errors.ts`
- 修改：`packages/application/src/catalog.ts`
- 修改：`packages/application/src/recovery.ts`
- 修改：`packages/application/src/session.ts`
- 修改：`packages/application/src/vault-meta.ts`
- 修改：`packages/application/src/__tests__/helpers.ts`
- 修改：`packages/application/src/index.ts`

**单元测试：**

- 创建成功的路径、Meta、SQLCipher、Attachment Store、Catalog 和 Session 身份一致，Root Folder 正确；
- 在目录、Meta、数据库、附件、Session、Catalog 提交各边界注入失败，提交前没有 Catalog/目录残留，提交后启动恢复保留已发布 Profile；
- 错误密码、错误 Profile ID、Meta 篡改、数据库损坏、过高 Schema、迁移失败、磁盘满和未知错误稳定映射；
- 解锁失败关闭所有部分资源并清零 Key；成功后名称/最后使用时间缓存失败不关闭 Session；
- 锁定和 Manager close 幂等；创建/解锁与 close 竞争时不能在关闭后发布 Session；
- 切换先关闭旧 Session，目标成功时仅目标解锁，目标失败时全局锁定；
- 重命名以数据库为权威，Catalog 失败时当前摘要和下次解锁仍得到真实新名称；
- 并发创建、解锁、切换和锁定按调用顺序串行，观察期间最多一个 Session；
- 真实集成路径创建、锁定、重新解锁成功，错误密码无法打开，锁定后旧 Session 资源不可用。

**精确测试命令：**

```powershell
npm run test:unit -- packages/application/src/__tests__/manager.test.ts packages/application/src/__tests__/manager.integration.test.ts --runInBand
```

预期：Manager 单元与真实跨包集成测试全部通过，0 个失败，全程最多一个 Session。

**完成后提交：**

```powershell
git add packages/application/src/manager.ts packages/application/src/types.ts packages/application/src/errors.ts packages/application/src/catalog.ts packages/application/src/recovery.ts packages/application/src/session.ts packages/application/src/vault-meta.ts packages/application/src/index.ts packages/application/src/__tests__/helpers.ts packages/application/src/__tests__/manager.test.ts packages/application/src/__tests__/manager.integration.test.ts
git commit -m "feat(application): manage local profile lifecycle"
```

---

## 功能模块 6：崩溃安全的主密码修改

- [ ] 完成本模块的测试、实现、相关单元验证和一次提交。

**目标：** 使用 Storage v2 pending 摘要与 Meta 原子替换，使每个崩溃边界都只接受旧密码或新密码，并且不会出现两者都无法解锁的状态。

**关键接口与功能逻辑：**

`ProfileManager.changeProfilePassword()` 只允许当前 Session 执行。开始新改密前先读取正式 Meta 和数据库 `ProfileMetadata` 收敛旧状态：

- 正式摘要匹配 pending：在事务中 finalize；
- 正式摘要匹配 current 且存在 pending：在事务中 cancel，并删除残留 next；
- 正式摘要两者都不匹配：返回 `DB_CORRUPT`，不猜测或覆盖。

正常流程固定为：

1. 用旧密码和正式 Meta 调用 `changeProfilePassword()`，取得新 Key Package；
2. 用相同 Local Profile ID、Vault ID 和文件格式编码新 Meta，写入并 fsync `vault.meta.next`；
3. 数据库事务调用 `prepareVaultMetaDigest({ currentDigest, pendingDigest })`；
4. 原子把 next 替换为正式 `vault.meta`；此 rename 是改密提交点；
5. 数据库事务调用 `finalizeVaultMetaDigest()`；
6. 清理临时状态并返回。

提交点前失败时尝试 cancel pending 和删除 next，正式 Meta 与旧密码继续有效，清理失败不覆盖最初错误。提交点后新密码已经有效；finalize 或清理失败不能回滚文件，也不能把业务结果改为失败，记录非敏感诊断并由下次解锁/改密收口。Crypto `changeProfilePassword()` 已清零其内部 Database/Vault Key，本模块不得缓存旧密码、新密码或 Key Package 明文序列化之外的额外副本。

解锁路径在 SQLCipher 打开后、Attachment Store 打开前调用同一收口函数，保证崩溃恢复不依赖当前 Session。普通解锁始终只尝试正式 Meta；`vault.meta.next` 不能让未提交的新密码通过。

**涉及文件：**

- 创建：`packages/application/src/__tests__/password-change.test.ts`
- 修改：`packages/application/src/manager.ts`
- 修改：`packages/application/src/vault-meta.ts`
- 修改：`packages/application/src/errors.ts`
- 修改：`packages/application/src/__tests__/helpers.ts`

**单元测试：**

- 正确旧密码修改成功后正式 Meta 改变而 Local Profile/Vault ID 不变，新密码可重新解锁，旧密码失败；
- 错误旧密码不创建 next、不登记 pending、不改变当前 Session；
- 在 next 写入前后、prepare 前后和原子替换前注入失败，旧密码有效、新密码无效，pending/next 最终清理；
- 在原子替换后、finalize 前后和临时清理时注入崩溃，新密码有效、旧密码无效，下次解锁完成 finalize；
- 正式摘要匹配 current 时取消旧 pending，匹配 pending 时完成提升，两者均幂等收敛；
- 正式摘要两者都不匹配时不覆盖 Meta 或数据库，返回 `DB_CORRUPT`；
- 连续修改两次密码先收敛前一次状态，不复用 salt、nonce 或 Key Package；
- 磁盘满、Crypto 失败和 Storage 失败映射稳定，错误与诊断不含任一密码、Meta、摘要、路径或底层消息。

**精确测试命令：**

```powershell
npm run test:unit -- packages/application/src/__tests__/password-change.test.ts --runInBand
```

预期：改密正常路径与全部崩溃边界测试通过，0 个失败，任一恢复场景恰好一种密码有效。

**完成后提交：**

```powershell
git add packages/application/src/manager.ts packages/application/src/vault-meta.ts packages/application/src/errors.ts packages/application/src/__tests__/helpers.ts packages/application/src/__tests__/password-change.test.ts
git commit -m "feat(application): change profile passwords atomically"
```

---

## 功能模块 7：从设备永久移除与公共 API 收口

- [ ] 完成本模块的测试、实现、相关单元验证和一次提交。

**目标：** 把已确认的 Profile 原子隔离后永久删除，启动时续删未完成隔离目录，并确保包根只公开后续 Main 需要的安全业务接口。

**关键接口与功能逻辑：**

`removeProfileFromDevice(localProfileId)` 先通过 Catalog 确认目标存在；目标为当前 Profile 时完整 `lockProfile()`。随后创建规范 `.deleting` 根，把 `profiles/<id>` 原子 rename 为 `.deleting/<id>.<32hex>`，rename 是逻辑删除提交点。提交后立即从 Catalog 内存和持久化快照移除，再对隔离目录执行真实路径复核和永久递归删除，最后尝试刷新隔离父目录。

提交前失败保持 Profile 可用；提交后任何 Catalog 或物理删除失败都返回 `REMOVE_FAILED`，但绝不把隔离目录移回或允许再次解锁。Catalog 查询和下次启动对账必须隐藏/移除该 ID并重试删除。重复调用已经逻辑删除但仍存在规范隔离条目的 ID 时继续清理；Catalog 与隔离区都无目标时返回 `ENTITY_NOT_FOUND`。

只有以下条件全部满足才允许递归删除：父目录是已规范化 `.deleting` 根、名称为目标规范 ID 加点和 32 位随机小写十六进制、`lstat()` 是普通目录且不是链接/重解析点、`realpath()` 仍位于删除根的直接子级。不得删除系统回收站、Profile 根、应用数据根、未知目录或 glob 匹配结果。

`index.ts` 最终只导出：

```ts
export { createProfileManager } from './manager';
export {
  ApplicationError,
  type ApplicationErrorCode,
} from './errors';
export type {
  Page,
  PageRequest,
  ProfileManager,
  ProfileSummary,
  SessionState,
} from './types';
```

不得导出 `ProfileSession`、`ProfileCatalog`、`VaultMetaStore`、路径、原子文件、恢复扫描器、依赖工厂、Database Key、Vault Key、`VaultDatabase` 或 `AttachmentStore`。`workspace-resolution.test.ts` 验证 `@notera/application` 可解析且内部名字不可见。

**涉及文件：**

- 创建：`packages/application/src/__tests__/removal.test.ts`
- 修改：`packages/application/src/manager.ts`
- 修改：`packages/application/src/catalog.ts`
- 修改：`packages/application/src/recovery.ts`
- 修改：`packages/application/src/paths.ts`
- 修改：`packages/application/src/types.ts`
- 修改：`packages/application/src/errors.ts`
- 修改：`packages/application/src/index.ts`
- 修改：`packages/application/src/__tests__/helpers.ts`
- 修改：`packages/application/src/__tests__/catalog.test.ts`
- 修改：`src/__tests__/workspace-resolution.test.ts`

**单元测试：**

- 删除锁定 Profile 时依次隔离、移除 Catalog、永久删除，最终列表和目录均无目标；
- 删除当前 Profile 先等待 Session 完整关闭，关闭失败时不移动目录；
- rename 提交前失败保持 Profile 可解锁，提交后 Catalog/物理删除失败不恢复 Profile并返回 `REMOVE_FAILED`；
- 启动恢复续删物理失败条目并移除残留 Catalog，下一次成功后隔离目录消失；
- 重复清理规范隔离项幂等，完全不存在的 ID 返回 `ENTITY_NOT_FOUND`；
- 相似前缀、错误随机串、嵌套目录、普通文件伪装目录、符号链接、junction 和逃逸 realpath 全部保留且不被递归；
- 删除目标精确位于测试应用数据根内，测试证明同级其他 Profile、Catalog 备份和异常条目内容/哈希不变；
- 包入口存在 `createProfileManager`、错误和 DTO 类型，内部实现名、密钥及底层资源均未导出；
- 删除错误和恢复报告不含 Profile ID 之外的真实路径、底层异常或用户数据。

**精确测试命令：**

```powershell
npm run test:unit -- packages/application/src/__tests__/removal.test.ts packages/application/src/__tests__/catalog.test.ts src/__tests__/workspace-resolution.test.ts --runInBand
```

预期：永久移除、启动续删、Catalog 回归和 Workspace 公共入口测试全部通过，0 个失败，异常目录保持不变。

**完成后提交：**

```powershell
git add packages/application/src/manager.ts packages/application/src/catalog.ts packages/application/src/recovery.ts packages/application/src/paths.ts packages/application/src/types.ts packages/application/src/errors.ts packages/application/src/index.ts packages/application/src/__tests__/helpers.ts packages/application/src/__tests__/catalog.test.ts packages/application/src/__tests__/removal.test.ts src/__tests__/workspace-resolution.test.ts
git commit -m "feat(application): remove local profiles permanently"
```

---

## 最终验证

七个功能模块全部完成并分别提交后，只执行以下一次必要最终验证：

```powershell
npm run test:unit -- packages/storage-sqlcipher/src/__tests__ packages/application/src/__tests__ packages/crypto/src/__tests__/profile-keys.test.ts src/__tests__/workspace-resolution.test.ts --runInBand
npm run typecheck -w @notera/storage-sqlcipher
npm run typecheck -w @notera/application
npm run typecheck:app
npm run check:deps
npm run lint
git diff --check
```

预期结果：

- Storage 全部单元测试在 Schema v2 下通过，Application 全部生命周期与故障注入测试通过，Crypto Profile Key 和 Workspace 解析测试通过，0 个失败；
- Storage、Application 和应用 TypeScript 检查通过；
- Dependency Cruiser 显示 0 个违规，Application 只依赖四个既定底层包与 Node，Storage 仍只依赖 Domain；
- ESLint 通过，`git diff --check` 无输出；
- 工作区只保留用户原有且未纳入计划的未跟踪内容。

本次不运行 SQLCipher 二进制探测或生产 build：计划新增普通 Schema 迁移和 Application Node 模块，但不改变原生二进制加载、Electron 入口、Preload、Renderer 或 Webpack。验证失败时只修复对应原因并复测受影响检查；未受影响且已经通过的检查不重复运行。若修复涉及功能逻辑，追加到对应模块提交；若只是在最终统一检查中发现的格式、类型或依赖声明问题，创建一次收尾提交：

```powershell
git add packages/storage-sqlcipher packages/application src/__tests__/workspace-resolution.test.ts
git commit -m "style(application): satisfy final checks"
```

## 完成标准

- 七个完整功能模块各完成一次提交，不按测试、实现或验证拆分提交；
- v1 基线保持不可变，Schema v2 通过连续生产迁移增加 pending Meta 摘要；
- ProfileManager、ProfileCatalog、VaultMetaStore 和 ProfileSession 的调用方向符合规格，包根不泄露内部资源；
- 离线状态可列出、创建、解锁、锁定、切换、重命名、改密和永久移除多个本地 Profile；
- 任一时刻最多一个 Profile 解锁，切换失败后保持锁定，Manager 关闭后不能发布新 Session；
- Catalog 损坏、创建中断和删除中断均安全恢复，不跟随或删除异常路径；
- 锁定后数据库、附件资源和 Session Key 不可再访问，所有失败路径清零调用方与 Session 密钥副本；
- 主密码修改从任一持久化边界崩溃后都恰好由旧密码或新密码继续，不出现两种密码均无法解锁的状态；
- 从设备移除不进入系统回收站，逻辑删除后不能重新解锁，物理失败由启动恢复续删；
- 公共错误、日志和 DTO 不泄露密码、密钥、Meta、底层资源、真实路径或用户业务数据；
- 不包含本地笔记用例、附件业务编排、Electron IPC/UI 或同步实现与占位结构；
- 相关单元测试和一次必要最终验证全部通过。
