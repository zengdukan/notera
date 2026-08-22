# Notera 离线 SQLCipher 存储实施计划

> **执行约束：** 实施时必须使用 `superpowers:executing-plans`，并遵守仓库根目录 `AGENTS.md`。按完整功能模块实施，一模块一提交；测试先表达行为再实现，但不把红、绿、重构拆成独立计划步骤；不启用子代理驱动开发、逐任务审核或额外审核代理。

**目标：** 实现真实 SQLCipher 加密的完整离线存储层，包括 Schema、迁移、事务、领域 Repository、FTS5 搜索、目录子树搜索、完整性检查和原生运行时验证。

**架构：** `packages/storage-sqlcipher` 采用“只读 Repository + 同步事务工作单元”边界，内部封装本机 `@notera/sqlcipher` 原生驱动，所有写入只通过同步 `VaultTransaction` 完成。Schema 不定义或启用外键，关系完整性由 Repository 预检查、原子事务和显式完整性扫描保证；Note 正文与 FTS 在同一事务增量维护。

**技术栈：** TypeScript 5、Jest 29、ts-jest、Electron 42.9.3、Node 24、`@notera/sqlcipher@13.0.3-sqlcipher.4.17.0`、SQLCipher Community 4.17.0、SQLite FTS5 trigram、`@ar-nelson/foldcase`

**规格：** `docs/superpowers/specs/2026-08-22-offline-sqlcipher-storage-design.md`

---

## 文件布局

实施完成后的主要文件职责如下：

```text
packages/storage-sqlcipher/
  package.json
  scripts/
    sqlcipher-runtime.cjs             # Node/Electron 原生加密行为探测
  src/
    errors.ts                         # 稳定 StorageError 与原生错误映射
    types.ts                          # 公开分页、元数据、搜索和完整性类型
    database-key.ts                   # 32 字节 Key 校验与临时十六进制处理
    connection.ts                     # 原生连接创建、配置、checkpoint 与关闭
    database.ts                       # VaultDatabase 与同步事务工作单元
    cursor.ts                         # 严格 Keyset Cursor 编解码与查询绑定
    integrity.ts                      # 无外键完整性扫描
    native/
      types.ts                        # 最小原生驱动类型
      load.ts                         # 固定加载 @notera/sqlcipher
      foldcase.d.ts                   # 大小写折叠依赖的内部声明
    schema/
      current.ts                      # v1 完整 Schema 快照
      inspect.ts                      # Schema 版本与结构读取
    migrations/
      types.ts                        # Migration 接口
      registry.ts                     # 连续生产迁移注册表
      runner.ts                       # 逐版本事务执行器
    repositories/
      profile-metadata.ts
      folders.ts
      notes.ts
      tags.ts
      favorites.ts
      history.ts
      trash.ts
      attachments.ts
      content-plans.ts                # 领域批量 Plan 原子落库
    search/
      adf-text.ts                     # 迭代式 ADF 文本提取
      normalize.ts                    # NFKC、完整折叠与原文码点映射
      index-writer.ts                 # Note/FTS 同事务维护
      query.ts                        # 全库与目录子树搜索
      excerpt.ts                      # 原文摘录与高亮
      health.ts                       # 索引检查和事务性重建
    serialization/
      adf-json.ts                     # 无固定上限的迭代式 ADF 序列化
      rows.ts                         # SQL 行到领域实体的严格水合
    __tests__/
      helpers.ts
      connection.test.ts
      schema.test.ts
      migrations.test.ts
      transactions-folders.test.ts
      notes-index.test.ts
      organization-history.test.ts
      trash-plans.test.ts
      attachments.test.ts
      search.test.ts
      integrity.test.ts
    index.ts                          # 唯一公开入口
```

不创建通用 SQL Repository、ORM 实体、同步占位目录或远端附件字段。测试辅助原生 SQL 入口只放在 `__tests__/helpers.ts`，不得从 `src/index.ts` 导出。

## 功能模块 1：解除 ADF 固定上限并扩展搜索范围契约

**目标：** 先统一 IPC、领域层和后续存储层对 ADF 与目录范围搜索的边界，确保任意规模和深度的合法 ADF 不再因旧阈值被拒绝。

**涉及文件：**

- 修改：`src/shared/ipc/adf.ts`
- 修改：`src/shared/ipc/__tests__/adf.test.ts`
- 修改：`src/shared/ipc/contracts/search.ts`
- 修改：`src/shared/ipc/__tests__/organization-contracts.test.ts`
- 修改：`packages/domain/src/adf.ts`
- 修改：`packages/domain/src/__tests__/primitives.test.ts`

**功能逻辑：**

1. 从 Shared 删除 `MAX_ADF_BYTES`、`MAX_ADF_NODES`、`MAX_ADF_DEPTH` 及序列化字节、遍历数量和深度判断；继续拒绝错误根、非有限数、循环、访问器、Symbol、函数、类实例和稀疏数组。Shared 与 Domain 都使用进入/退出帧维护“当前活动祖先”集合，只拒绝真正的祖先环，允许同一非循环对象在不同位置重复出现。
2. 把 Domain 当前递归 `cloneJson` 改为显式栈：进入容器时验证原型和属性描述符、加入活动祖先集合并创建目标容器；退出帧时移出活动集合并冻结目标。该算法允许同一非循环对象在不同位置重复出现，但拒绝祖先环。
3. Domain 和 Shared 都不调用递归遍历函数；Shared 不再为了计算大小执行整文档 `JSON.stringify`。
4. `search.query` 请求增加可选 `folderId: uuidSchema.optional()`；省略表示整个 Vault，提供表示完整目录子树。响应结构和 Channel 不变。

**关键接口：**

```ts
export interface AdfDocument {
  readonly type: 'doc';
  readonly version: 1;
  readonly content?: readonly JsonValue[];
  readonly [key: string]: JsonValue | undefined;
}

export const searchQuery = defineRequestContract({
  key: 'search.query',
  channel: 'notera:search:query',
  request: cursorPageRequestSchema.extend({
    query: querySchema,
    folderId: uuidSchema.optional(),
  }),
  data: cursorPageSchema(searchResultSchema),
  errors: [
    'PROFILE_LOCKED',
    'ENTITY_NOT_FOUND',
    'INVALID_CURSOR',
    'IPC_OPERATION_FAILED',
  ],
});
```

