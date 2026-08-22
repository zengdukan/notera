# Notera 离线 SQLCipher 存储设计

- 状态：已确认
- 日期：2026-08-22
- 目标模块：`packages/storage-sqlcipher`
- 首发运行时：Windows x64、Electron 42.9.3、Node 24

## 1. 目标与范围

本设计实现 Notera 当前离线阶段完整的 SQLCipher 存储模块，为后续 `attachments`、`application` 和 Electron Main 装配提供稳定的数据访问边界。

本次范围包括：

- 使用真实 SQLCipher Community 创建、打开、验证和关闭加密数据库；
- 不可变 v1 基线、派生 Schema 版本和逐版本迁移框架；
- Profile 元数据、目录、笔记、标签、收藏、历史、回收站和附件元数据 Repository；
- 显式同步事务、批量变更原子提交和乐观并发控制；
- ADF 文本提取、FTS5 trigram 增量维护、全库搜索、指定目录子树搜索和索引重建；
- 无外键条件下的关系验证和完整性检查；
- 真实加密文件、Node 和 Electron 原生运行时测试。

为保持跨层约束一致，本次还允许进行以下直接相关改动：

- `src/shared/ipc/adf.ts`：移除现有 ADF 字节数、JSON 值数量和嵌套深度限制；
- `packages/domain/src/adf.ts`：将 ADF 克隆和验证改为不依赖递归调用栈的迭代式实现；
- `src/shared/ipc/contracts/search.ts`：为搜索请求增加可选的目录子树范围。

当前阶段明确不实现同步协议、同步引擎、云端 API、同步 Outbox、同步冲突、远端附件状态、附件传输状态或 `application/sync`。附件二进制 Blob 的加密和文件系统实现属于后续 `attachments` 子项目。

## 2. 已确认的关键决策

1. 使用官方 SQLCipher Community，而不是 SQLite3 Multiple Ciphers 的兼容模式。
2. 使用本机现有预编译包：

   ```text
   D:\programs\vendor\build\ci-run-32264792724-verify\extracted\dist\notera-sqlcipher-13.0.3-sqlcipher.4.17.0.tgz
   ```

3. 依赖通过上述绝对本机路径引用；当前不解决其他开发机或 CI 的依赖分发。
4. SQLCipher 和 Repository 在 Electron Main 中同步执行，不创建 `worker_threads`。
5. 采用“领域 Repository + 显式事务工作单元”，不采用通用 CRUD 或业务命令网关。
6. Schema 不定义外键，也不执行 `PRAGMA foreign_keys = ON`。
7. 不验证 `PRAGMA cipher_version` 是否属于某个版本范围。
8. 历史版本保存未压缩的完整 ADF JSON 快照。
9. ADF 不设置字节数、JSON 值数量或嵌套深度上限。
10. 指定目录搜索包含该目录及其任意层级子目录，使用单条递归 CTE 动态求取范围。

经实机探测，依赖包元数据为 `@notera/sqlcipher@13.0.3-sqlcipher.4.17.0`，内含 SQLCipher Community 4.17.0、静态 OpenSSL 3.5.7 和针对 Electron 42.9.3 的 Windows x64 N-API 10 二进制。探测已证明它能创建加密数据库、使用 32 字节原始 Key 重新打开、拒绝无 Key 和错误 Key 读取，并支持 FTS5 trigram。该 `.tgz` 的 SHA-256 为：

```text
E417E6E8351B9C79AB34B0614E917C01958ECAB4188B5836334A0DEE3CBE09D8
```

## 3. 模块边界与依赖

`packages/storage-sqlcipher` 是纯 Node 基础设施包，只依赖：

- `@notera/domain`；
- 本机 `@notera/sqlcipher`；
- Node 标准库。

它不依赖 Electron、Renderer、`src/shared`、`packages/crypto`、`packages/attachments` 或 `packages/application`。Electron Main 通过后续 `application` 用例调用该包；Renderer 不能导入该包。

原生包不提供 TypeScript 声明。存储包内部定义最小化的 `SqlcipherDatabase`、`Statement` 和事务适配类型，禁止把原生 `Database`、任意 SQL 执行器、表行结构、数据库路径或 Key 暴露到公开 API。

建议的内部目录结构为：

```text
packages/storage-sqlcipher/src/
  connection/           # 原生适配、连接配置和生命周期
  schema/               # 不可变 v1 基线和结构检查
  migrations/           # 迁移协议、注册表和执行器
  repositories/         # 按领域划分的读写 Repository
  search/               # ADF 提取、规范化、查询和重建
  serialization/        # 行映射、ADF 与附件元数据字节处理
  errors.ts             # 稳定存储错误
  database.ts           # VaultDatabase 与事务工作单元
  index.ts              # 受控公开入口
  __tests__/
```

## 4. 公开 API 与事务模型

公开创建和打开入口为：

```ts
createVaultDatabase(options): VaultDatabase;
openVaultDatabase(options): VaultDatabase;
```

两者接收数据库绝对路径和恰好 32 字节的 `Uint8Array` Database Key。创建入口还接收 Vault ID、根目录 ID、真实 Profile 名称和 `vault.meta` SHA-256 摘要；打开入口接收预期 Vault ID 和 `vault.meta` 摘要用于身份校验。

`VaultDatabase` 公开只读 Repository、维护操作和事务入口：

