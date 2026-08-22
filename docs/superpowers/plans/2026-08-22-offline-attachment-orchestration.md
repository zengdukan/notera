# Notera 离线附件编排实施计划

> **执行要求：** 使用 `superpowers:executing-plans` 在当前会话按功能模块顺序实施。遵守仓库 `AGENTS.md`：不使用子代理或重复审核；每个模块把测试与实现一起完成并提交；所有模块完成后只执行一次必要的最终验证。

**目标：** 在 `@notera/application` 中提供由 `ProfileManager.localAttachments` 暴露的完整离线附件导入、SHA-256 Blob 去重、读取、引用协调、两阶段垃圾回收和解锁恢复能力。

**架构：** Attachment 保存用户可见元数据，AttachmentBlob 保存加密内容、SHA-256、File Key、Manifest 与本地状态，多个 Attachment 可以共享同一 Blob。`LocalAttachmentsService` 是不持有 Session 的稳定 Facade；Application 在 SQLCipher 事务与 `AttachmentStore` 文件操作之间执行补偿和恢复，现有 `LocalNotesService` 通过事务内引用协调器处理复制、历史和回收站。

**技术栈：** TypeScript 5.8、Node.js Crypto/Streams、SQLCipher/SQLite、`@notera/crypto`、Jest 29、ts-jest。

**设计规格：** `docs/superpowers/specs/2026-08-22-offline-attachment-orchestration-design.md`

---

## 范围与实施顺序

本计划包含六个完整、可独立测试的功能模块，必须按依赖顺序实施：

1. Attachment/AttachmentBlob 领域模型与 SQLCipher Schema v4；
2. AttachmentStore 流式明文 SHA-256；
3. Application 附件导入、分页和安全 Reader；
4. 笔记复制与永久历史附件引用；
5. 回收站引用转换、显式移除与两阶段 GC；
6. Profile 解锁对账、Session 集成与公共 API 收口。

测试与实现属于同一个功能模块任务，不拆成“编写失败测试、运行失败测试、编写实现、运行成功测试”等微步骤。实施期间只运行本模块列出的测试；每个模块测试通过后提交一次。第六个模块完成代码后执行一次必要的最终验证，再提交该完整模块。

本计划不实现 Electron Main/Preload Handler、文件选择器、Operation 进度、Media Gateway、Renderer、Atlassian Editor、缩略图、内容嗅探、Markdown/PDF 导出、跨 Vault 去重或任何同步能力，也不创建这些能力的占位接口。

## 实施后的文件职责

```text
packages/domain/src/
  models/attachment.ts                 # Attachment、AttachmentBlob、状态与引用模型
  operations/attachments.ts            # 引用复制/转换与 Blob GC 纯规则
  operations/copy.ts                   # Note/Folder 复制继续携带真实附件引用
  index.ts                             # 导出规范化附件领域 API
  __tests__/attachments.test.ts        # Blob、Attachment、引用与 GC 规则
  __tests__/content-operations.test.ts # Note/Folder 复制附件引用回归

packages/attachments/src/
  importer.ts                          # 单遍流式加密并计算明文 SHA-256
  types.ts                             # ImportedBlob 增加 contentSha256
  __tests__/import.test.ts             # 已知摘要、切片不变性和失败边界

packages/storage-sqlcipher/src/
  schema/v4.ts                         # v3 → v4 Attachment/Blob 规范化迁移
  migrations/registry.ts               # 注册连续 Schema v4
  types.ts                             # AttachmentBlob、分页、引用和 GC 端口
  repositories/attachment-blobs.ts     # Blob 水合、SHA 查询、状态与敏感字段写入
  repositories/attachments.ts          # Attachment、分页、引用和归零清理
  repositories/content-plans.ts        # 复制计划原子写入引用
  database.ts                          # 装配新的 Attachment Repository
  integrity.ts                         # v4 Blob、Attachment 和引用完整性
  index.ts                             # 导出新增安全 Storage 类型
  __tests__/attachments.test.ts        # Blob 去重、分页、引用、GC 与防御性复制
  __tests__/migrations.test.ts         # 连续 v4 与旧附件数据迁移
  __tests__/schema.test.ts             # 当前 Schema v4 表、列、索引和公开面
  __tests__/integrity.test.ts          # Blob/Attachment/引用损坏检测

packages/application/src/
  manager.ts                           # 创建稳定 localAttachments 并在解锁时恢复
  session.ts                           # 继续提供 database、attachments 与取消信号
  types.ts                             # ProfileManager.localAttachments
  errors.ts                            # 稳定附件业务错误与安全消息
  index.ts                             # 导出附件 Service、Reader、DTO 和报告
  local-attachments/
    types.ts                           # Application 安全 DTO 与公共接口
    validation.ts                      # ID、文件名、MIME、分页和 source 校验
    mapping.ts                         # Domain/Storage 到安全摘要的纯映射
    errors.ts                          # Domain/Storage/Blob 错误的稳定映射
    import.ts                          # 候选 Blob、SHA 去重、事务与失败补偿
    reader.ts                          # Session 绑定 Reader 与缺失/损坏状态更新
    references.ts                      # 复制、历史和回收站引用计划
    gc.ts                              # Attachment 归零、Blob GC 和元数据终结
    recovery.ts                        # 解锁 inventory 对账、孤儿和遗留 GC
    service.ts                         # 不持有 Session 的稳定 Facade
  local-notes/
    service.ts                         # 需要物理 GC 的用例使用完整 SessionResources
    notes.ts                           # Note 复制读取当前附件引用
    history.ts                         # 历史快照、恢复和复制引用
    trash.ts                           # 删除组引用转换、清理和 GC 候选
    batch.ts                           # 批量复制和批量回收引用
  __tests__/
    local-attachments-import.test.ts
    local-attachments-reader.test.ts
    local-attachments-lifecycle.test.ts
    local-attachments-gc-recovery.test.ts
    local-notes-notes.test.ts
    local-notes-history.test.ts
    local-notes-trash.test.ts
    local-notes-batch.test.ts
    local-notes-search-session.test.ts
    manager.integration.test.ts
```

---

## 功能模块 1：Attachment/AttachmentBlob 领域模型与 SQLCipher Schema v4

**目标与功能逻辑**

把当前同时承载用户元数据和密文元数据的 `Attachment` 拆为 `Attachment` 与 `AttachmentBlob`，发布不可修改的 Schema v4，并提供后续 Application 所需的窄 Storage 端口。本模块完成后，数据库可以保存多个 Attachment 指向同一个 Blob，可以只按当前 Vault 的 SHA-256 查询 READY Blob，并能原子维护引用和两级归零状态。