**单元测试：**

- 原有最小、嵌套、非法根、非 JSON、循环、原型和访问器用例继续通过。
- 合法 ADF 分别超过原 8 MiB、100,000 JSON 值和 128 层时通过。
- 深度超过 128 的 Domain 克隆成功且输出冻结，不发生 `RangeError`。
- 搜索请求接受无 `folderId` 和合法 `folderId`，拒绝非法 UUID 与额外范围字段。

**精确测试命令：**

```powershell
npm run test:unit -- packages/domain/src/__tests__/primitives.test.ts src/shared/ipc/__tests__/adf.test.ts src/shared/ipc/__tests__/organization-contracts.test.ts --runInBand
```

预期：三个测试文件全部通过，0 个失败。

**完成后提交：**

```powershell
git add packages/domain/src/adf.ts packages/domain/src/__tests__/primitives.test.ts src/shared/ipc/adf.ts src/shared/ipc/contracts/search.ts src/shared/ipc/__tests__/adf.test.ts src/shared/ipc/__tests__/organization-contracts.test.ts
git commit -m "feat(storage): remove adf limits and scope search"
```

## 功能模块 2：真实 SQLCipher 原生连接与运行时验证

**目标：** 接入固定本机 `.tgz`，建立不泄露 Key、SQL 或路径的原生连接适配，并证明 Node 与 Electron 都实际读写真正的加密数据库。

**涉及文件：**

- 修改：`package.json`
- 修改：`package-lock.json`
- 修改：`packages/storage-sqlcipher/package.json`
- 创建：`packages/storage-sqlcipher/src/native/types.ts`
- 创建：`packages/storage-sqlcipher/src/native/load.ts`
- 创建：`packages/storage-sqlcipher/src/database-key.ts`
- 创建：`packages/storage-sqlcipher/src/connection.ts`
- 创建：`packages/storage-sqlcipher/src/errors.ts`
- 创建：`packages/storage-sqlcipher/src/__tests__/connection.test.ts`
- 创建：`packages/storage-sqlcipher/scripts/sqlcipher-runtime.cjs`

**功能逻辑：**

1. 增加绝对路径依赖：

```json
"@notera/sqlcipher": "file:D:/programs/vendor/build/ci-run-32264792724-verify/extracted/dist/notera-sqlcipher-13.0.3-sqlcipher.4.17.0.tgz"
```

2. `native/types.ts` 只声明实现所需的构造器、`prepare/get/all/run/iterate`、`exec`、`pragma`、`transaction`、`close` 和 `SqliteError.code`，不引入普通 `better-sqlite3` 类型。
3. `database-key.ts` 验证 Key 是恰好 32 字节的 `Uint8Array`，创建临时 Buffer，生成只含 `[0-9a-f]` 的 SQLCipher 原始 Key 表达式，并在调用完成后的 `finally` 中清零 Buffer。错误和对象不保存 Key。
4. `connection.ts` 区分 `create` 与 `open`：创建要求文件不存在，打开要求 `fileMustExist`；Key 是第一条数据库配置。随后设置 WAL、`synchronous = FULL`、`secure_delete = ON`、`temp_store = MEMORY` 和固定 busy timeout，不设置外键，也不查询或验证 `PRAGMA cipher_version`。
5. 关闭执行 WAL checkpoint 后释放句柄；重复关闭幂等。打开既有文件失败不删除；创建失败只清理调用前不存在且由本次创建的精确 DB/WAL/SHM 路径。
6. `StorageError` 使用固定安全消息，并把 `SQLITE_NOTADB/CORRUPT`、`SQLITE_FULL`、`SQLITE_BUSY/LOCKED`、IO 错误映射为稳定存储码。
7. 根 `package.json` 增加 `test:sqlcipher-runtime`，脚本在系统临时目录用 Node/Electron 运行时创建数据库并安全清理精确临时目录。

**关键接口：**

```ts
export type StorageErrorCode =
  | 'DATABASE_CLOSED'
  | 'DATABASE_ALREADY_EXISTS'
  | 'DATABASE_NOT_FOUND'
  | 'INVALID_DATABASE_KEY'
  | 'DB_CORRUPT'
  | 'DB_SCHEMA_TOO_NEW'
  | 'MIGRATION_FAILED'
  | 'DISK_FULL'
  | 'DATABASE_BUSY'
  | 'CONTENT_VERSION_CONFLICT'
  | 'ENTITY_NOT_FOUND'
  | 'INVALID_CURSOR'
  | 'RELATION_INTEGRITY_VIOLATION'
  | 'SEARCH_INDEX_UNAVAILABLE'
  | 'STORAGE_OPERATION_FAILED';

interface OpenNativeConnectionOptions {
  readonly filePath: string;
  readonly databaseKey: Uint8Array;
  readonly mode: 'CREATE' | 'OPEN_EXISTING';
}

function openNativeConnection(
  options: OpenNativeConnectionOptions,
): SqlcipherConnection;
```

**单元测试与原生测试：**

- 拒绝 0、31、33 字节 Key，消息不含 Key 或路径。
- 创建模式拒绝已存在文件；打开模式拒绝缺失文件。
- 正确 32 字节 Key 创建、写入、关闭并重新打开；无 Key和错误 Key读取失败。
- 文件前 16 字节不是 `SQLite format 3\0`；普通 `node:sqlite` 无法读取。
- Node 24 与 Electron 42.9.3 都能加载默认包入口并执行 FTS5 trigram。
- 重复关闭安全，关闭后调用失败，文件句柄可重新打开或删除。
- 模拟原生错误码验证安全映射，不回显 SQL、参数或原生错误正文。

**精确测试命令：**

```powershell
npm run test:unit -- packages/storage-sqlcipher/src/__tests__/connection.test.ts --runInBand
npm run test:sqlcipher-runtime
```

预期：连接测试全部通过；运行时脚本分别报告 Node、Electron、加密文件、错误 Key、普通 SQLite 拒绝和 trigram 检查成功。

