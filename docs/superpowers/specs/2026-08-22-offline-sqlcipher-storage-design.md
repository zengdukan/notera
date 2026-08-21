# Notera 离线 SQLCipher 存储设计

- 状态：已确认
- 日期：2026-08-22
- 目标模块：`packages/storage-sqlcipher`
- 首发运行时：Windows x64、Electron 42.9.3、Node 24

## 1. 目标与范围

本设计实现 Notera 当前离线阶段完整的 SQLCipher 存储模块，为后续 `attachments`、`application` 和 Electron Main 装配提供稳定的数据访问边界。

本次范围包括：

- 使用真实 SQLCipher Community 创建、打开、验证和关闭加密数据库；
- 当前 Schema 快照、Schema 版本管理和逐版本迁移框架；
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
  schema/               # 当前 Schema 快照和结构检查
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

## 6. Schema v1

首个正式数据库版本为：

```ts
CURRENT_SCHEMA_VERSION = 1;
```

全新数据库直接执行当前 v1 Schema 快照，不重放迁移。

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

当前 Schema 不创建 `sync_outbox`、`sync_state`、`conflicts`、远端附件状态、远端块状态或附件传输状态字段。

## 7. Schema 版本与迁移

打开数据库后按以下顺序处理：

1. 读取并严格验证 `schema_metadata`；
2. 缺失或非法版本的非空数据库返回 `DB_CORRUPT`；
3. 数据库版本高于当前版本时返回 `DB_SCHEMA_TOO_NEW`；
4. 数据库版本较低时，按连续注册表逐版本迁移；
5. 每个目标版本使用独立事务，DDL、回填和校验成功后才更新版本；
6. 当前版本失败时回滚该版本并返回 `MIGRATION_FAILED`，之前已提交版本保持有效；
7. 全部迁移后重新读取并确认最终版本；
8. 验证 Vault ID、根目录 ID 和 `vault.meta` 摘要后开放 Repository。

v1 没有历史生产迁移文件，但迁移注册表、连续性校验和执行器立即建立。测试通过注入测试迁移验证顺序、逐版本提交、失败回滚和断点续迁。

普通 Schema 迁移不得隐式重建 FTS。搜索规范化规则通过 `normalizer_version` 独立管理；规则变化使索引进入 `NEEDS_REBUILD`，不伪装成数据库 Schema 迁移。

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

- 新建数据库直接得到完整 v1 Schema；
- `sqlite_master` 中不存在 `FOREIGN KEY` 或 `REFERENCES`，连接不启用外键；
- 缺失、非法和过高 Schema 版本返回固定错误；
- 测试迁移覆盖注册连续性、顺序、逐版本提交、单版本回滚和断点续迁；
- 新建快照与测试迁移产生的最终结构一致。

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
- v1 Schema、迁移框架、全部离线 Repository 和事务边界可用；
- Schema 不定义或启用外键，关系完整性由 Repository 和检查器保证；
- Note 正文与 FTS 始终在同一事务维护；
- 支持全 Vault 和指定目录完整子树搜索；
- 历史版本保存未压缩完整 ADF；
- ADF 不受固定字节数、JSON 值数量或深度上限约束；
- 错误和公开 API 不泄露 SQL、路径、Key 或用户内容；
- 不包含任何同步、Outbox、冲突、云端或远端附件能力；
- 相关单元测试、原生运行时测试和必要最终验证全部通过。