```ts
interface VaultDatabase {
  readonly profileMetadata: ProfileMetadataReader;
  readonly folders: FolderReader;
  readonly notes: NoteReader;
  readonly tags: TagReader;
  readonly favorites: FavoriteReader;
  readonly history: HistoryReader;
  readonly trash: TrashReader;
  readonly attachments: AttachmentReader;
  readonly search: SearchReader;

  transaction<T>(callback: (tx: VaultTransaction) => T): T;
  checkIntegrity(): IntegrityReport;
  checkSearchIndex(): SearchIndexHealth;
  rebuildSearchIndex(): void;
  close(): void;
}
```

所有写方法只存在于 `VaultTransaction`。事务回调必须同步完成：

- 返回 Promise 或 thenable 时立即报错并回滚；
- 禁止嵌套事务；
- 禁止在事务回调结束后继续使用 `tx` 或其 Repository；
- 禁止在事务内部关闭数据库；
- 回调抛错时整个事务回滚；
- 批量变更不得部分提交。

普通读取、搜索和写入都在 Electron Main 的调用线程同步完成。所有无界列表使用 Keyset Cursor，`limit` 范围固定为 1–100，不使用 `OFFSET`。Cursor 包含查询类型、排序位置、最后 ID 和查询指纹；跨接口、跨查询、跨目录范围或结构非法的 Cursor 返回 `INVALID_CURSOR`。

## 5. 连接与 Key 生命周期

### 5.1 原生依赖

`packages/storage-sqlcipher/package.json` 使用固定绝对路径：

```json
{
  "@notera/sqlcipher": "file:D:/programs/vendor/build/ci-run-32264792724-verify/extracted/dist/notera-sqlcipher-13.0.3-sqlcipher.4.17.0.tgz"
}
```

此选择使当前机器可复现，但其他机器必须提供相同路径。包安装或运行时找不到该依赖时直接失败，不静默改用普通 SQLite。

### 5.2 创建与打开

- `createVaultDatabase` 要求目标数据库不存在；目标父目录必须已经存在。
- `openVaultDatabase` 要求数据库已经存在，并以 `fileMustExist` 模式打开。
- Key 必须是恰好 32 字节的 `Uint8Array`。
- 存储层只在设置 SQLCipher Key 时创建临时字节副本和十六进制表示；临时可变 Buffer 在使用后立即清零。
- 存储层不修改调用方拥有的 Key 数组，也不在属性、日志或错误中保存 Key。
- JavaScript 字符串不可原地清零；实现和安全说明必须明确这一运行时限制。
- Key 必须在读取任何数据库内容前设置。
- 不执行 SQLCipher 主版本范围检查；数据库能否使用由实际 Key 后的 Schema 读取和行为测试决定。

连接随后设置固定 SQLite 运行配置，包括 WAL、`synchronous = FULL`、`secure_delete = ON`、`temp_store = MEMORY` 和固定 busy timeout。Schema 不包含外键声明，连接也不启用外键。

正确设置 Key 后读取固定的 `schema_metadata`。无法读取、结构非法或内容认证失败时关闭连接并返回受控错误。打开既有数据库失败时绝不删除、替换或重建用户文件。

### 5.3 关闭

每个 `VaultDatabase` 只拥有一个原生连接。正常关闭先执行 WAL checkpoint，再关闭句柄；checkpoint 失败时仍必须尝试关闭，并返回不包含路径或 SQL 的受控错误。重复关闭幂等。关闭完成后，所有 Repository、语句和事务引用永久失效。

创建失败时，仅当目标文件在调用前不存在时，才允许清理本次创建的数据库及对应 WAL/SHM；既有数据库在任何失败路径都不得自动删除。

## 6. 不可变 Schema v1 基线

首个正式数据库版本和永久基线版本为：

```ts
BASE_SCHEMA_VERSION = 1;
```

v1 基线保存首次发布时的完整结构和初始数据，发布后不再随 v2、v3 等版本修改。全新数据库先执行 v1 基线，再重放注册表中从 v2 到 `CURRENT_SCHEMA_VERSION` 的连续生产迁移。当前尚无生产迁移，因此 `CURRENT_SCHEMA_VERSION` 仍为 1，新库只执行基线。

### 6.1 元数据

- `schema_metadata`：固定单行，只保存连续整数 `schema_version`。
- `vault_metadata`：固定单行，保存 Vault ID、根目录 ID、真实 Profile 名称、`vault.meta` SHA-256 摘要和必要文件格式信息。
- `search_metadata`：固定单行，保存 `normalizer_version` 和搜索索引状态。

### 6.2 领域表

- `folders`：Folder ID、Vault ID、类型、父目录、名称、排序和时间戳。
- `notes`：本地整数 `row_id` 主键、Note ID、Vault ID、Folder ID、标题、ADF JSON、`content_version`、排序和时间戳。
- `note_versions`：NoteVersion ID、Vault ID、Note ID、类型、保护原因、来源内容版本、标题、未压缩 ADF JSON、ADF 字节长度、SHA-256 和创建时间。
- `tags`：Tag ID、Vault ID、名称和时间戳。
- `note_tags`：Vault ID、Note ID 和 Tag ID。
- `favorites`：Vault ID、Note ID、排序和创建时间。
- `trash_entries`：TrashEntry ID、Vault ID、对象类型、对象 ID、原父目录、删除时间和到期时间。
- `attachments`：Attachment ID、Blob ID、Vault ID、文件名、MIME、字节数、本地状态、32 字节 File Key、Manifest 格式版本、不透明 Manifest BLOB 和时间戳。
- `attachment_references`：Vault ID、Attachment ID、来源类型，以及 Note、NoteVersion、TrashEntry 三个可空来源列。
- `notes_fts`：内容型 FTS5 表；`rowid` 与 `notes.row_id` 相同，字段为 `note_id UNINDEXED`、`source_content_version UNINDEXED`、规范化标题和规范化正文，分词器为 trigram。