**完成后提交：**

```powershell
git add package.json package-lock.json packages/storage-sqlcipher/package.json packages/storage-sqlcipher/src/native packages/storage-sqlcipher/src/database-key.ts packages/storage-sqlcipher/src/connection.ts packages/storage-sqlcipher/src/errors.ts packages/storage-sqlcipher/src/__tests__/connection.test.ts packages/storage-sqlcipher/scripts/sqlcipher-runtime.cjs
git commit -m "feat(storage): establish sqlcipher runtime"
```

## 功能模块 3：Schema v1、迁移框架与 Vault 数据库生命周期

**目标：** 创建无外键的完整离线 Schema，建立严格版本迁移，并提供安全的 `createVaultDatabase`、`openVaultDatabase` 与 `close` 生命周期。

**涉及文件：**

- 创建：`packages/storage-sqlcipher/src/schema/current.ts`
- 创建：`packages/storage-sqlcipher/src/schema/inspect.ts`
- 创建：`packages/storage-sqlcipher/src/migrations/types.ts`
- 创建：`packages/storage-sqlcipher/src/migrations/registry.ts`
- 创建：`packages/storage-sqlcipher/src/migrations/runner.ts`
- 创建：`packages/storage-sqlcipher/src/types.ts`
- 创建：`packages/storage-sqlcipher/src/database.ts`
- 创建：`packages/storage-sqlcipher/src/__tests__/helpers.ts`
- 创建：`packages/storage-sqlcipher/src/__tests__/schema.test.ts`
- 创建：`packages/storage-sqlcipher/src/__tests__/migrations.test.ts`
- 修改：`packages/storage-sqlcipher/src/index.ts`

**功能逻辑：**

1. `CURRENT_SCHEMA_VERSION = 1`。新库直接执行当前快照并写入 Vault 元数据与 Root Folder，不重放迁移。
2. Schema 创建 `schema_metadata`、`vault_metadata`、`search_metadata`、`folders`、`notes`、`note_versions`、`tags`、`note_tags`、`favorites`、`trash_entries`、`attachments`、`attachment_references` 和内容型 `notes_fts`。
3. 所有表只使用 `PRIMARY KEY`、`UNIQUE`、`CHECK` 和索引；SQL 文本中不得出现 `FOREIGN KEY` 或 `REFERENCES`。附件引用使用三列非空计数等于 1 的 `CHECK`；File Key 固定 32 字节，Manifest 固定不超过 1 MiB。
4. `openVaultDatabase` 设置 Key 后读取 `schema_metadata`：缺失/非法返回 `DB_CORRUPT`，过高返回 `DB_SCHEMA_TOO_NEW`，较低执行连续迁移。每个目标版本独立事务，最后才更新版本。
5. v1 生产迁移注册表为空；注册器仍验证重复、缺口、乱序和目标版本连续性。测试可向执行器传入内部测试注册表，公开入口不可注入迁移。
6. 迁移完成后验证 Vault ID、Root Folder ID 和 32 字节 `vault.meta` 摘要；任一不符关闭并返回 `DB_CORRUPT`。
7. `VaultDatabase.close()` 幂等，关闭后任何方法返回 `DATABASE_CLOSED`。公开入口不导出原生连接或 Schema SQL。

**关键接口：**

```ts
export const CURRENT_SCHEMA_VERSION = 1;

export interface CreateVaultDatabaseOptions {
  readonly filePath: string;
  readonly databaseKey: Uint8Array;
  readonly identity: VaultIdentity;
  readonly profileName: string;
  readonly vaultMetaDigest: Uint8Array;
}

export interface OpenVaultDatabaseOptions {
  readonly filePath: string;
  readonly databaseKey: Uint8Array;
  readonly expectedVaultId: VaultId;
  readonly expectedVaultMetaDigest: Uint8Array;
}

export function createVaultDatabase(
  options: CreateVaultDatabaseOptions,
): VaultDatabase;

export function openVaultDatabase(
  options: OpenVaultDatabaseOptions,
): VaultDatabase;
```

迁移接口固定为：

```ts
interface Migration {
  readonly targetVersion: number;
  readonly migrate: (database: MigrationDatabase) => void;
  readonly validate: (database: MigrationDatabase) => void;
}
```

**单元测试：**

- 新建库包含全部 v1 表、列、索引、CHECK 和 FTS5 trigram，元数据与 Root Folder 正确。
- `sqlite_master.sql` 不含 `FOREIGN KEY`/`REFERENCES`，`PRAGMA foreign_keys` 不为启用状态。
- 新建快照和测试迁移最终结构通过规范化 `sqlite_master` 比较一致。
- 缺失、非法、低版本、高版本和 Vault/摘要不一致返回规定错误并关闭连接。
- 测试迁移覆盖连续提交、当前步骤回滚、断点续迁、重复/缺口/乱序拒绝。
- 创建中途失败只清理新文件；打开既有库失败不改变文件哈希。

**精确测试命令：**

```powershell
npm run test:unit -- packages/storage-sqlcipher/src/__tests__/schema.test.ts packages/storage-sqlcipher/src/__tests__/migrations.test.ts --runInBand
```

预期：两个测试文件全部通过，0 个失败。

**完成后提交：**

```powershell
git add packages/storage-sqlcipher/src/schema packages/storage-sqlcipher/src/migrations packages/storage-sqlcipher/src/types.ts packages/storage-sqlcipher/src/database.ts packages/storage-sqlcipher/src/index.ts packages/storage-sqlcipher/src/__tests__/helpers.ts packages/storage-sqlcipher/src/__tests__/schema.test.ts packages/storage-sqlcipher/src/__tests__/migrations.test.ts
git commit -m "feat(storage): define encrypted vault schema"
```

## 功能模块 4：同步事务工作单元、Profile 元数据与目录 Repository

**目标：** 建立只能同步使用的写事务边界，并完成 Profile 元数据和无限层级目录的严格持久化。

**涉及文件：**