新的 `Attachment` 只保存 ID、Blob ID、Vault ID、文件名、MIME 和创建时间。`AttachmentBlob` 保存 Blob ID、Vault ID、可空的 32 字节 `contentSha256`、明文长度、本地状态和创建/更新时间。`IMPORTING` 只为 v3 迁移与防御性恢复保留；后续新导入直接提交 READY Blob。领域构造函数必须去除文件名/MIME 首尾空白、防御性复制摘要并冻结返回对象。

领域附件操作保留现有按 Attachment 统计引用的规则，并新增：把当前 Note 引用复制到目标 Note 或 NoteVersion；把 NOTE 引用与 TrashEntry 映射互转；只有 Attachment 无任何引用时才能删除；只有 Blob 已无任何 Attachment 时才能转为 `GC_PENDING`。这些函数只返回不可变计划，不访问数据库或文件系统。

Schema v4 在单个 SQLCipher 事务中创建 `attachment_blobs_v4` 和 `attachments_v4`，把每条 v3 Attachment 的 Blob 字段迁入一条 Blob 记录并令 `content_sha256 = NULL`，再保留原 Attachment ID、文件名、MIME 和全部 `attachment_references`。校验完成后替换旧表并创建：

```sql
CREATE UNIQUE INDEX attachment_blobs_ready_sha256
ON attachment_blobs(vault_id, content_sha256)
WHERE content_sha256 IS NOT NULL AND local_state = 'READY';

CREATE INDEX attachments_blob
ON attachments(vault_id, blob_id, id);
```

v1、v2、v3 文件不得修改。`PRODUCTION_MIGRATIONS` 追加 `V4_NORMALIZED_ATTACHMENT_BLOBS`，`CURRENT_SCHEMA_VERSION` 变为 4。迁移校验必须确认表、列、CHECK、索引、迁移后行数与引用归属；迁移失败整体回滚且旧 Schema 仍为 v3。

Storage 端口集中定义为：

```ts
interface StoredAttachmentBlob {
  readonly blob: AttachmentBlob;
  readonly fileKey: Uint8Array;
  readonly manifestVersion: number;
  readonly manifest: Uint8Array;
}

interface StoredAttachmentContent {
  readonly attachment: Attachment;
  readonly storedBlob: StoredAttachmentBlob;
}

interface AttachmentReader {
  getAttachment(id: AttachmentId): Attachment | undefined;
  getBlob(id: BlobId): StoredAttachmentBlob | undefined;
  getContent(id: AttachmentId): StoredAttachmentContent | undefined;
  findReadyBlobBySha256(value: Uint8Array): StoredAttachmentBlob | undefined;
  listForNote(noteId: NoteId, page: PageRequest): Page<AttachmentListItem>;
  listReferencesForNotes(ids: readonly NoteId[]): readonly CurrentNoteAttachmentReference[];
  listReferencesForVersions(ids: readonly NoteVersionId[]): readonly NoteVersionAttachmentReference[];
  listReferencesForTrashEntries(ids: readonly TrashEntryId[]): readonly TrashAttachmentReference[];
  listReferencesForAttachments(ids: readonly AttachmentId[]): readonly AttachmentReference[];
  listAllBlobs(): readonly AttachmentBlob[];
  listGcPendingBlobs(): readonly AttachmentBlob[];
}

interface AttachmentWriter extends AttachmentReader {
  insertBlob(value: StoredAttachmentBlob): void;
  insertAttachment(value: Attachment): void;
  replaceBlob(value: StoredAttachmentBlob): void;
  addReferences(values: readonly AttachmentReference[]): void;
  removeReferences(values: readonly AttachmentReference[]): void;
  replaceNoteReferences(noteId: NoteId, values: readonly CurrentNoteAttachmentReference[]): void;
  deleteUnreferencedAttachments(ids: readonly AttachmentId[], now: Timestamp): readonly BlobId[];
  finalizeGc(blobId: BlobId): void;
}
```

`findReadyBlobBySha256()` 只使用 SHA-256，不比较文件名、MIME 或字节数。Repository 水合任何异常摘要、状态、File Key、Manifest、Vault 归属或 Attachment→Blob 关系时返回 `DB_CORRUPT`；写入无效对象返回稳定 Storage 错误。File Key、Manifest 和 SHA-256 每次读写均使用防御性副本。

`listForNote()` 使用 `created_at DESC, attachment_id DESC` Keyset Cursor，Cursor 绑定 Note ID。引用批量查询对空输入返回空冻结数组，对重复 ID 先去重，不拼接未经验证的 SQL 标识符。`deleteUnreferencedAttachments()` 只删除确实没有 NOTE、NOTE_VERSION 或 TRASH 引用的 Attachment，再把没有剩余 Attachment 的 Blob 标为 `GC_PENDING` 并返回稳定去重的 Blob ID。

**涉及文件**

- 修改：`packages/domain/src/models/attachment.ts`
- 修改：`packages/domain/src/operations/attachments.ts`
- 按新模型调整：`packages/domain/src/operations/copy.ts`
- 修改：`packages/domain/src/index.ts`
- 修改测试：`packages/domain/src/__tests__/attachments.test.ts`
- 修改测试：`packages/domain/src/__tests__/content-operations.test.ts`
- 新建：`packages/storage-sqlcipher/src/schema/v4.ts`
- 修改：`packages/storage-sqlcipher/src/migrations/registry.ts`
- 修改：`packages/storage-sqlcipher/src/types.ts`
- 新建：`packages/storage-sqlcipher/src/repositories/attachment-blobs.ts`
- 重构：`packages/storage-sqlcipher/src/repositories/attachments.ts`
- 修改：`packages/storage-sqlcipher/src/repositories/content-plans.ts`
- 修改：`packages/storage-sqlcipher/src/database.ts`
- 修改：`packages/storage-sqlcipher/src/integrity.ts`
- 修改：`packages/storage-sqlcipher/src/index.ts`
- 修改测试：`packages/storage-sqlcipher/src/__tests__/attachments.test.ts`
- 修改测试：`packages/storage-sqlcipher/src/__tests__/migrations.test.ts`
- 修改测试：`packages/storage-sqlcipher/src/__tests__/schema.test.ts`
- 修改测试：`packages/storage-sqlcipher/src/__tests__/integrity.test.ts`

**单元测试、迁移测试与断言**