附件 Manifest 最大为 1 MiB。该上限只约束数据库内的 Manifest 元数据，不约束附件正文；附件正文仍遵循领域层 100 MiB 上限并保存在数据库外。后续 `attachments` 设计若证明 1 MiB 不足，必须通过正式 Schema 变更明确调整，而不是静默截断。

### 6.3 约束与索引

Schema 不定义任何 `FOREIGN KEY` 或 `REFERENCES`。保留以下数据库级约束：

- `PRIMARY KEY` 和必要的复合 `UNIQUE`；
- UUID 文本、非负安全整数、枚举值和单行元数据的 `CHECK`；
- 根目录字段组合、历史保护原因组合和附件多态引用“恰好一个来源”的 `CHECK`；
- 目录子项、Note 所属目录、最近笔记、标签关系、收藏排序、历史分页、回收站到期和附件引用索引；
- 唯一根目录和必要业务唯一性的部分索引。

每个领域表都保存 Vault ID，但不通过外键关联；Repository 写入检查和完整性检查负责发现跨 Vault 污染。

v1 基线不创建 `sync_outbox`、`sync_state`、`conflicts`、远端附件状态、远端块状态或附件传输状态字段。

## 7. Schema 版本与迁移

数据库结构只有两类事实来源：不可变 v1 基线，以及按目标版本连续、发布后不可变的生产迁移。不存在需要随版本手工更新的“当前完整 Schema 快照”。

打开既有数据库后按以下顺序处理：

1. 读取并严格验证 `schema_metadata`；
2. 缺失或非法版本的非空数据库返回 `DB_CORRUPT`；
3. 数据库版本高于当前版本时返回 `DB_SCHEMA_TOO_NEW`；
4. 数据库版本较低时，按连续注册表逐版本迁移；
5. 每个目标版本使用独立事务，DDL、回填和校验成功后才更新版本；
6. 当前版本失败时回滚该版本并返回 `MIGRATION_FAILED`，之前已提交版本保持有效；
7. 全部迁移后重新读取并确认最终版本；
8. 验证 Vault ID、根目录 ID 和 `vault.meta` 摘要后开放 Repository。

v1 没有历史生产迁移文件，但迁移注册表、连续区间选择、连续性校验和执行器立即建立。`CURRENT_SCHEMA_VERSION` 从注册表最后一个生产迁移的 `targetVersion` 推导；注册表为空时等于 `BASE_SCHEMA_VERSION`。测试通过注入测试迁移验证顺序、逐版本提交、失败回滚和断点续迁。

普通 Schema 迁移不得隐式重建 FTS。搜索规范化规则通过 `normalizer_version` 独立管理；规则变化使索引进入 `NEEDS_REBUILD`，不伪装成数据库 Schema 迁移。

### 7.1 何时递增 Schema 版本

只有持久化数据库结构或数据解释方式发生变化时，才递增 `schema_version`。典型情况包括：

- 新增、删除或重建普通表、列、索引、唯一约束或 `CHECK`；
- 已有列的含义、编码、枚举集合或空值规则改变；
- Repository 读取新版本数据前必须完成一次性数据回填；
- 新代码不能继续安全读取旧结构，需要用迁移建立明确兼容边界。

以下变化不使用普通 Schema 版本：

- 搜索规范化或分词规则变化：递增 `normalizer_version`，把索引标记为 `NEEDS_REBUILD`，再走搜索索引重建；
- SQLCipher 页面、KDF 或数据库文件级格式变化：单独设计 `file_format_version` 升级，不得假装成普通 DDL 迁移；
- 仅 TypeScript 类型重命名、Repository 内部重构或不改变持久化表示的行为调整；
- 同步、Outbox、冲突或远端附件字段：当前离线阶段不纳入 Schema。

版本号必须是从 1 开始的连续安全整数。不能跳过 v2 直接发布 v3，也不能用日期、构建号或应用版本代替 Schema 版本。

### 7.2 基线、迁移和版本文件职责

本节描述未来首次真实升级的开发流程，不表示仓库已经发布 v2；在具体 v2 产品结构获得批准并完成实现前，v1 基线和空生产注册表保持不变。

真实 v2 建议增加一个不可变的版本文件：

```text
packages/storage-sqlcipher/src/
  schema/
    baseline-v1.ts             # 永久只创建首次发布的 v1 基线
  migrations/
    types.ts                   # Migration 协议，不因单个版本变化
    v2.ts                      # 只负责 v1 -> v2
    registry.ts                # 按 targetVersion 连续注册生产迁移
    runner.ts                  # 每版本独立事务、校验和版本提交
  database.ts                  # 新建/打开都选择实际版本之后的迁移区间
  __tests__/
    schema.test.ts             # 不可变 v1 基线、结构和公开边界
    migrations.test.ts         # 空/有数据 v1 -> v2、回滚和续迁
```

各文件的边界固定如下：