- 创建：`packages/storage-sqlcipher/src/cursor.ts`
- 创建：`packages/storage-sqlcipher/src/serialization/rows.ts`
- 创建：`packages/storage-sqlcipher/src/repositories/profile-metadata.ts`
- 创建：`packages/storage-sqlcipher/src/repositories/folders.ts`
- 修改：`packages/storage-sqlcipher/src/types.ts`
- 修改：`packages/storage-sqlcipher/src/database.ts`
- 修改：`packages/storage-sqlcipher/src/index.ts`
- 创建：`packages/storage-sqlcipher/src/__tests__/transactions-folders.test.ts`

**功能逻辑：**

1. `VaultDatabase` 上只暴露 Reader；`transaction(callback)` 在原生事务函数内部创建 `VaultTransaction`，调用回调后、提交前检查返回值不是 thenable。
2. 活动事务标志禁止嵌套；事务退出后使 Transaction 和 Writer Repository 失效；事务中调用 `close` 抛错并回滚。
3. Profile 元数据 Reader 返回复制后的摘要；Writer 支持重命名和替换 32 字节 `vault.meta` 摘要，始终限制在当前唯一 Vault。
4. Folder Reader 支持 `get`、`listAll`、按父级 Keyset 分页和读取子树快照。Writer 接收领域层构造的 `Folder`，实现 Root 保护、父级存在、Vault 一致、无环检查、插入、替换和批量排序。
5. 所有 SQL 行通过 `asVaultId/asFolderId/asTimestamp/asSortOrder/asFolderName` 与 `createRootFolder/createRegularFolder` 水合；非法行映射为 `DB_CORRUPT`。
6. Cursor 为 base64url 编码的严格版本化 JSON，包含 kind、查询指纹、排序值和最后 ID；解析失败、kind/查询不匹配、limit 不在 1–100 返回 `INVALID_CURSOR`。

**关键接口：**

```ts
export interface PageRequest {
  readonly cursor?: string;
  readonly limit: number;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor?: string;
}

export interface FolderReader {
  get(id: FolderId): Folder | undefined;
  listAll(): readonly Folder[];
  listChildren(parentId: FolderId, page: PageRequest): Page<Folder>;
}

export interface FolderWriter extends FolderReader {
  insert(folder: Folder): void;
  replace(folder: Folder): void;
  replaceSortOrders(folders: readonly Folder[]): void;
}

export interface VaultDatabase {
  readonly profileMetadata: ProfileMetadataReader;
  readonly folders: FolderReader;
  transaction<T>(callback: (tx: VaultTransaction) => T): T;
  close(): void;
}
```

**单元测试：**

- 正常事务提交；回调异常、thenable、嵌套、事务内关闭全部回滚。
- 事务结束后的 Writer 引用和数据库关闭后的 Reader 均不可使用。
- Profile 名称与摘要正常往返，返回摘要不能修改数据库内值。
- Root 不可插入第二个、重命名、移动或删除；普通目录父级必须存在且同 Vault。
- 任意深度目录读写、移动和分页正确；自身/后代移动以及损坏目录环被拒绝。
- Cursor 跨父目录、跨 Reader、非法 limit 和非法编码被拒绝。

**精确测试命令：**

```powershell
npm run test:unit -- packages/storage-sqlcipher/src/__tests__/transactions-folders.test.ts --runInBand
```

预期：该测试文件全部通过，0 个失败。

**完成后提交：**

```powershell
git add packages/storage-sqlcipher/src/cursor.ts packages/storage-sqlcipher/src/serialization packages/storage-sqlcipher/src/repositories/profile-metadata.ts packages/storage-sqlcipher/src/repositories/folders.ts packages/storage-sqlcipher/src/types.ts packages/storage-sqlcipher/src/database.ts packages/storage-sqlcipher/src/index.ts packages/storage-sqlcipher/src/__tests__/transactions-folders.test.ts
git commit -m "feat(storage): add transactional folder repositories"
```

## 功能模块 5：Note Repository、无上限 ADF 序列化与 FTS 增量维护

**目标：** 持久化当前 Note，以乐观并发保护自动保存，并保证 Note 正文与 FTS5 索引始终原子一致。

**涉及文件：**

- 修改：`packages/storage-sqlcipher/package.json`
- 修改：`package-lock.json`
- 创建：`packages/storage-sqlcipher/src/native/foldcase.d.ts`
- 创建：`packages/storage-sqlcipher/src/serialization/adf-json.ts`
- 创建：`packages/storage-sqlcipher/src/search/adf-text.ts`
- 创建：`packages/storage-sqlcipher/src/search/normalize.ts`
- 创建：`packages/storage-sqlcipher/src/search/index-writer.ts`
- 创建：`packages/storage-sqlcipher/src/repositories/notes.ts`
- 修改：`packages/storage-sqlcipher/src/repositories/folders.ts`
- 修改：`packages/storage-sqlcipher/src/serialization/rows.ts`
- 修改：`packages/storage-sqlcipher/src/types.ts`
- 修改：`packages/storage-sqlcipher/src/database.ts`
- 修改：`packages/storage-sqlcipher/src/index.ts`
- 创建：`packages/storage-sqlcipher/src/__tests__/notes-index.test.ts`

**功能逻辑：**

1. 增加 `@ar-nelson/foldcase@1.0.1`，内部声明 `full` 与 `charFull`，不从公开入口导出依赖类型。
2. `serializeAdf` 使用显式输出栈生成 JSON：容器帧负责逗号、键和值顺序，字符串和有限数字只对单个原子调用 `JSON.stringify`；不设置字节、值数量或深度上限。`parseAdf` 使用 `JSON.parse` 后交给迭代式 Domain `asAdfDocument`。
3. `extractAdfText` 迭代遍历 ADF，按文档顺序提取 text，给段落、标题、列表项、表格单元格、代码块和 `hardBreak` 加稳定分隔，不索引 URL、附件属性或隐藏元数据。
4. `normalizeSearchText` 按 Unicode grapheme 处理 NFKC 和完整大小写折叠，返回规范化文本以及每个输出码点对应的原始码点起止；`NORMALIZER_VERSION = 1`。
5. Note 创建在一个事务插入 `notes` 并以同一 `row_id` 插入 `notes_fts`。正文替换使用 `WHERE note_id = ? AND content_version = ?`，影响零行时区分不存在和冲突；成功后同事务替换 FTS。
6. Note 移动和排序只更新元数据，不递增内容版本或重写 FTS。Folder Reader 增加目录内 Folder/Note 混合 Keyset 列表，按 `sort_order`、kind、ID 稳定排序。