- `createAttachmentBlob()` 接受缺失摘要的迁移记录或恰好 32 字节的新摘要，拒绝其他长度，并防御性复制输入；
- 两个文件名相同或不同的 Attachment 都可以指向同一 Blob；Attachment 引用仍按 Attachment ID 独立；
- Blob 尚有任意 Attachment 时拒绝 `GC_PENDING`，最后一个 Attachment 删除后允许；
- v3 → v4 保持 Attachment ID、Blob ID、File Key、Manifest、状态、时间和全部三类引用，摘要为 `NULL`；
- 新建数据库最终直接达到与逐版本迁移相同的 v4 结构；`CURRENT_SCHEMA_VERSION === 4`；
- 同一 Vault 不能存在两个 SHA-256 相同的 READY Blob，不同 Vault、空摘要或非 READY 状态不受该唯一索引冲突；
- `findReadyBlobBySha256()` 不读取或比较长度字段；分页重复/遗漏为零，错误 Cursor 返回 `INVALID_CURSOR`；
- Attachment、Blob、引用跨 Vault、悬空、摘要长度错误、敏感字段错误均被完整性检查报告；
- 读取返回值被调用方清零或修改后，再次读取仍得到原始摘要、File Key 和 Manifest。

**本模块相关测试命令**

```powershell
npm test -- --runInBand --runTestsByPath packages/domain/src/__tests__/attachments.test.ts packages/domain/src/__tests__/content-operations.test.ts packages/storage-sqlcipher/src/__tests__/attachments.test.ts packages/storage-sqlcipher/src/__tests__/migrations.test.ts packages/storage-sqlcipher/src/__tests__/schema.test.ts packages/storage-sqlcipher/src/__tests__/integrity.test.ts
```

预期：6 个测试文件全部通过，0 个失败；不运行其他包测试、全量 lint、全量 typecheck 或 build。

**完成后的提交**

```powershell
git add -- packages/domain/src/models/attachment.ts packages/domain/src/operations/attachments.ts packages/domain/src/operations/copy.ts packages/domain/src/index.ts packages/domain/src/__tests__/attachments.test.ts packages/domain/src/__tests__/content-operations.test.ts packages/storage-sqlcipher/src/schema/v4.ts packages/storage-sqlcipher/src/migrations/registry.ts packages/storage-sqlcipher/src/types.ts packages/storage-sqlcipher/src/repositories/attachment-blobs.ts packages/storage-sqlcipher/src/repositories/attachments.ts packages/storage-sqlcipher/src/repositories/content-plans.ts packages/storage-sqlcipher/src/database.ts packages/storage-sqlcipher/src/integrity.ts packages/storage-sqlcipher/src/index.ts packages/storage-sqlcipher/src/__tests__/attachments.test.ts packages/storage-sqlcipher/src/__tests__/migrations.test.ts packages/storage-sqlcipher/src/__tests__/schema.test.ts packages/storage-sqlcipher/src/__tests__/integrity.test.ts
git commit -m "feat(storage): normalize attachment blob records"
```

---

## 功能模块 2：AttachmentStore 流式明文 SHA-256

**目标与功能逻辑**

让 `@notera/attachments` 在现有单遍流式导入中计算完整明文 SHA-256，为 Application 去重提供可信内容身份，同时不改变随机 Blob ID、随机 File Key、5 MiB 分块、AEAD、Manifest、原子发布、取消和大小限制语义。

`ImportedBlob` 增加防御性字节数组：

```ts
interface ImportedBlob {
  readonly blobId: BlobId;
  readonly fileKey: Uint8Array;
  readonly manifestVersion: 1;
  readonly manifest: Uint8Array;
  readonly plaintextLength: number;
  readonly contentSha256: Uint8Array;
}
```

`importEncryptedBlob()` 在开始读取后创建 Node `createHash('sha256')`，对源流交付的每段有效明文字节按原顺序调用 `hash.update()`；空块不改变摘要。只有大小校验、全部分块加密、Manifest 编码、文件同步和原子重命名全部成功后才调用 `digest()` 并返回 32 字节副本。失败、取消、源流异常或超限路径只执行既有 staging/句柄/File Key 收尾，不返回或记录半成品摘要。

SHA-256 不加入 Manifest、密文文件名、AAD、错误或日志；Manifest 仍只包含密文块哈希。重复内容仍使用不同 File Key、Nonce 和 Blob ID，因此密文不同，去重只能由后续 Application 使用受 SQLCipher 保护的明文摘要完成。

**涉及文件**

- 修改：`packages/attachments/src/types.ts`
- 修改：`packages/attachments/src/importer.ts`
- 修改测试：`packages/attachments/src/__tests__/import.test.ts`
- 按断言辅助需要修改：`packages/attachments/src/__tests__/helpers.ts`

**单元测试与断言**

- 空文件摘要等于 SHA-256 空输入已知向量；
- 单块、恰好 5 MiB、跨块和不同输入切片方式得到同一正确摘要；
- 相同内容两次导入的 `contentSha256` 相同，但 Blob ID、File Key、Manifest Nonce 与密文不同；
- 返回摘要被修改后不影响 Store 内部状态或后续导入；
- 超过 100 MiB、取消、源流抛错和磁盘失败不留下最终 Blob 或 staging，也不在错误中出现摘要；
- 原有解密回读仍与输入逐字节一致，证明摘要更新没有消费、重排或缓存源流。

**本模块相关测试命令**

```powershell
npm test -- --runInBand --runTestsByPath packages/attachments/src/__tests__/import.test.ts packages/attachments/src/__tests__/manifest.test.ts packages/attachments/src/__tests__/recovery.test.ts
```

预期：3 个测试文件全部通过，0 个失败；不运行其他包测试、全量 lint、全量 typecheck 或 build。

**完成后的提交**

```powershell
git add -- packages/attachments/src/types.ts packages/attachments/src/importer.ts packages/attachments/src/__tests__/import.test.ts packages/attachments/src/__tests__/helpers.ts
git commit -m "feat(attachments): hash plaintext blobs while importing"
```

---

## 功能模块 3：Application 附件导入、分页和安全 Reader

**目标与功能逻辑**

建立稳定的 `ProfileManager.localAttachments` Facade，实现导入、按 Note 分页和安全 Reader。Facade 不持有 Session；每次调用通过 `getSession()` 进入当前 `ProfileSession.run()`，因此锁定、切换和关闭后旧对象不能访问旧 Vault。本模块只实现导入、列表和读取，显式移除与 GC 在模块 5 增加，不创建未实现方法。

公共类型初始形状为：