- `schema/baseline-v1.ts` 永久只描述 v1 完整结构、元数据和 Root Folder 初始化；发布 v2 后也不得改成 v2；
- `migrations/v2.ts` 只描述从 v1 到 v2 的增量，不包含 v3 预留逻辑，也不创建连接或提交事务；
- `registry.ts` 维护有序生产迁移、连续区间选择和派生的 `CURRENT_SCHEMA_VERSION`，不放任意业务 SQL；
- `runner.ts` 统一负责事务、调用 `validate()`、成功后更新 `schema_metadata` 和安全错误映射；
- `database.ts` 在创建 v1 基线或读取既有版本后，只把该版本之后、应用当前版本之前的连续迁移交给 runner；
- 测试可以构造历史 Schema 或注入测试迁移，但公开包入口不得暴露迁移注入、原生连接或任意 SQL。

现有 `schema/current.ts` 还包含文件格式、搜索规范化和附件 Manifest 上限等常量。重构时不能把所有“当前策略”机械地冻结到基线文件：

- v1 DDL 和创建 v1 所需的历史初始值留在 `baseline-v1.ts`；
- 当前搜索规范化版本继续以 `search/normalize.ts` 为权威；
- 当前文件格式版本放在独立文件格式模块，不随普通 Schema 迁移变化；
- Repository 与完整性检查使用的当前 Manifest 上限放在附件存储职责内；v1 基线 SQL 中的历史 `CHECK` 仍保持原值。

因此“基线不可变”只冻结历史数据库结构和历史初始值，不冻结应用其他可独立演进的当前策略。

已发布的迁移文件是用户数据库历史的一部分。v2 发布后不得改写 `v2.ts` 来迎合 v3；后续变化必须新增 `v3.ts`。

### 7.3 v2 实施顺序

新增 v2 时按以下顺序工作，测试与实现属于同一个完整功能模块：

1. 明确 v2 的结构差异、旧数据回填规则、不可逆变化和验证条件；破坏性变化必须先设计保护版本或其他明确的数据保留策略；
2. 在 `migrations.test.ts` 分别建立空 v1 基线和带代表性数据的真实 v1 历史库，先表达两者升级到 v2 后必须满足的行为；
3. 新建 `migrations/v2.ts`，实现固定 DDL、参数化回填和迁移后验证；
4. 在 `registry.ts` 按顺序注册 v2，使派生的 `CURRENT_SCHEMA_VERSION` 变为 2，并确保只选择适用于实际版本的连续区间；
5. 保持 `baseline-v1.ts` 内容不变；新库创建测试应证明基线完成后会自动重放 v2；
6. 核对空 v1 与带数据 v1 经同一个 `v2.ts` 后得到相同目标结构，并验证旧数据语义；
7. 运行当前模块相关测试和 Storage typecheck，通过后把迁移、注册、创建流程和测试作为同一个功能提交。

不能通过修改 v1 基线让新库跳过 v2。测试必须证明新库和旧库都真实执行同一个生产迁移，并证明失败时没有留下半迁移状态。

### 7.4 v2 迁移文件模板

`migrations/v2.ts` 使用现有 `Migration` 协议。结构模板如下；其中四个私有辅助函数必须在同一文件中实现为真实、固定、可验证的 v2 逻辑，不能把 SQL 或校验回调开放给调用方注入：

```ts
import type { Migration } from './types';

export const migrationToV2: Migration = Object.freeze({
  targetVersion: 2,
  migrate(database) {
    applyV2SchemaDelta(database);
    backfillV2Data(database);
  },
  validate(database) {
    validateV2Structure(database);
    validateV2Data(database);
  },
});
```

`applyV2SchemaDelta()`、`backfillV2Data()`、`validateV2Structure()` 和 `validateV2Data()` 代表版本文件内部的职责边界；真实 `v2.ts` 必须实现这些私有函数，不能保留空函数或常量成功结果。实现还必须遵守以下规则：

- DDL 是仓库内固定字符串，数据值通过绑定参数写入；调用方不能提供表名、列名、SQL 或回调；
- `migrate()` 不调用 `database.transaction()`，不执行 `BEGIN`、`COMMIT`、`ROLLBACK`，也不更新 `schema_metadata`；
- runner 在同一个版本事务内依次调用 `migrate()`、`validate()`，两者都成功后才把版本更新为 2；
- `validate()` 不能只判断“SQL 没报错”，必须查询并确认列、索引、约束以及数据回填结果；
- 不定义或启用外键，不依赖 `PRAGMA foreign_key_check`；关系仍由写入预检查和 `checkIntegrity()` 保证；
- 迁移错误不得包含 SQL、数据库路径、标题、ADF、附件文件名、Key 或绑定值；runner 对外统一返回 `MIGRATION_FAILED`；
- 不在普通 v2 迁移中隐式清空或重建 FTS。若 v2 同时改变 Note 数据，必须明确维持现有 FTS 不变量；规范化规则变化仍走独立重建流程。

SQLite 支持事务化的 DDL 应当与回填一起放在当前版本事务中。不要在迁移中使用 `VACUUM`、切换 `journal_mode` 或执行其他不能满足当前事务语义的操作。

### 7.5 新建数据库重放迁移

`createVaultDatabase()` 创建新文件后执行以下流程：

```text
创建 SQLCipher 连接
-> 在事务中创建 v1 基线、Vault 元数据和 Root Folder
-> 从注册表选择 (BASE_SCHEMA_VERSION, CURRENT_SCHEMA_VERSION] 区间
-> runner 逐版本迁移
-> 重新读取并确认最终版本
-> 验证 Vault ID、Root Folder ID 和 vault.meta 摘要
-> 返回 VaultDatabase
```