**关键接口：**

```ts
export interface NoteReader {
  get(id: NoteId): Note | undefined;
  listByFolder(folderId: FolderId, page: PageRequest): Page<Note>;
  listRecent(page: PageRequest): Page<Note>;
}

export interface NoteWriter extends NoteReader {
  insert(note: Note): void;
  replaceContent(note: Note, expectedContentVersion: ContentVersion): void;
  replaceLocation(note: Note): void;
  replaceSortOrders(notes: readonly Note[]): void;
}

export interface NormalizedSearchText {
  readonly text: string;
  readonly sourceRanges: readonly Readonly<{
    start: number;
    end: number;
  }>[];
}
```

**单元测试：**

- Note/ADF 完整往返；超过旧 8 MiB、100,000 值和 128 层的数据能序列化、水合和提取文本。
- 创建 Note 同时写入 FTS，失败时两者均不存在。
- 正文保存版本恰好递增，旧预期版本返回 `CONTENT_VERSION_CONFLICT`，不存在返回 `ENTITY_NOT_FOUND`。
- 模拟 FTS 写失败时 Note 更新回滚；移动/排序不改变内容版本和 FTS source version。
- NFKC、中文、`Weiß → weiss`、Cherokee、组合字符和 Emoji 的规范化及原文码点映射正确。
- ADF 文本只包含可见文本和固定分隔，不包含 URL、附件字段或 JSON 属性名。
- Folder/Note 混合列表分页稳定并排除回收站记录。

**精确测试命令：**

```powershell
npm run test:unit -- packages/storage-sqlcipher/src/__tests__/notes-index.test.ts --runInBand
```

预期：该测试文件全部通过，0 个失败。

**完成后提交：**

```powershell
git add package-lock.json packages/storage-sqlcipher/package.json packages/storage-sqlcipher/src/native/foldcase.d.ts packages/storage-sqlcipher/src/serialization/adf-json.ts packages/storage-sqlcipher/src/serialization/rows.ts packages/storage-sqlcipher/src/search/adf-text.ts packages/storage-sqlcipher/src/search/normalize.ts packages/storage-sqlcipher/src/search/index-writer.ts packages/storage-sqlcipher/src/repositories/notes.ts packages/storage-sqlcipher/src/repositories/folders.ts packages/storage-sqlcipher/src/types.ts packages/storage-sqlcipher/src/database.ts packages/storage-sqlcipher/src/index.ts packages/storage-sqlcipher/src/__tests__/notes-index.test.ts
git commit -m "feat(storage): persist notes with search index"
```

## 功能模块 6：标签、收藏与不可变历史 Repository

**目标：** 完成组织关系和永久历史持久化，保证无外键条件下两端存在、Vault 一致和历史不可变。

**涉及文件：**

- 创建：`packages/storage-sqlcipher/src/repositories/tags.ts`
- 创建：`packages/storage-sqlcipher/src/repositories/favorites.ts`
- 创建：`packages/storage-sqlcipher/src/repositories/history.ts`
- 修改：`packages/storage-sqlcipher/src/serialization/rows.ts`
- 修改：`packages/storage-sqlcipher/src/types.ts`
- 修改：`packages/storage-sqlcipher/src/database.ts`
- 修改：`packages/storage-sqlcipher/src/index.ts`
- 创建：`packages/storage-sqlcipher/src/__tests__/organization-history.test.ts`

**功能逻辑：**

1. Tag Reader/Writer 支持列表、创建、重命名、删除和 NoteTag 幂等增删；关系写入前验证 Tag、Note 存在、同 Vault且均未处于禁止状态。
2. Favorite Reader/Writer 支持分页、幂等增删和批量排序；收藏目标必须是当前非回收站 Note。
3. History Reader 支持按 Note Keyset 分页和按 ID 获取；Writer 只提供 `insert`，不提供更新。
4. NoteVersion ADF 保存未压缩 JSON、UTF-8 字节长度和 SHA-256。读取时校验长度、哈希并经 Domain `createNoteVersion` 水合；任何不一致返回 `DB_CORRUPT`。
5. 历史恢复在一个事务中插入 Domain 生成的保护版本，再调用 Note `replaceContent` 更新当前正文和 FTS；任一步失败整体回滚。

**关键接口：**

```ts
export interface HistoryReader {
  get(id: NoteVersionId): NoteVersion | undefined;
  listForNote(noteId: NoteId, page: PageRequest): Page<NoteVersion>;
}

export interface HistoryWriter extends HistoryReader {
  insert(version: NoteVersion): void;
  restore(
    version: NoteVersion,
    protectionVersion: NoteVersion,
    restoredNote: Note,
    expectedContentVersion: ContentVersion,
  ): void;
}
```

**单元测试：**

- Tag 和 Favorite CRUD、幂等关系、排序和分页正确。
- 缺失目标、跨 Vault、回收站 Note 和重复业务唯一值被拒绝且不留部分关系。
- USER 与 SYSTEM_PROTECTION 历史未压缩保存，字节长度和 SHA-256 正确。
- 直接篡改历史 JSON、长度或哈希后读取返回 `DB_CORRUPT`。
- 恢复历史同时创建保护版本、递增当前 Note 版本并替换 FTS；任一步失败全部回滚。

**精确测试命令：**

```powershell
npm run test:unit -- packages/storage-sqlcipher/src/__tests__/organization-history.test.ts --runInBand
```

预期：该测试文件全部通过，0 个失败。

**完成后提交：**

```powershell
git add packages/storage-sqlcipher/src/repositories/tags.ts packages/storage-sqlcipher/src/repositories/favorites.ts packages/storage-sqlcipher/src/repositories/history.ts packages/storage-sqlcipher/src/serialization/rows.ts packages/storage-sqlcipher/src/types.ts packages/storage-sqlcipher/src/database.ts packages/storage-sqlcipher/src/index.ts packages/storage-sqlcipher/src/__tests__/organization-history.test.ts
git commit -m "feat(storage): persist organization and history"
```