```ts
interface LocalAttachmentsService {
  importAttachment(input: ImportAttachmentInput): Promise<AttachmentSummary>;
  listForNote(input: ListAttachmentsForNoteInput): Promise<Page<AttachmentSummary>>;
  openReader(attachmentId: AttachmentId): Promise<AttachmentContentReader>;
}

interface AttachmentContentReader {
  readonly attachmentId: AttachmentId;
  readonly fileName: string;
  readonly mimeType: string;
  readonly byteLength: number;
  stream(): AsyncIterable<Uint8Array>;
  streamRange(start: number, endExclusive: number): AsyncIterable<Uint8Array>;
  close(): Promise<void>;
}
```

输入验证不依赖 IPC：Note/Attachment ID 使用 Domain normalizer；文件名和 MIME 去首尾空白后为 1–255 Unicode 字符；分页使用 Application 现有上限；`source` 必须实现 `Symbol.asyncIterator`。Application 不接受真实路径或调用方声明的长度。

导入流程在 `ProfileSession.run()` 内：先确认 Note 存在且不在回收站；组合 Session 与调用方 AbortSignal；调用 `attachments.importBlob()` 获得候选 Blob；再在一个 SQLCipher 事务内按 SHA-256 查 READY Blob。命中时只插入本次新 Attachment 和 NOTE 引用；未命中时先插入候选 AttachmentBlob，再插入 Attachment 和引用。每次调用必须生成新 Attachment ID。

事务提交后，命中旧 Blob 时删除本次候选 Blob。事务失败时同样尽力删除候选 Blob；补偿失败不覆盖原始业务错误，孤儿留给模块 6。数据库提交是业务提交点，提交后的迟到取消返回成功。所有路径在 `finally` 中清零 Application 持有的候选 File Key 和 SHA-256 副本。

并发唯一索引竞争映射为一次有限重试：第一次事务因 READY SHA 唯一约束失败后重新查询获胜 Blob，并提交相同新 Attachment ID 与引用；不得无限重试或创建第二个 READY Blob。

`listForNote()` 先确认 Note 有效，再映射 Storage Page。READY 映射为 `AVAILABLE`；MISSING、CORRUPT 原样映射；IMPORTING/GC_PENDING 仍被 Note 引用时视为数据库完整性错误。摘要只包含 Shared 合约已有字段。`previewable` 使用集中白名单，至少排除 SVG、HTML 和未知主动内容。

`openReader()` 读取 Attachment 与 StoredAttachmentBlob，确认 Attachment 仍有有效引用且 Blob 为 READY，再调用底层 `openReader()`。Application Reader 不公开 Blob ID、File Key、Manifest、摘要或路径；底层 Reader 建立后立即清零本地敏感副本。包装流捕获 BLOB_MISSING/BLOB_CORRUPT，并在条件事务中把仍是同一 Blob 的状态更新为 MISSING/CORRUPT；状态更新失败不覆盖首个读取错误。`close()` 幂等释放租约。

附件错误映射新增稳定 Application 错误与固定安全消息：`ATTACHMENT_TOO_LARGE`、`ATTACHMENT_IMPORT_FAILED`、`BLOB_MISSING`、`BLOB_CORRUPT`。用户 AbortSignal 取消作为内部取消结果保留给下一阶段 Main 映射 Operation CANCELLED；Session 关闭导致的中止映射 `PROFILE_LOCKED`。任何映射不拼接下层消息。

**涉及文件**

- 新建：`packages/application/src/local-attachments/types.ts`
- 新建：`packages/application/src/local-attachments/validation.ts`
- 新建：`packages/application/src/local-attachments/mapping.ts`
- 新建：`packages/application/src/local-attachments/errors.ts`
- 新建：`packages/application/src/local-attachments/import.ts`
- 新建：`packages/application/src/local-attachments/reader.ts`
- 新建：`packages/application/src/local-attachments/service.ts`
- 修改：`packages/application/src/manager.ts`
- 修改：`packages/application/src/types.ts`
- 修改：`packages/application/src/errors.ts`
- 修改：`packages/application/src/index.ts`
- 新建测试：`packages/application/src/__tests__/local-attachments-import.test.ts`
- 新建测试：`packages/application/src/__tests__/local-attachments-reader.test.ts`
- 按共享夹具需要修改：`packages/application/src/__tests__/helpers.ts`
- 修改 Session 公共面测试：`packages/application/src/__tests__/local-notes-search-session.test.ts`

**单元测试、集成测试与断言**

- `manager.localAttachments` 引用在锁定/解锁/切换期间保持稳定，且对象本身不含 Session 或资源；
- 同一内容导入两次返回两个不同 Attachment ID，目标 Note 列表出现两项，但 Storage 只有一个 READY Blob，候选 Blob 被删除；
- 同名、异名、同 MIME、异 MIME 都只按 SHA-256 复用 Blob；v3 迁移的空摘要 Blob 不参与去重；
- 不同内容创建不同 Blob；并发相同内容由有限重试收敛为一个 READY Blob；
- Note 缺失、回收站 Note、空名称、超长名称、无效 source、超限、取消、磁盘不足和数据库失败均为稳定安全错误；
- 数据库提交失败清理候选，补偿失败保留原始错误；提交后迟到取消仍成功；
- 调用方修改返回 DTO、摘要夹具或 Reader 输出不能改变数据库敏感字段；
- 列表排序、Cursor 绑定、MISSING/CORRUPT 映射和 previewable 白名单正确；
- Reader 完整流和 Range 流逐字节正确，缺失/损坏更新状态，活跃 Reader 持有租约，`close()` 幂等；
- 错误对象和测试日志快照不含文件名、MIME、SHA-256、路径、Note/Attachment/Blob ID、File Key 或 Manifest。

**本模块相关测试命令**

```powershell
npm test -- --runInBand --runTestsByPath packages/application/src/__tests__/local-attachments-import.test.ts packages/application/src/__tests__/local-attachments-reader.test.ts packages/application/src/__tests__/local-notes-search-session.test.ts packages/attachments/src/__tests__/import.test.ts packages/attachments/src/__tests__/reader.test.ts packages/storage-sqlcipher/src/__tests__/attachments.test.ts
```

预期：6 个测试文件全部通过，0 个失败；不运行其他 Application 用例、全量 lint、全量 typecheck 或 build。

**完成后的提交**

```powershell
git add -- packages/application/src/local-attachments packages/application/src/manager.ts packages/application/src/types.ts packages/application/src/errors.ts packages/application/src/index.ts packages/application/src/__tests__/local-attachments-import.test.ts packages/application/src/__tests__/local-attachments-reader.test.ts packages/application/src/__tests__/helpers.ts packages/application/src/__tests__/local-notes-search-session.test.ts
git commit -m "feat(application): import and read local attachments"
```