当前注册表为空，所以创建流程止于 v1 基线。发布 v2 后，所有新库也先成为合法空 v1，再真实执行 `v2.ts`。这使新库和旧库共享同一条 v2 结构变化路径，不再需要第二份最新 Schema SQL。

基线创建事务和版本迁移事务不嵌套：

- `createVaultDatabase()` 先在一个事务内完整创建 v1；
- 基线提交后，runner 为 v2、v3 等目标版本分别创建独立事务；
- 任一后续版本失败时，创建入口关闭连接并删除本次调用新建的精确 DB/WAL/SHM，因此不会向调用方暴露半创建的新 Profile；
- 既有数据库使用相同 runner，但失败时绝不删除或替换文件。

每个生产迁移必须同时支持“空基线数据库”和“带真实旧数据的数据库”。迁移不能假设至少存在一条 Note、Tag 或 Attachment，也不能因为新库为空而跳过结构验证。

### 7.6 注册迁移和选择连续区间

v2 发布时生产注册表变为：

```ts
import type { Migration } from './types';
import { BASE_SCHEMA_VERSION } from '../schema/baseline-v1';
import { migrationToV2 } from './v2';

export const PRODUCTION_MIGRATIONS: readonly Migration[] = Object.freeze([
  migrationToV2,
]);

export const CURRENT_SCHEMA_VERSION =
  PRODUCTION_MIGRATIONS.at(-1)?.targetVersion ?? BASE_SCHEMA_VERSION;
```

注册表必须按 `targetVersion` 严格升序且没有重复或缺口。`CURRENT_SCHEMA_VERSION` 是迁移历史的派生结果，不再由手工维护的最新快照声明。新建和打开数据库都不能无条件把完整历史数组交给只接受当前迁移区间的 runner；应选择满足以下条件的连续切片：

```text
databaseVersion < migration.targetVersion <= CURRENT_SCHEMA_VERSION
```

因此：

- 新建 v1 基线且应用当前为 v2：执行 `[v2]`；
- 打开既有 v1 且应用当前为 v2：同样执行 `[v2]`；
- 打开 v2 且应用当前为 v2：不执行迁移；
- 将来新建 v1 基线且应用当前为 v3：依次执行 `[v2, v3]`；
- 将来打开既有 v2 且应用当前为 v3：只执行 `[v3]`；
- 打开高于应用当前版本的数据库：在选择迁移前返回 `DB_SCHEMA_TOO_NEW`。

`validateMigrationRegistry()` 继续验证所选区间的数量和目标版本连续性。测试必须覆盖从每个受支持历史版本开始的选择结果，防止 v3 发布后错误地把 `[v2, v3]` 整体交给以 v2 为起点的 runner。

### 7.7 v2 单元测试矩阵

`migrations.test.ts` 至少覆盖以下行为：

1. **成功升级：** 真实 v1 结构和代表性数据升级到 v2，版本恰好变为 2，所有旧数据保持预期语义；
2. **新库重放：** `createVaultDatabase()` 创建 v1 基线后真实执行生产 v2，最终版本和目标结构正确；
3. **空/有数据一致：** 空 v1 和带代表性数据的旧 v1 使用同一个 `v2.ts`，最终结构一致且旧数据语义保留；
4. **结构验证：** v2 新增或改变的列、索引、约束及数据不变量全部存在；
5. **当前步骤回滚：** 在 v2 DDL、回填中段和 `validate()` 分别注入失败，v2 的全部变化回滚，版本仍为 1；
6. **新库清理：** 创建期间 v2 失败后，本次新建的精确 DB/WAL/SHM 被清理；
7. **断点续迁：** 若将来 `[v2, v3]` 中 v3 失败，既有库的 v2 保持已提交；下次打开只从 v3 继续，不重放 v2；
8. **区间选择：** v1→v1 为空、v1→v2 为 `[v2]`、v1→v3 为 `[v2, v3]`、v2→v3 只为 `[v3]`；
9. **注册表拒绝：** 重复、缺口、乱序、错误起点和错误终点返回 `MIGRATION_FAILED`；
10. **数据边界：** 空库、最小数据、代表性旧数据以及可能触发唯一约束或 `CHECK` 的边界值结果明确；
11. **安全失败：** 迁移错误不回显 SQL、路径、Key 或用户内容，打开失败不删除、替换或重建既有数据库；
12. **版本边界：** v2 正常打开且不重放迁移，v3 数据库被 v2 应用以 `DB_SCHEMA_TOO_NEW` 拒绝；
13. **无外键：** v1 基线和全部迁移都不定义或启用外键。

测试夹具直接使用不可变 v1 基线建立真实历史结构。不得调用迁移后结构再把版本号手工改回 1；仅改版本号不能代表真实旧库。

### 7.8 失败、回滚与恢复

runner 对每个目标版本建立独立事务，执行顺序固定为：

```text
确认当前版本 -> migrate() -> validate() -> 更新 schema_metadata -> 提交
```

任一步失败时：

- 回滚当前目标版本的 DDL、回填和版本更新；
- 把错误映射为固定 `MIGRATION_FAILED`；
- 打开既有数据库失败时关闭连接，但不删除数据库、WAL 或 SHM，不替换文件，不自动创建新库；
- 创建新数据库失败时关闭连接，并只删除本次调用前不存在且由本次调用创建的精确 DB/WAL/SHM；
- 已经成功提交的更早版本保持有效，因此下次打开从数据库记录的版本继续；
- 不自动降级。应用版本过旧时只返回 `DB_SCHEMA_TOO_NEW`，不得尝试反向执行迁移。