## 功能模块 7：回收站与领域批量 Plan 原子落库

**目标：** 持久化目录/Note 回收、恢复、到期清理和永久删除，并让领域层生成的复制、移动和关系 Plan 全有或全无。

**涉及文件：**

- 创建：`packages/storage-sqlcipher/src/repositories/trash.ts`
- 创建：`packages/storage-sqlcipher/src/repositories/content-plans.ts`
- 修改：`packages/storage-sqlcipher/src/repositories/folders.ts`
- 修改：`packages/storage-sqlcipher/src/repositories/notes.ts`
- 修改：`packages/storage-sqlcipher/src/repositories/tags.ts`
- 修改：`packages/storage-sqlcipher/src/serialization/rows.ts`
- 修改：`packages/storage-sqlcipher/src/types.ts`
- 修改：`packages/storage-sqlcipher/src/database.ts`
- 修改：`packages/storage-sqlcipher/src/index.ts`
- 创建：`packages/storage-sqlcipher/src/__tests__/trash-plans.test.ts`

**功能逻辑：**

1. `TrashWriter.apply(plan)` 先验证所有 Folder/Note 和 TrashEntry ID，再一次插入全部记录；每个进入回收站的 Note 同事务删除 FTS。
2. 活动目录、Note、标签/收藏目标和搜索查询统一使用回收站排除条件，不能依赖外键或删除原实体。
3. 恢复接受领域层已解析的目标目录和完整 Entries，在一个事务删除 TrashEntry、修改必要父级并恢复 Note FTS。已到期、目标缺失或跨 Vault 整体失败。
4. 永久删除按附件引用、NoteTag、Favorite、NoteVersion、TrashEntry、Note、Folder 的固定顺序执行。删除 Folder 前确认其整棵待删子树都在输入计划中；Root 永不删除。
5. `content-plans.ts` 提供 NoteCopyPlan、FolderTreeCopyPlan 以及批量移动/标签变更的专用写入器。先检查全部 ID、目标与唯一约束，再复用各 Writer 在当前事务提交。

**关键接口：**

```ts
export interface TrashWriter extends TrashReader {
  apply(plan: TrashPlan): void;
  restore(input: TrashRestoreStoragePlan): void;
  deletePermanent(entries: readonly TrashEntry[]): void;
  purgeExpired(entries: readonly TrashEntry[]): void;
}

export interface ContentPlanWriter {
  insertNoteCopy(plan: NoteCopyPlan): void;
  insertFolderTreeCopy(plan: FolderTreeCopyPlan): void;
  applyBatchMove(input: BatchMoveStoragePlan): void;
  applyBatchRelations(input: BatchRelationStoragePlan): void;
}
```

**单元测试：**

- Note 和任意深度 Folder 子树回收一次提交，FTS 对应行删除。
- 恢复原位置和显式新目标正确恢复 FTS；到期、目标无效或部分 Entry 缺失全部回滚。
- 永久删除清理全部已知依赖，不留下 Tag/Favorite/History/Trash 孤儿；Root 和不完整子树拒绝。
- Note/Folder 复制 Plan 同时插入实体、标签、当前附件引用和 FTS，不复制历史、收藏或 Trash。
- 批量移动/加标签/移除标签在第一个和最后一个对象故障时均无部分写入。

**精确测试命令：**

```powershell
npm run test:unit -- packages/storage-sqlcipher/src/__tests__/trash-plans.test.ts --runInBand
```

预期：该测试文件全部通过，0 个失败。

**完成后提交：**

```powershell
git add packages/storage-sqlcipher/src/repositories/trash.ts packages/storage-sqlcipher/src/repositories/content-plans.ts packages/storage-sqlcipher/src/repositories/folders.ts packages/storage-sqlcipher/src/repositories/notes.ts packages/storage-sqlcipher/src/repositories/tags.ts packages/storage-sqlcipher/src/serialization/rows.ts packages/storage-sqlcipher/src/types.ts packages/storage-sqlcipher/src/database.ts packages/storage-sqlcipher/src/index.ts packages/storage-sqlcipher/src/__tests__/trash-plans.test.ts
git commit -m "feat(storage): persist trash and content plans"
```

## 功能模块 8：附件元数据与多态引用 Repository

**目标：** 在 SQLCipher 中安全保存附件领域元数据、32 字节 File Key、版本化 Manifest 和三类引用，不接触数据库外 Blob。

**涉及文件：**

- 创建：`packages/storage-sqlcipher/src/repositories/attachments.ts`
- 修改：`packages/storage-sqlcipher/src/serialization/rows.ts`
- 修改：`packages/storage-sqlcipher/src/types.ts`
- 修改：`packages/storage-sqlcipher/src/database.ts`
- 修改：`packages/storage-sqlcipher/src/index.ts`
- 创建：`packages/storage-sqlcipher/src/__tests__/attachments.test.ts`

**功能逻辑：**

1. 定义存储专用 `StoredAttachment`，组合 Domain `Attachment`、32 字节 File Key、正整数 Manifest 版本和不透明 Manifest `Uint8Array`。
2. 插入和替换前执行 Domain Attachment 水合、Key 长度、Manifest 版本与 1 MiB 最大长度检查；附件正文、真实路径、同步块状态和远端字段不进入接口或表。
3. 每次写入和读取都复制 File Key/Manifest Buffer；返回值修改不得改变数据库内字节。
4. 三类引用分别使用 Note ID、NoteVersion ID、TrashEntry ID，写入前验证恰好一个来源、Attachment 与来源存在且同 Vault。幂等添加不重复，删除精确匹配来源。
5. `mark GC_PENDING` 前查询所有引用并要求为 0；存储层只更新元数据，不删除 Blob 文件。

**关键接口：**

```ts
export interface StoredAttachment {
  readonly attachment: Attachment;
  readonly fileKey: Uint8Array;
  readonly manifestVersion: number;
  readonly manifest: Uint8Array;
}

export interface AttachmentWriter extends AttachmentReader {
  insert(value: StoredAttachment): void;
  replace(value: StoredAttachment): void;
  addReference(reference: AttachmentReference): void;
  removeReference(reference: AttachmentReference): void;
  markGcPending(attachment: Attachment): void;
}
```