---

## 功能模块 4：笔记复制与永久历史附件引用

**目标与功能逻辑**

移除本地笔记用例中临时传入空附件引用集合的行为，使单篇复制、目录树复制、批量复制、用户永久历史、保护历史、历史恢复和历史复制都在原有 SQLCipher 事务中维护真实附件引用。本模块不进行物理 Blob 操作，也不改变 `saveDraft`、标签、收藏、移动或搜索。

新建 `AttachmentReferenceCoordinator` 纯 Application 边界，输入 Storage Reader 快照并使用 Domain 构造函数生成：

```ts
interface ReferenceReplacement {
  readonly remove: readonly AttachmentReference[];
  readonly add: readonly AttachmentReference[];
}

copyNotes(sourceNoteIds, targetNoteIdMap): readonly CurrentNoteAttachmentReference[];
snapshotNote(noteId, versionId): readonly NoteVersionAttachmentReference[];
restoreVersion(noteId, versionId, protectionVersionId): ReferenceReplacement;
copyVersion(versionId, targetNoteId): readonly CurrentNoteAttachmentReference[];
```

单篇复制在构造 `copyNote()` 前读取源 Note 当前引用并传入；目录树和批量复制一次批量读取全部源 Note 引用，再由现有 noteIdMap 映射，禁止逐 Note 查询造成 N+1。`ContentPlanRepository` 继续在 Note、标签和引用全部校验后原子插入。

创建永久用户版本时，在同一事务先插入 Version，再添加从当前 NOTE 引用快照出的 NOTE_VERSION 引用。历史恢复读取当前 Note 引用和目标 Version 引用：保护版本获得恢复前当前引用；当前 Note 引用被完整替换为目标 Version 引用；目标历史引用保持不变。Note、保护版本、FTS、内容版本与引用必须在同一事务成功或回滚。

历史复制只使用目标 Version 的 NOTE_VERSION 引用映射到新 Note，不使用源 Note 当前引用。历史重命名、比较和普通 `saveDraft` 不读写附件关系；ADF 继续不是引用来源。

**涉及文件**

- 新建：`packages/application/src/local-attachments/references.ts`
- 修改：`packages/application/src/local-notes/notes.ts`
- 修改：`packages/application/src/local-notes/history.ts`
- 修改：`packages/application/src/local-notes/batch.ts`
- 按窄接口需要修改：`packages/storage-sqlcipher/src/repositories/content-plans.ts`
- 按窄接口需要修改：`packages/storage-sqlcipher/src/types.ts`
- 新建测试：`packages/application/src/__tests__/local-attachments-lifecycle.test.ts`
- 修改测试：`packages/application/src/__tests__/local-notes-notes.test.ts`
- 修改测试：`packages/application/src/__tests__/local-notes-history.test.ts`
- 修改测试：`packages/application/src/__tests__/local-notes-batch.test.ts`
- 修改 Storage 事务测试：`packages/storage-sqlcipher/src/__tests__/attachments.test.ts`

**单元测试与集成断言**

- 单篇 Note 复制保留全部当前 Attachment，目标引用使用新 Note ID，源引用不变；
- Folder Tree 与批量复制保持每篇 Note 的附件集合，不交叉、不遗漏、不创建新 Attachment/Blob；
- 同一 Attachment 被源 Note 多次业务选择时，唯一引用约束仍只创建一个目标关系；
- 用户永久历史保存创建当时的引用快照，后续当前 Note 移除不会改变历史；
- 恢复前保护版本引用恢复前集合，恢复后当前 Note 引用等于目标 Version 集合，目标 Version 引用仍存在；
- 从历史复制使用该 Version 集合，即使源 Note 当前集合已经不同；
- 任一 Attachment 缺失、跨 Vault 或事务注入失败时，Note、标签、Version、FTS 和引用全部回滚；
- `saveDraft` 修改包含或删除 Media 节点的 ADF 时，引用表保持不变，证明引用不由 ADF 推导。

**本模块相关测试命令**

```powershell
npm test -- --runInBand --runTestsByPath packages/application/src/__tests__/local-attachments-lifecycle.test.ts packages/application/src/__tests__/local-notes-notes.test.ts packages/application/src/__tests__/local-notes-history.test.ts packages/application/src/__tests__/local-notes-batch.test.ts packages/domain/src/__tests__/content-operations.test.ts packages/storage-sqlcipher/src/__tests__/attachments.test.ts packages/storage-sqlcipher/src/__tests__/organization-history.test.ts
```

预期：7 个测试文件全部通过，0 个失败；不运行回收站、GC、全量 lint、全量 typecheck 或 build。

**完成后的提交**

```powershell
git add -- packages/application/src/local-attachments/references.ts packages/application/src/local-notes/notes.ts packages/application/src/local-notes/history.ts packages/application/src/local-notes/batch.ts packages/application/src/__tests__/local-attachments-lifecycle.test.ts packages/application/src/__tests__/local-notes-notes.test.ts packages/application/src/__tests__/local-notes-history.test.ts packages/application/src/__tests__/local-notes-batch.test.ts packages/storage-sqlcipher/src/types.ts packages/storage-sqlcipher/src/repositories/content-plans.ts packages/storage-sqlcipher/src/__tests__/attachments.test.ts
git commit -m "feat(application): preserve attachment history references"
```

---

## 功能模块 5：回收站引用转换、显式移除与两阶段 GC

**目标与功能逻辑**

完成 NOTE↔TRASH 引用转换、永久删除/到期清理、`removeFromNote()` 和可重试的两阶段 Blob GC。所有数据库引用和业务对象变化在原有 SQLCipher 事务中提交；物理 Blob 删除只发生在事务提交后，失败不回滚 Note 或回收站操作。

Note 或目录删除组进入回收站时，根据 TrashPlan 中每个 Note 的 TrashEntry 把 NOTE 引用转换为 TRASH 引用。顺序为：`transaction.trash.apply(plan)` 先创建 TrashEntry，再删除 NOTE 引用并添加 TRASH 引用。永久历史 NOTE_VERSION 引用不变化。批量回收把全部计划和转换放入同一事务。

恢复删除组时，先读取组内所有 TRASH 引用，在同一事务中删除 TRASH 引用、执行 `trash.restore()`、再为恢复后的 Note 添加 NOTE 引用。目标父目录解析、FTS 恢复和引用转换整体回滚。