如果 SQLite 操作不支持所需事务语义，必须重新设计迁移步骤，不能通过迁移外备份后覆盖原文件来绕开 runner。涉及不可逆删除或内容变换的迁移，还必须在该版本设计中明确保护版本、校验摘要或其他可验证的数据保留策略。

### 7.9 精确验证命令和提交范围

实施 v2 期间只运行 Schema/迁移功能模块相关测试：

```powershell
npm run test:unit -- packages/storage-sqlcipher/src/__tests__/schema.test.ts packages/storage-sqlcipher/src/__tests__/migrations.test.ts --runInBand
```

模块完成后按实际修改运行 Storage typecheck；若修改受 lint 约束的文件，再运行对应 lint：

```powershell
npm run typecheck -w @notera/storage-sqlcipher
npx eslint packages/storage-sqlcipher/src/schema packages/storage-sqlcipher/src/migrations packages/storage-sqlcipher/src/database.ts packages/storage-sqlcipher/src/__tests__/schema.test.ts packages/storage-sqlcipher/src/__tests__/migrations.test.ts --ext .ts
git diff --check
```

同一个 v2 功能提交至少包含：

- 新增的 `migrations/v2.ts`；
- `migrations/registry.ts` 的生产注册、派生当前版本与连续区间选择；
- `database.ts` 的新建/打开适用迁移区间调用；
- `schema.test.ts` 的 v1 基线保护，以及 `migrations.test.ts` 的全部 v2 行为测试；
- 真实 v2 设计要求涉及的 Repository 或水合调整。

`schema/baseline-v1.ts` 不应出现在普通 v2 提交中，除非本次工作只是把尚未发布的 `current.ts` 等价重命名为基线。测试、迁移实现、注册和创建流程属于同一个可独立验证的功能模块，只提交一次；不要拆成“测试提交”“迁移提交”和“注册提交”。

### 7.10 常见错误

- **只递增版本号：** 不能代表真实 v1→v2，既没有结构变化，也没有验证旧数据；
- **发布 v2 时修改 v1 基线：** 会让新库绕过真实迁移，并破坏历史夹具；
- **为新库另写 v2 创建 SQL：** 重新引入第二份事实来源，新库与旧库可能分叉；
- **在 `migrate()` 中更新版本号：** 会绕过 runner 的验证后提交规则；
- **迁移自己管理事务：** 会破坏每个目标版本独立回滚和断点续迁；
- **发布后修改 v2：** 已升级用户不会重放，必须新增下一版本迁移；
- **完整注册表不做区间选择：** 从中间版本升级时会因数量或目标版本不匹配而失败；
- **用迁移后结构伪造历史夹具：** 无法发现真实旧结构与新结构的差异；
- **迁移中重建 FTS：** 混淆 Schema 与规范化版本，失败恢复边界不清；
- **添加或启用外键：** 与当前无外键设计冲突，并改变 Repository 和完整性检查的职责；
- **吞掉单行回填错误：** 会提交部分语义错误数据；任何一行不满足规则都应使当前版本整体回滚；
- **在错误中拼接 SQL 或用户数据：** 会破坏存储层的安全错误边界。

## 8. Repository 设计

### 8.1 Profile 元数据

`profileMetadata` 读取和修改真实 Profile 名称，并更新 `vault.meta` 摘要。摘要必须是调用方计算并传入的 32 字节 SHA-256；存储包不读取或解析 `vault.meta` 文件。

### 8.2 目录与笔记

`folders` 支持按 ID、父级和子树读取，以及插入、重命名、移动和批量排序。目录图规则由领域层决定，存储写入前再次验证目标存在、Vault 一致和根目录不可变。

`notes` 支持读取详情、按目录分页、最近列表、创建、移动、复制和正文替换。正文保存使用乐观并发：

```sql
UPDATE notes
SET title = ?, document_json = ?, content_version = ?, updated_at = ?
WHERE note_id = ? AND content_version = ?;
```

影响零行时区分 `ENTITY_NOT_FOUND` 和 `CONTENT_VERSION_CONFLICT`。领域层提供的新版本必须恰好是预期旧版本的下一版本。

正文保存成功后，同一事务按稳定 `row_id` 删除并重建对应 FTS 行。业务代码不能取得绕过 FTS 的正文更新接口。

### 8.3 标签、收藏和历史

`tags`、`note_tags` 和 `favorites` 在写入关系前验证两端存在且属于当前 Vault。历史版本一经创建不可修改；恢复历史由领域层生成保护版本和新当前 Note，存储层在同一事务写入保护版本、替换当前正文并更新 FTS。

历史版本保存未压缩完整 ADF JSON，并保存序列化字节长度和 SHA-256。SQLCipher 保护数据库机密性；SHA-256 只用于发现逻辑损坏，不作为认证或加密机制。

### 8.4 回收站

进入回收站时，Folder 和 Note 原记录保持原层级，`trash_entries` 标记对象状态。活动内容查询排除具有回收站记录的对象。领域层为目录子树生成每个 Folder 和 Note 的完整 Trash Plan；存储层一次写入，并删除所有相关 Note 的 FTS 行。

恢复时删除相应回收站记录、应用领域层确定的目标目录并恢复 Note FTS。永久删除使用专用方法按附件引用、标签关系、收藏、历史、回收站记录和实体的固定顺序处理，不开放单表裸删除。