**单元测试：**

- Attachment、File Key 和 Manifest 完整往返，返回字节修改不影响后续读取。
- 31/33 字节 Key、0/负版本、超过 1 MiB Manifest 和非法 Domain Attachment 被拒绝。
- Note、NoteVersion、Trash 三类引用幂等增删并拒绝缺失目标、跨 Vault 和多来源。
- 有引用时拒绝 `GC_PENDING`；最后引用删除后允许，且不发生文件系统访问。
- 公开类型和 Schema 不含远端、传输、Chunk 或真实路径字段。

**精确测试命令：**

```powershell
npm run test:unit -- packages/storage-sqlcipher/src/__tests__/attachments.test.ts --runInBand
```

预期：该测试文件全部通过，0 个失败。

**完成后提交：**

```powershell
git add packages/storage-sqlcipher/src/repositories/attachments.ts packages/storage-sqlcipher/src/serialization/rows.ts packages/storage-sqlcipher/src/types.ts packages/storage-sqlcipher/src/database.ts packages/storage-sqlcipher/src/index.ts packages/storage-sqlcipher/src/__tests__/attachments.test.ts
git commit -m "feat(storage): persist attachment metadata"
```

## 功能模块 9：全库与目录子树搜索、摘录高亮和索引重建

**目标：** 完成安全的多语言搜索，对指定目录使用单条递归 CTE，并提供可检测、可回滚的 FTS 健康检查与重建。

**涉及文件：**

- 创建：`packages/storage-sqlcipher/src/search/excerpt.ts`
- 创建：`packages/storage-sqlcipher/src/search/query.ts`
- 创建：`packages/storage-sqlcipher/src/search/health.ts`
- 修改：`packages/storage-sqlcipher/src/search/normalize.ts`
- 修改：`packages/storage-sqlcipher/src/types.ts`
- 修改：`packages/storage-sqlcipher/src/database.ts`
- 修改：`packages/storage-sqlcipher/src/index.ts`
- 创建：`packages/storage-sqlcipher/src/__tests__/search.test.ts`

**功能逻辑：**

1. `SearchScope` 固定为 `VAULT` 或 `FOLDER_SUBTREE(folderId)`。目录范围先验证当前、存在且非回收站；Root 子树等价于全 Vault。
2. 长度至少 3 个规范化码点时，把整个查询编译为转义双引号的 FTS 字面量并参数绑定；1–2 码点使用 `LIKE ? ESCAPE '\'`，依次转义反斜杠、`%` 和 `_`。不接受调用方提供 MATCH 表达式。
3. 目录范围在同一 SQL 使用 `WITH RECURSIVE ... UNION`，将 `folders(parent_id)` 递归结果与 Note/FTS 联结；应用层不预查询子目录 ID。`UNION` 防止损坏环无限重复。
4. 结果返回原始标题和正文摘录。使用规范化映射把命中范围转换为原始 Unicode 码点范围，合并重叠区间，生成不超过 IPC 长度的摘录和有序不重叠高亮。
5. 排序为标题命中、FTS 相关度、`updated_at DESC`、Note ID；Cursor 指纹包含规范化查询、范围和 Folder ID。
6. `checkSearchIndex` 检查活动 Note/FTS 数量、rowid、source version、回收站排除、FTS integrity 和 normalizer version。
7. `rebuildSearchIndex` 在一个事务重建所有活动 Note，最后校验并更新版本；失败回滚旧索引。重建期间设置内部状态，拒绝搜索和 Note 写事务。

**关键接口：**

```ts
export type SearchScope =
  | Readonly<{ kind: 'VAULT' }>
  | Readonly<{ kind: 'FOLDER_SUBTREE'; folderId: FolderId }>;

export interface SearchHit {
  readonly noteId: NoteId;
  readonly title: string;
  readonly excerpt: string;
  readonly updatedAt: Timestamp;
  readonly highlights: readonly Readonly<{
    field: 'title' | 'excerpt';
    start: number;
    end: number;
  }>[];
}

export interface SearchReader {
  query(
    query: string,
    scope: SearchScope,
    page: PageRequest,
  ): Page<SearchHit>;
}
```

**单元测试：**

- 中文、英文、兼容字符、完整折叠、组合字符和 Emoji 查询返回原文与正确码点高亮。
- `AND`、`OR`、`NOT`、引号、星号、反斜杠、`%` 和 `_` 都按字面量，不改变查询语义。
- 1、2、3 码点分流边界正确，空白查询拒绝。
- 指定目录包含自身和任意深度后代，不包含兄弟/祖先；移动目录或 Note 后范围立即变化且无需重建。
- 损坏目录环不会无限执行，目录不存在/回收站返回 `ENTITY_NOT_FOUND`。
- Cursor 不能跨查询或目录范围复用。
- 索引计数、rowid、版本、回收站和 FTS integrity 漂移被发现；重建恢复，注入中途失败后旧索引完整回滚。

**精确测试命令：**

```powershell
npm run test:unit -- packages/storage-sqlcipher/src/__tests__/search.test.ts --runInBand
```

预期：该测试文件全部通过，0 个失败。

**完成后提交：**

```powershell
git add packages/storage-sqlcipher/src/search packages/storage-sqlcipher/src/types.ts packages/storage-sqlcipher/src/database.ts packages/storage-sqlcipher/src/index.ts packages/storage-sqlcipher/src/__tests__/search.test.ts
git commit -m "feat(storage): implement scoped full-text search"
```

## 功能模块 10：无外键完整性扫描与公开 API 收口

**目标：** 系统性发现孤儿、跨 Vault、目录环、损坏序列化和索引漂移，并确保公开入口只暴露稳定领域存储能力。

**涉及文件：**

- 创建：`packages/storage-sqlcipher/src/integrity.ts`
- 修改：`packages/storage-sqlcipher/src/types.ts`
- 修改：`packages/storage-sqlcipher/src/database.ts`
- 修改：`packages/storage-sqlcipher/src/index.ts`
- 创建：`packages/storage-sqlcipher/src/__tests__/integrity.test.ts`
- 修改：`src/__tests__/workspace-resolution.test.ts`