永久删除或到期清理在事务前收集组内 Note 当前引用、全部 NoteVersion 引用和 TrashEntry 引用；事务内先删除这些引用，再执行原有完整删除组清理，最后调用 `deleteUnreferencedAttachments(affectedIds, now)`。这一步删除引用归零的 Attachment，并只对无任何 Attachment 的 Blob 标记 `GC_PENDING`。事务返回 Blob ID 后再进行物理收集。

`LocalAttachmentsService` 在本模块扩展：

```ts
removeFromNote(input: {
  readonly noteId: NoteId;
  readonly attachmentId: AttachmentId;
}): Promise<void>;

collectGarbage(): Promise<AttachmentGcReport>;
```

`removeFromNote()` 只删除指定 NOTE 引用。Attachment 仍被其他 Note、Version 或 TrashEntry 引用时成功返回且不删除 Blob；Attachment 引用归零时删除 Attachment；Blob 仍被其他 Attachment 使用时保留；最后一个 Attachment 消失时标记 `GC_PENDING`。目标 Note 在回收站、关系不存在或 Attachment 不属于 Note 时返回稳定错误，不能误删其他引用。

`collectGarbage()` 稳定遍历全部 `GC_PENDING` Blob：再次确认无 Attachment，调用 `attachments.collectBlob()`，成功或文件已不存在后在条件事务中 `finalizeGc(blobId)` 删除 File Key、Manifest 和 Blob 行。`BLOB_IN_USE` 和单个 I/O 失败记为 retry 并继续其他 Blob；报告只含 scanned/collected/retry 计数。调用多次必须幂等。

需要物理 GC 的 Local Notes 方法通过新增 `runResources()` 获得完整 `SessionResources`；普通方法仍通过现有 `run()` 只接触 VaultDatabase。删除组事务函数返回业务结果与待 GC Blob ID，Service 在提交后调用共享 `collectBlobIds()`，不把文件系统逻辑写入 Trash Repository。

**涉及文件**

- 扩展：`packages/application/src/local-attachments/references.ts`
- 新建：`packages/application/src/local-attachments/gc.ts`
- 修改：`packages/application/src/local-attachments/service.ts`
- 修改：`packages/application/src/local-attachments/types.ts`
- 修改：`packages/application/src/local-notes/service.ts`
- 修改：`packages/application/src/local-notes/trash.ts`
- 修改：`packages/application/src/local-notes/batch.ts`
- 修改：`packages/storage-sqlcipher/src/repositories/trash.ts`
- 按返回计划需要修改：`packages/storage-sqlcipher/src/types.ts`
- 新建测试：`packages/application/src/__tests__/local-attachments-gc-recovery.test.ts`
- 扩展测试：`packages/application/src/__tests__/local-attachments-lifecycle.test.ts`
- 修改测试：`packages/application/src/__tests__/local-notes-trash.test.ts`
- 修改测试：`packages/application/src/__tests__/local-notes-batch.test.ts`
- 修改 Storage 测试：`packages/storage-sqlcipher/src/__tests__/trash-plans.test.ts`
- 修改 Storage 测试：`packages/storage-sqlcipher/src/__tests__/attachments.test.ts`

**单元测试与集成断言**

- 单 Note、Folder 子树和批量回收把每篇 Note 引用映射到正确 TrashEntry，历史引用不变；
- 恢复删除组还原 NOTE 引用，内部子项层级、FTS 和引用整体提交；
- 永久删除和到期清理同时移除当前、历史、Trash 引用，不留下悬空关系；
- `removeFromNote()` 不扫描或修改 ADF，不影响同 Attachment 的其他关系；
- 一个 Attachment 引用归零但同 Blob 仍被另一个 Attachment 使用时，只删除 Attachment，不删除 Blob；
- 最后一个 Attachment 删除后 Blob 在事务内为 GC_PENDING，物理文件只在提交后删除；
- 数据库事务失败时物理 Blob 保持，文件删除失败时数据库保留 GC_PENDING；
- 活跃 Reader 返回 retry，Reader 关闭后再次收集成功；不存在文件幂等完成元数据删除；
- 多个 GC Blob 中一个失败不阻止其他 Blob，报告不含 ID、路径、名称或摘要；
- 批量/目录任一引用跨 Vault或缺失时，回收站、Note、Version、引用和 Blob 状态全部回滚。

**本模块相关测试命令**

```powershell
npm test -- --runInBand --runTestsByPath packages/application/src/__tests__/local-attachments-gc-recovery.test.ts packages/application/src/__tests__/local-attachments-lifecycle.test.ts packages/application/src/__tests__/local-notes-trash.test.ts packages/application/src/__tests__/local-notes-batch.test.ts packages/storage-sqlcipher/src/__tests__/trash-plans.test.ts packages/storage-sqlcipher/src/__tests__/attachments.test.ts packages/attachments/src/__tests__/reader.test.ts packages/attachments/src/__tests__/recovery.test.ts
```

预期：8 个测试文件全部通过，0 个失败；不运行 Manager 解锁测试、全量 lint、全量 typecheck 或 build。

**完成后的提交**

```powershell
git add -- packages/application/src/local-attachments/references.ts packages/application/src/local-attachments/gc.ts packages/application/src/local-attachments/service.ts packages/application/src/local-attachments/types.ts packages/application/src/local-notes/service.ts packages/application/src/local-notes/trash.ts packages/application/src/local-notes/batch.ts packages/application/src/__tests__/local-attachments-gc-recovery.test.ts packages/application/src/__tests__/local-attachments-lifecycle.test.ts packages/application/src/__tests__/local-notes-trash.test.ts packages/application/src/__tests__/local-notes-batch.test.ts packages/storage-sqlcipher/src/types.ts packages/storage-sqlcipher/src/repositories/trash.ts packages/storage-sqlcipher/src/__tests__/trash-plans.test.ts packages/storage-sqlcipher/src/__tests__/attachments.test.ts
git commit -m "feat(application): collect unreferenced attachment blobs"
```

---

## 功能模块 6：Profile 解锁对账、Session 集成与公共 API 收口

**目标与功能逻辑**

在 Profile 对外解锁前执行数据库与 Blob 文件清单对账，完成崩溃恢复，并验证稳定 Facade、取消、关闭、安全错误和包公共面。本模块完成后执行本次改动唯一一次最终验证，然后把恢复实现、测试和最终验证发现的针对性修复一起提交，不创建额外“验证修复”提交。