### 8.5 附件元数据

附件 File Key 以 32 字节 BLOB 保存在 SQLCipher 内。Manifest 以格式版本和不透明 BLOB 保存，由后续 `attachments` 包解释。存储层只复制和持久化字节，不解析分块加密字段；读取时返回新的 `Uint8Array`，避免调用方修改内部内存。

写入 Attachment、引用或本地状态前，Repository 检查目标存在、Vault 一致、File Key 长度、Manifest 版本和 Manifest 大小。附件二进制永不进入 SQLite。

### 8.6 批量计划

批量移动、复制、标签、回收站和附件引用操作接收领域层已经生成并去重的完整 Plan。存储层再次检查目标存在性、Vault 一致性和唯一约束，并在一个事务中提交；任一步失败都整体回滚。

## 9. ADF 序列化

`notes` 和 `note_versions` 均保存未压缩 UTF-8 JSON。项目不再设置 ADF 序列化字节数、JSON 值数量或嵌套深度上限。

仍保留以下有效性约束：

- 根对象必须是 `type: "doc"`、`version: 1`；
- `content` 若存在必须是数组；
- 只允许有限 JSON 数字、字符串、布尔值、`null`、普通数据对象和完整数组；
- 禁止循环引用、访问器属性、Symbol、函数、非有限数字和稀疏数组。

IPC、领域层和存储层的 ADF 遍历、克隆、文本提取和完整性检查都必须使用迭代式算法，不依赖递归调用栈。超大合法 ADF 的实际上限由 V8 内存、Electron IPC、SQLite 和磁盘决定；超大输入可能长时间阻塞 Main 或耗尽资源，系统不再通过固定阈值提前拒绝。

## 10. 搜索设计

### 10.1 文本提取与规范化

存储层提供唯一的 `extractAdfText()` 和 `normalizeSearchText()`：

- 按文档顺序提取文本节点；
- 段落、标题、列表项、表格单元格和代码块之间加入换行；
- `hardBreak` 转换为换行；
- 不索引附件二进制、URL、节点属性或隐藏元数据；
- 执行 NFKC 和完整 Unicode 大小写折叠。

规范化实现维护“规范化字符到原始 Unicode 码点范围”的映射，因为 NFKC 和大小写折叠可能扩展或合并字符。搜索结果必须返回原始标题、原始正文摘录和合法高亮范围，不能展示规范化索引文本。

### 10.2 查询分流

- 规范化查询长度不少于 3 个 Unicode 码点时，使用参数化 FTS5 trigram 字面量查询；
- 长度为 1–2 时，对 FTS 内容列执行参数化 `LIKE`，转义 `%`、`_` 和转义符；
- 空白查询在进入存储层前拒绝；
- 用户输入永远不能成为 FTS 运算符；
- 结果排序优先考虑标题命中和 FTS 相关度，再以更新时间和 Note ID 保证确定性。

回收站 Note 不存在于 FTS，因此不会进入结果。

### 10.3 指定目录子树

搜索范围为：

```ts
type SearchScope =
  | { readonly kind: 'VAULT' }
  | { readonly kind: 'FOLDER_SUBTREE'; readonly folderId: FolderId };
```

`FOLDER_SUBTREE` 包含指定目录及任意层级子目录。目录不存在或已进入回收站时返回 `ENTITY_NOT_FOUND`；根目录子树等价于整个 Vault。

使用一条 SQL 内的递归 CTE 求取目录范围，并与 FTS 命中联结：

```sql
WITH RECURSIVE folder_scope(folder_id) AS (
  SELECT :selected_folder_id
  UNION
  SELECT folders.folder_id
  FROM folders
  JOIN folder_scope ON folders.parent_id = folder_scope.folder_id
)
SELECT notes.note_id
FROM notes_fts
JOIN notes ON notes.row_id = notes_fts.rowid
JOIN folder_scope ON folder_scope.folder_id = notes.folder_id
WHERE notes_fts MATCH :query;
```

`UNION` 用于阻止损坏目录环导致无界重复。应用层不逐层执行 SQL，也不预先加载全部目录 ID。目录或 Note 移动只改变关系列，不需要重建 FTS。搜索 Cursor 指纹包含范围类型和 Folder ID。

`search.query` IPC 请求增加可选 `folderId`；省略时表示整个 Vault，提供时表示该目录子树。

### 10.4 增量维护和重建

以下路径在同一事务内更新 FTS：

- 新建或复制 Note：插入 FTS；
- 保存正文或恢复历史：替换 FTS；
- 进入回收站：删除 FTS；
- 从回收站恢复：重新插入 FTS。

移动、标签、收藏和单纯创建历史不更新 FTS。

`checkSearchIndex()` 检查：

- 活跃 Note 数与 FTS 行数一致；
- `notes.row_id = notes_fts.rowid`；
- `content_version = source_content_version`；
- 不存在回收站 Note 索引；
- FTS5 `integrity-check` 通过；
- `normalizer_version` 为当前版本。

`rebuildSearchIndex()` 在一个事务中清空并重建全部非回收站 Note 的索引，最后执行上述校验并更新规范化版本。失败时回滚，原 Note 和旧索引保持不变。重建成功前禁止搜索和 Note 写事务。

## 11. 无外键完整性策略

所有关系写入在 Repository 中验证：