**功能逻辑：**

1. `checkIntegrity()` 先运行 SQLite `integrity_check`，再检查三张元数据单行、当前 Vault、唯一 Root、Folder 父级、目录环、Note Folder、Tag/Favorite/History/Trash/Attachment 引用、UUID/整数/枚举/时间、ADF、历史长度/哈希、File Key、Manifest 和 FTS。
2. 关系检查使用参数化反连接和迭代式目录图遍历，不使用外键诊断。每个问题返回固定 `IntegrityIssueCode`、表和非敏感实体 ID；不返回标题、ADF、文件名、SQL或路径。
3. 检查器只报告，不删除、修复、替换数据库或更新 FTS。`report.ok` 仅在 issues 为空时为 true。
4. `src/index.ts` 只导出创建/打开函数、`VaultDatabase`/Repository/Plan/Search/Integrity 类型、`StorageError` 和必要常量；不导出 native、Schema SQL、迁移注入、测试 helper 或任意 SQL。
5. Workspace 解析测试继续证明包可以通过 `@notera/storage-sqlcipher` 正常解析。

**关键接口：**

```ts
export type IntegrityIssueCode =
  | 'SQLITE_INTEGRITY_FAILED'
  | 'METADATA_INVALID'
  | 'VAULT_MISMATCH'
  | 'ROOT_FOLDER_INVALID'
  | 'FOLDER_PARENT_MISSING'
  | 'FOLDER_CYCLE'
  | 'RELATION_ORPHANED'
  | 'ENTITY_INVALID'
  | 'ADF_INVALID'
  | 'HISTORY_HASH_MISMATCH'
  | 'ATTACHMENT_METADATA_INVALID'
  | 'SEARCH_INDEX_INVALID';

export interface IntegrityReport {
  readonly ok: boolean;
  readonly issues: readonly Readonly<{
    code: IntegrityIssueCode;
    table: string;
    entityId?: string;
  }>[];
}
```

**单元测试：**

- 健康新库和包含每类有效实体的库返回 `ok: true`。
- 测试 helper 逐类注入缺父级、目录环、跨 Vault、Tag/Favorite/History/Trash/Attachment 孤儿、非法 ADF、历史哈希错误和 FTS 漂移，报告精确固定码。
- 多个问题一次完整报告，顺序稳定；报告不含用户正文、标题、文件名、SQL或路径。
- 检查前后数据库内容哈希和行数不变，证明没有自动修复。
- 公开入口不含原生驱动、任意 SQL、Schema SQL、迁移注入和同步字段。
- Workspace 解析、StorageError 类型和关闭后检查行为正确。

**精确测试命令：**

```powershell
npm run test:unit -- packages/storage-sqlcipher/src/__tests__/integrity.test.ts src/__tests__/workspace-resolution.test.ts --runInBand
```

预期：两个测试文件全部通过，0 个失败。

**完成后提交：**

```powershell
git add packages/storage-sqlcipher/src/integrity.ts packages/storage-sqlcipher/src/types.ts packages/storage-sqlcipher/src/database.ts packages/storage-sqlcipher/src/index.ts packages/storage-sqlcipher/src/__tests__/integrity.test.ts src/__tests__/workspace-resolution.test.ts
git commit -m "feat(storage): verify vault integrity"
```

## 最终验证

十个功能模块全部完成并分别提交后，只执行以下一次必要最终验证：

```powershell
npm run test:unit -- packages/storage-sqlcipher/src/__tests__ packages/domain/src/__tests__ src/shared/ipc/__tests__ src/__tests__/workspace-resolution.test.ts src/__tests__/preload.test.ts --runInBand
npm run test:sqlcipher-runtime
npm run typecheck -w @notera/domain
npm run typecheck -w @notera/storage-sqlcipher
npm run typecheck:app
npm run check:deps
npm run lint
npm run build
git diff --check
```

预期结果：

- Storage、Domain ADF、Shared IPC、Workspace 与 Preload 相关测试全部通过，0 个失败；
- Node 和 Electron 原生运行时确认真实加密、错误 Key/普通 SQLite 拒绝与 FTS5 trigram；
- Domain、Storage 和应用 TypeScript 检查通过；
- Dependency Cruiser 显示 0 个违规，Storage 只依赖 Domain 和外部/Node 依赖；
- ESLint 通过；
- Main、Preload 和 Renderer 生产构建通过；
- `git diff --check` 无输出；
- 工作区只保留用户原有且未纳入计划的未跟踪内容。

验证失败时只针对失败原因修复并复测受影响检查；未受影响且已经通过的检查不重复运行。若修复涉及功能逻辑，纳入对应功能模块提交；若仅为最终统一格式或构建适配，在全部必要检查通过后创建一次收尾提交：

```powershell
git add package.json package-lock.json packages/storage-sqlcipher packages/domain/src/adf.ts packages/domain/src/__tests__/primitives.test.ts src/shared/ipc src/__tests__/workspace-resolution.test.ts
git commit -m "style(storage): satisfy final checks"
```

## 完成标准

- 十个完整功能模块各自完成一次提交，不按测试、实现或验证拆分提交；
- 固定本机 SQLCipher 包在 Node 24 和 Electron 42.9.3 中真实运行；
- 正确 32 字节 Key 可读，无 Key、错误 Key和普通 SQLite不可读；
- v1 Schema 不定义或启用外键，迁移框架支持连续逐版本事务；
- Profile、Folder、Note、Tag、Favorite、History、Trash 和 Attachment 元数据 Repository 完整；
- 所有写入只通过同步事务工作单元，批量 Plan 不产生部分成功；
- Note 正文与 FTS5 同事务维护，支持全 Vault 和指定目录完整子树搜索；
- 历史保存未压缩完整 ADF，ADF 不设置字节、JSON 值或深度上限；
- 完整性扫描发现关系、序列化和索引损坏但不自动修复；
- 公开 API 和错误不泄露原生数据库、SQL、路径、Key 或用户内容；
- 不包含同步、Outbox、冲突、云端 API 或远端附件能力；
- 相关单元测试、原生运行时测试和必要最终验证全部通过。