新建 `recoverAttachments()`，输入尚未发布为 Session 的 `VaultDatabase`、`AttachmentStore` 和当前时间：

```ts
interface AttachmentRecoveryReport {
  readonly missingCount: number;
  readonly collectedGcCount: number;
  readonly collectedOrphanCount: number;
  readonly retryCount: number;
  readonly unexpectedEntryCount: number;
}

recoverAttachments(input: {
  readonly database: VaultDatabase;
  readonly attachments: AttachmentStore;
  readonly now: Timestamp;
}): Promise<AttachmentRecoveryReport>;
```

恢复顺序固定为：从数据库读取全部 Blob ID；调用 `attachments.reconcile(new Set(blobIds))`；在一个 SQLCipher 条件事务中把报告缺失且当前仍为 READY 的 Blob 标记为 MISSING；对全部 GC_PENDING Blob调用模块 5 的幂等收集；对 `orphanBlobIds` 逐个 `collectBlob()`；保留未知文件、目录、链接和重解析点，只汇总计数。MISSING、CORRUPT 和遗留 IMPORTING 即使文件存在也不自动提升 READY。

无法取得可信 inventory、数据库 Blob 状态损坏或必要状态事务失败时，解锁失败并映射安全 Application 错误。孤儿或 GC 的单次物理删除失败保留待重试文件，可以继续解锁，因为数据库仍不引用孤儿且 GC_PENDING 仍是安全状态。

`LocalProfileManager.unlock()` 在打开 SQLCipher、校验 Meta/Root 并创建 AttachmentStore 后调用恢复，只有成功完成必要对账后才创建并发布 `ProfileSession`。创建全新 Profile 仍依赖空 Store 启动恢复，不做无意义全量对账。恢复失败必须关闭 AttachmentStore、数据库并清零临时密钥，不能发布半解锁 Session。

最终公共面：

- `ProfileManager.localAttachments` 与 `localNotes` 都是稳定只读属性；
- `@notera/application` 包根只导出安全 Service、Reader、DTO、GC/Recovery 报告与稳定错误，不导出 Session、VaultDatabase、AttachmentStore、File Key、Manifest 或内部协调器；
- `src/shared` 现有 AttachmentSummary 与 Application DTO 保持同构，不在本阶段注册 Handler 或新增同步字段；
- 锁定中止导入和 Reader，等待活动操作 settle，再关闭 Store/数据库并清零 Session 密钥；
- 旧 Facade 和 Reader 在切换 Profile 后不能观察新旧 Vault 混合状态。

错误和诊断最终收口：日志白名单只允许随机 Operation ID、稳定错误码、耗时、重试次数和非敏感计数；禁止文件名、MIME、SHA-256、路径、Note/Attachment/Blob ID、ADF、File Key、Manifest 和底层消息。

**涉及文件**

- 新建：`packages/application/src/local-attachments/recovery.ts`
- 修改：`packages/application/src/local-attachments/gc.ts`
- 修改：`packages/application/src/local-attachments/errors.ts`
- 修改：`packages/application/src/local-attachments/service.ts`
- 修改：`packages/application/src/local-attachments/types.ts`
- 修改：`packages/application/src/manager.ts`
- 按取消/关闭断言需要修改：`packages/application/src/session.ts`
- 修改：`packages/application/src/types.ts`
- 修改：`packages/application/src/errors.ts`
- 修改：`packages/application/src/index.ts`
- 扩展测试：`packages/application/src/__tests__/local-attachments-gc-recovery.test.ts`
- 修改测试：`packages/application/src/__tests__/manager.integration.test.ts`
- 修改测试：`packages/application/src/__tests__/session.test.ts`
- 修改测试：`packages/application/src/__tests__/local-notes-search-session.test.ts`
- 仅在 DTO 确有不一致时最小修改：`src/shared/ipc/contracts/attachment.ts`
- 仅在合约修改时同步修改：`src/shared/ipc/__tests__/file-operation-contracts.test.ts`

**单元测试、集成测试与断言**

- READY Blob 文件缺失时解锁前标记 MISSING；数据库元数据损坏或 inventory 失败阻止 Session 发布；
- GC_PENDING 有文件和无文件两种状态都能终结；孤儿 Blob 被删除，未知目录项保持不动；
- 单个孤儿/GC 删除失败计入 retry 且允许解锁，下次解锁可继续；
- 恢复失败关闭 Store/数据库、清零临时密钥，`getSessionState()` 仍为 LOCKED；
- `localAttachments` 引用跨锁定/解锁/切换稳定，旧调用在关闭前 settle，新调用锁定失败，不能返回其他 Vault 数据；
- 活动导入与 Reader 在锁定时取消和关闭，租约释放；调用方取消与 PROFILE_LOCKED 不混淆；
- 包根只导出安全公共类型，不导出内部资源或协调器；
- Shared Attachment DTO 若无需修改则保持原测试原样通过；若需要最小修正，错误集合和字段仍不泄漏 Blob 内部；
- 所有错误、报告和模拟日志快照只包含允许字段；
- 没有引入同步、Media Gateway、Electron Handler、Renderer、缩略图或导出代码。

**本模块相关测试命令**

```powershell
npm test -- --runInBand --runTestsByPath packages/application/src/__tests__/local-attachments-gc-recovery.test.ts packages/application/src/__tests__/manager.integration.test.ts packages/application/src/__tests__/session.test.ts packages/application/src/__tests__/local-notes-search-session.test.ts src/shared/ipc/__tests__/file-operation-contracts.test.ts packages/attachments/src/__tests__/recovery.test.ts packages/storage-sqlcipher/src/__tests__/attachments.test.ts
```

预期：7 个测试文件全部通过，0 个失败。完成本模块代码后直接执行下述唯一一次最终验证，不在两者之间运行全量检查。

### 最终验证（所有模块完成后只执行一次）

先运行本次改动相关测试全集：