- 目标实体存在；
- 两端 Vault ID 与当前 `vault_metadata` 一致；
- 对象未处于禁止当前操作的状态；
- 多态附件引用恰好选择一个合法来源；
- 删除按专用依赖顺序执行。

`checkIntegrity()` 还执行：

- SQLite 结构和页完整性检查；
- 元数据单行、Vault ID 和根目录一致性；
- 目录父级存在、唯一根目录和目录图无环；
- Note 所属目录存在；
- 标签、收藏、历史、回收站和附件引用不存在孤儿；
- UUID、整数范围、枚举和时间顺序有效；
- ADF、历史 SHA-256、File Key 和 Manifest 结构有效；
- FTS 与当前非回收站 Note 一致。

完整性检查只报告问题，不自动删除孤儿行、替换数据库或猜测修复。修复工具若有需要，必须单独设计。

## 12. 错误模型

公开 `StorageError` 使用稳定错误码，至少包括：

- `DATABASE_CLOSED`
- `DATABASE_ALREADY_EXISTS`
- `DATABASE_NOT_FOUND`
- `INVALID_DATABASE_KEY`
- `DB_CORRUPT`
- `DB_SCHEMA_TOO_NEW`
- `MIGRATION_FAILED`
- `DISK_FULL`
- `DATABASE_BUSY`
- `CONTENT_VERSION_CONFLICT`
- `ENTITY_NOT_FOUND`
- `INVALID_CURSOR`
- `RELATION_INTEGRITY_VIOLATION`
- `SEARCH_INDEX_UNAVAILABLE`
- `STORAGE_OPERATION_FAILED`

原生错误按 SQLite 错误码映射。错误消息不得包含 SQL、绑定参数、Database Key、ADF 正文、附件字节、Manifest 内容或数据库绝对路径。原生约束错误和 SQLCipher 错误不原样转发给上层。

## 13. 测试与验证

### 13.1 原生运行时

- 本机 `.tgz` 在 Node 24 和 Electron 42.9.3 中加载；
- 32 字节原始 Database Key 创建并重新打开数据库；
- 文件头不是 `SQLite format 3`；
- 无 Key、错误 Key以及 Node 普通 `node:sqlite` 无法读取；
- FTS5 trigram 可以创建和查询；
- 关闭后数据库文件句柄释放。

真实 SQLCipher 验收依据加密文件行为，不依据 `PRAGMA cipher_version` 的版本范围。

### 13.2 Schema 与迁移

- v1 基线发布后保持不可变，当前无迁移时新建数据库得到完整 v1；
- 发布后续版本时，新库和旧库都从各自实际版本重放同一连续生产迁移；
- `sqlite_master` 中不存在 `FOREIGN KEY` 或 `REFERENCES`，连接不启用外键；
- 缺失、非法和过高 Schema 版本返回固定错误；
- 测试迁移覆盖空/有数据基线、区间选择、注册连续性、逐版本提交、单版本回滚和断点续迁；
- 新库迁移失败清理本次新文件，旧库迁移失败不删除或替换文件。

### 13.3 Repository 与事务

- 全部领域实体的写入、读取和重新水合；
- 事务提交、异常回滚、禁止嵌套、禁止异步回调和失效引用；
- 无外键情况下的目标存在、Vault 一致和孤儿检测；
- 正文乐观并发冲突；
- 批量移动、复制、标签、回收站和附件引用全有或全无；
- 分页上限、Cursor 查询和目录范围绑定；
- 关闭后所有操作被拒绝。

### 13.4 搜索

- 中英文、Unicode 兼容字符、完整大小写折叠和 Emoji 高亮；
- FTS 运算符、引号、`%` 和 `_` 只能作为字面量；
- 1–2 字符降级查询；
- 指定目录和任意深度子目录的单条递归 CTE 搜索；
- 目录移动无需重建索引；
- Note 创建、保存、复制、回收和恢复与 FTS 原子一致；
- 索引漂移检测、重建成功和失败回滚。

### 13.5 无 ADF 固定上限

测试明确证明超过原有 8 MiB、100,000 个 JSON 值和 128 层的合法 ADF 不再因为旧阈值被拒绝。IPC 验证、领域克隆、存储序列化和搜索提取不得依赖递归调用栈。

相关验证命令为：

```powershell
npm run test:unit -- packages/storage-sqlcipher/src/__tests__ packages/domain/src/__tests__ src/shared/ipc/__tests__ --runInBand
npm run test:sqlcipher-runtime
npm run typecheck --workspace @notera/storage-sqlcipher
```

实施过程中只运行当前完整功能模块相关的单元测试。所有模块完成后只执行一次必要的最终验证，并按实际改动运行 typecheck、依赖检查、lint 或 build；失败时只修复并复测受影响检查。

## 14. 完成标准

- 真实 SQLCipher 文件只能使用正确 32 字节 Database Key 读取；
- Node 和 Electron 运行时均能加载固定本机原生包；
- 不可变 v1 基线、连续迁移重放、全部离线 Repository 和事务边界可用；
- Schema 不定义或启用外键，关系完整性由 Repository 和检查器保证；
- Note 正文与 FTS 始终在同一事务维护；
- 支持全 Vault 和指定目录完整子树搜索；
- 历史版本保存未压缩完整 ADF；
- ADF 不受固定字节数、JSON 值数量或深度上限约束；
- 错误和公开 API 不泄露 SQL、路径、Key 或用户内容；
- 不包含任何同步、Outbox、冲突、云端或远端附件能力；
- 相关单元测试、原生运行时测试和必要最终验证全部通过。