```powershell
npm test -- --runInBand --runTestsByPath packages/domain/src/__tests__/attachments.test.ts packages/domain/src/__tests__/content-operations.test.ts packages/domain/src/__tests__/history-trash.test.ts packages/attachments/src/__tests__/import.test.ts packages/attachments/src/__tests__/manifest.test.ts packages/attachments/src/__tests__/reader.test.ts packages/attachments/src/__tests__/recovery.test.ts packages/storage-sqlcipher/src/__tests__/attachments.test.ts packages/storage-sqlcipher/src/__tests__/migrations.test.ts packages/storage-sqlcipher/src/__tests__/schema.test.ts packages/storage-sqlcipher/src/__tests__/integrity.test.ts packages/storage-sqlcipher/src/__tests__/organization-history.test.ts packages/storage-sqlcipher/src/__tests__/trash-plans.test.ts packages/application/src/__tests__/local-attachments-import.test.ts packages/application/src/__tests__/local-attachments-reader.test.ts packages/application/src/__tests__/local-attachments-lifecycle.test.ts packages/application/src/__tests__/local-attachments-gc-recovery.test.ts packages/application/src/__tests__/local-notes-notes.test.ts packages/application/src/__tests__/local-notes-history.test.ts packages/application/src/__tests__/local-notes-trash.test.ts packages/application/src/__tests__/local-notes-batch.test.ts packages/application/src/__tests__/local-notes-search-session.test.ts packages/application/src/__tests__/manager.integration.test.ts packages/application/src/__tests__/session.test.ts src/shared/ipc/__tests__/file-operation-contracts.test.ts
```

预期：25 个测试文件全部通过，0 个失败。

再按实际改动运行必要静态检查：

```powershell
npm run typecheck --workspace=@notera/domain
npm run typecheck --workspace=@notera/attachments
npm run typecheck --workspace=@notera/storage-sqlcipher
npm run typecheck --workspace=@notera/application
npm run typecheck:app
npx eslint --ext .ts packages/domain/src/models/attachment.ts packages/domain/src/operations/attachments.ts packages/domain/src/operations/copy.ts packages/domain/src/index.ts packages/domain/src/__tests__/attachments.test.ts packages/domain/src/__tests__/content-operations.test.ts packages/attachments/src/importer.ts packages/attachments/src/types.ts packages/attachments/src/__tests__/import.test.ts packages/attachments/src/__tests__/helpers.ts packages/storage-sqlcipher/src/schema/v4.ts packages/storage-sqlcipher/src/migrations/registry.ts packages/storage-sqlcipher/src/types.ts packages/storage-sqlcipher/src/repositories/attachment-blobs.ts packages/storage-sqlcipher/src/repositories/attachments.ts packages/storage-sqlcipher/src/repositories/content-plans.ts packages/storage-sqlcipher/src/repositories/trash.ts packages/storage-sqlcipher/src/database.ts packages/storage-sqlcipher/src/integrity.ts packages/storage-sqlcipher/src/index.ts packages/storage-sqlcipher/src/__tests__/attachments.test.ts packages/storage-sqlcipher/src/__tests__/migrations.test.ts packages/storage-sqlcipher/src/__tests__/schema.test.ts packages/storage-sqlcipher/src/__tests__/integrity.test.ts packages/storage-sqlcipher/src/__tests__/trash-plans.test.ts packages/application/src/local-attachments packages/application/src/local-notes/notes.ts packages/application/src/local-notes/history.ts packages/application/src/local-notes/trash.ts packages/application/src/local-notes/batch.ts packages/application/src/local-notes/service.ts packages/application/src/manager.ts packages/application/src/session.ts packages/application/src/types.ts packages/application/src/errors.ts packages/application/src/index.ts packages/application/src/__tests__/local-attachments-import.test.ts packages/application/src/__tests__/local-attachments-reader.test.ts packages/application/src/__tests__/local-attachments-lifecycle.test.ts packages/application/src/__tests__/local-attachments-gc-recovery.test.ts packages/application/src/__tests__/local-notes-notes.test.ts packages/application/src/__tests__/local-notes-history.test.ts packages/application/src/__tests__/local-notes-trash.test.ts packages/application/src/__tests__/local-notes-batch.test.ts packages/application/src/__tests__/local-notes-search-session.test.ts packages/application/src/__tests__/manager.integration.test.ts packages/application/src/__tests__/session.test.ts src/shared/ipc/contracts/attachment.ts src/shared/ipc/__tests__/file-operation-contracts.test.ts
npm run check:deps
git diff --check
```

预期：五项 typecheck 通过；目标 lint 为 0 error；依赖边界检查通过；`git diff --check` 无输出。本次不改 Electron 打包入口或原生依赖，不运行 build、package 或 SQLCipher 二进制探测。某项失败时只针对失败原因修复并复测该失败项，不重复未受影响且已经通过的检查。

**完成后的提交**

最终验证通过后，提交本模块恢复、Session、公有 API、测试以及最终验证中针对本模块发现的修复：

```powershell
git add -- packages/application/src/local-attachments packages/application/src/manager.ts packages/application/src/session.ts packages/application/src/types.ts packages/application/src/errors.ts packages/application/src/index.ts packages/application/src/__tests__/local-attachments-gc-recovery.test.ts packages/application/src/__tests__/manager.integration.test.ts packages/application/src/__tests__/session.test.ts packages/application/src/__tests__/local-notes-search-session.test.ts
git add -- src/shared/ipc/contracts/attachment.ts src/shared/ipc/__tests__/file-operation-contracts.test.ts
git commit -m "feat(application): recover local attachment state"
```

如果 Shared 文件没有实际变化，第二条 `git add` 不会把无关文件纳入提交。若最终验证发现前五个模块的缺陷，只暂存实际修复文件并一并纳入本次集成收口提交；不得创建单独的“测试修复”或“最终验证”提交。

---

## 完成标准

- Attachment 与 AttachmentBlob 已分离，多个 Attachment 可以共享一个加密 Blob；
- 每次导入创建新 Attachment，界面允许相同附件出现多次；
- 当前 Vault 内只按明文 SHA-256 复用 READY Blob，不比较字节数、文件名或 MIME；
- v4 迁移连续、可回滚，旧附件和三类引用保持可用，旧摘要为 `NULL`；
- `ProfileManager.localAttachments` 是稳定且不持有 Session 的唯一附件业务入口；
- 导入、列表和 Reader 不暴露路径、Blob ID、SHA-256、File Key 或 Manifest；
- `attachment_references` 是唯一真实来源，`saveDraft` 不扫描 ADF；
- Note/Folder/批量复制、永久历史、历史恢复和历史复制保持正确引用快照；
- 回收站进入/恢复/永久删除/到期清理正确转换或删除引用；
- Attachment 与 Blob 两级归零、GC_PENDING、物理删除和元数据终结可重试且幂等；
- 解锁对账处理缺失、孤儿和遗留 GC，保留未知目录项；
- 锁定、切换和关闭不能泄漏旧 Profile 数据或敏感副本；
- 所有相关测试和必要静态检查通过；
- 每个完整功能模块只有一次对应提交；
- 没有实现或占位 Electron/Main/Preload、Media Gateway、Renderer、缩略图、导出或任何同步能力。
