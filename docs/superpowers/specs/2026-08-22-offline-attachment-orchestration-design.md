# Notera 离线附件编排设计

- 日期：2026-08-22
- 状态：已确认
- 所属阶段：`packages/application` 的本地附件业务编排

## 1. 目标

在已解锁的 `ProfileSession` 上提供完整的本地附件业务入口，协调 SQLCipher 中的附件元数据、附件引用与 `@notera/attachments` 管理的加密 Blob。导入、读取、复制、历史、回收站、失败补偿和垃圾回收必须形成确定且可恢复的业务流程，同时保持 Application 与 Electron、文件选择器、Media Gateway 和 Renderer 解耦。

本阶段同时把当前“一条 Attachment 独占一个 Blob”的存储模型规范化为“多个 Attachment 可以共享一个 AttachmentBlob”。每次用户导入都创建新的 Attachment，因此界面允许出现多个名称和内容完全相同的附件；当前 Vault 内只按明文 SHA-256 判断底层 Blob 是否可复用，不使用 MD5，也不使用文件名、MIME 或明文字节数参与去重判定。

本设计承接以下已完成能力：

- `@notera/domain` 已有附件与引用的基础领域规则；
- `@notera/storage-sqlcipher` 已有附件元数据和引用 Repository 基础；
- `@notera/attachments` 已有流式分块加密、Manifest、Reader、租约、原子发布、物理回收和 Blob 清单对账；
- `@notera/application` 已有 Profile 生命周期、`ProfileSession` 和本地笔记业务用例；
- `src/shared` 已定义附件 IPC 请求、响应和安全摘要的基础合约。

## 2. 范围

### 2.1 包含

- 独立、稳定且不持有 Session 的 `LocalAttachmentsService`；
- 流式导入、明文 SHA-256 计算和当前 Vault 内的 Blob 去重；
- Attachment、AttachmentBlob 和 AttachmentReference 的规范化模型；
- SQLCipher Schema v4、连续迁移和附件 Repository 扩展；
- 按 Note 分页列出附件安全摘要；
- 流式完整读取与 Range 读取的 Application 包装；
- 缺失、损坏、取消、锁定和底层错误的稳定映射；
- 当前笔记、复制、永久历史、历史恢复、回收站和批量操作中的引用协调；
- Attachment 删除与 AttachmentBlob 两阶段垃圾回收；
- Profile 解锁期间的数据库与 Blob 清单对账；
- 失败补偿、崩溃恢复、密钥副本清理和非敏感诊断计数；
- 相关功能逻辑单元测试和必要集成测试。

### 2.2 不包含

- Electron Main Handler、Preload 注册、文件选择器或 Operation 进度事件；
- Media Gateway、`notera-media:` URL、临时 Token、Origin 校验或协议处理；
- Renderer、Atlassian Editor 适配或界面交互；
- 图片解码、缩略图生成、转码或内容嗅探；
- Markdown/PDF 导出、另存为目标选择或明文临时文件；
- OCR、附件正文索引、压缩或跨 Vault 去重；
- 同步协议、同步引擎、云端 API、同步 Outbox、同步冲突、远端附件状态或传输状态；
- 为上述延期能力建立占位实现。

现有 `src/shared` 合约只有在与本阶段 Application 安全 DTO 确有不一致时才做最小修正，不在本阶段注册真实 IPC Handler。

## 3. 核心决策

### 3.1 引用的唯一真实来源

`attachment_references` 是附件引用的唯一真实来源。ADF 只保存 Attachment ID 和编辑器适配需要的 collection 标识，不保存真实路径、Blob ID、File Key、Manifest、SHA-256 或二进制内容。

`note.saveDraft` 不扫描 ADF，也不根据 ADF 自动重建附件引用。导入、移除、复制、历史和回收站用例显式维护引用。这样 Application 不依赖 Atlassian Editor 的具体节点结构，也不会让任意 ADF 节点绕过附件业务规则。

### 3.2 每次导入创建独立 Attachment

每次成功导入都创建新的 Attachment ID，即使内容、文件名和 MIME 与目标 Note 已有附件完全相同。相同 Note 的附件列表因此可以出现两个相同条目。

Attachment 是用户可见身份，保存文件名、MIME 和创建时间；AttachmentBlob 是加密内容身份，保存 Blob ID、内容摘要、File Key、Manifest、长度和本地状态。多个 Attachment 可以引用同一 AttachmentBlob。

笔记复制、历史快照和回收站转换不属于“重新导入”，只复制或转换 AttachmentReference，继续复用原 Attachment 和 AttachmentBlob。

### 3.3 只按 SHA-256 去重

Blob 去重限定在当前 Vault 内，只按完整明文内容的 SHA-256 判断：

- 命中现有 `READY` AttachmentBlob 时复用；
- 未命中时创建新的 AttachmentBlob；
- 文件名、MIME 和明文字节数不参与查询或去重判定；
- `MISSING`、`CORRUPT`、`GC_PENDING` 或遗留 `IMPORTING` Blob 不作为去重目标；
- SHA-256 只保存在 SQLCipher 中，不写入 Manifest、Blob 文件、日志、错误或公共 DTO。

明文字节数仍用于附件摘要、Manifest、读取边界和大小限制，但不用于判断两个 Blob 是否相同。

### 3.4 两阶段垃圾回收

数据库事务与文件系统不能共享一个原子事务，因此垃圾回收使用两阶段协议：

1. 在 SQLCipher 事务中删除已归零的 Attachment，并在 Blob 已无任何 Attachment 使用时将 AttachmentBlob 标记为 `GC_PENDING`；
2. 事务提交后调用 `collectBlob()` 删除物理密文；
3. 物理删除成功后，在第二个条件事务中删除 File Key、Manifest 和 AttachmentBlob 元数据；
4. 删除失败或 Blob 正在读取时保留 `GC_PENDING`，以后幂等重试，不回滚已经成功的笔记操作。

## 4. 架构与组件边界

### 4.1 Application 公共入口

`ProfileManager` 新增只读属性：

```ts
readonly localAttachments: LocalAttachmentsService;
```

`localAttachments` 与现有 `localNotes` 一样是稳定 Facade，不持有 `ProfileSession`、数据库、AttachmentStore、密钥或 Repository。每次调用通过注入的 `getSession()` 获取当前已解锁资源。Profile 锁定、切换或应用关闭后，旧 Facade 仍是同一个对象，但新调用确定性返回 `PROFILE_LOCKED` 或 `APPLICATION_CLOSED`，不能访问旧 Vault。

公共接口形状为：

```ts
interface LocalAttachmentsService {
  importAttachment(input: {
    noteId: NoteId;
    fileName: string;
    mimeType: string;
    source: AsyncIterable<Uint8Array>;
    signal?: AbortSignal;
  }): Promise<AttachmentSummary>;

  listForNote(input: {
    noteId: NoteId;
    cursor?: string;
    limit: number;
  }): Promise<Page<AttachmentSummary>>;

  openReader(
    attachmentId: AttachmentId,
  ): Promise<AttachmentContentReader>;

  removeFromNote(input: {
    noteId: NoteId;
    attachmentId: AttachmentId;
  }): Promise<void>;

  collectGarbage(): Promise<AttachmentGcReport>;
}
```

Application 输入使用流、领域 ID 和安全元数据，不接受源文件路径、目标文件路径、Electron 对象、BrowserWindow、WebContents 或 Media Token。

### 4.2 内部组件

Application 内部按职责拆分为：

- `LocalAttachmentsService`：导入、列表、读取、显式移除和 GC 的公共 Facade；
- `AttachmentReferenceCoordinator`：构造并应用事务内引用变化，服务于复制、历史和回收站；
- `AttachmentRecovery`：解锁期间执行 Blob 清单对账、状态修复和遗留 GC；
- `AttachmentContentReader`：包装底层 BlobReader，组合 Session 与调用方取消信号，并在读取失败时更新 Blob 状态；
- 附件错误映射与 DTO 映射：只产生稳定 Application 错误和安全摘要。

这些组件只通过 `@notera/domain`、`@notera/storage-sqlcipher` 和 `@notera/attachments` 的公开接口协作。`localNotes` 不直接接触物理 Blob；它只在现有 SQLCipher 事务中调用引用协调器或写入携带引用计划的 Storage 接口。

### 4.3 下层职责

- `@notera/domain`：Attachment、AttachmentBlob、引用和 GC 状态转换的纯规则；
- `@notera/storage-sqlcipher`：Schema、迁移、分页、SHA-256 查询、引用查询、事务写入和条件终结删除；
- `@notera/attachments`：流式 SHA-256 计算、随机加密、Blob 原子发布、Reader、租约、清单盘点和物理删除；
- `@notera/application`：跨数据库与文件系统编排、失败补偿、安全错误和 Session 生命周期；
- 后续 `src/main`：文件选择器、Operation 生命周期、Media Gateway 和 IPC 适配，不重复 Application 规则。

## 5. 领域与存储模型

### 5.1 领域对象

```ts
type AttachmentBlobLocalState =
  | 'IMPORTING'
  | 'READY'
  | 'MISSING'
  | 'CORRUPT'
  | 'GC_PENDING';

interface AttachmentBlob {
  readonly blobId: BlobId;
  readonly vaultId: VaultId;
  readonly contentSha256?: Uint8Array;
  readonly byteLength: AttachmentByteLength;
  readonly localState: AttachmentBlobLocalState;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

interface Attachment {
  readonly id: AttachmentId;
  readonly blobId: BlobId;
  readonly vaultId: VaultId;
  readonly fileName: string;
  readonly mimeType: string;
  readonly createdAt: Timestamp;
}
```

`IMPORTING` 仅为旧 Schema 迁移与防御性恢复保留。新的 Application 导入不先写入 `IMPORTING` 数据库记录；候选 Blob 成功发布后，新的 AttachmentBlob 直接以 `READY` 状态提交。

`contentSha256` 对新导入的 Blob 必须是 32 字节；对 v3 迁移而来的旧 Blob 可以缺失。领域层防御性复制摘要字节，不持有 File Key 或 Manifest。

AttachmentReference 继续按所有者区分：

- `NOTE`：当前 Note；
- `NOTE_VERSION`：永久历史或保护历史；
- `TRASH`：回收站中的 Note 对应 TrashEntry。

### 5.2 SQLCipher Schema v4

Schema v4 新增规范化 `attachment_blobs` 表，至少包含：

- `blob_id`、`vault_id`；
- 可空 `content_sha256 BLOB`，非空时固定 32 字节；
- `byte_length`；
- `local_state`；
- `file_key`、`manifest_version`、`manifest`；
- `created_at`、`updated_at`。

重建后的 `attachments` 表只保存：

- `id`、`vault_id`、`blob_id`；
- `file_name`、`mime_type`；
- `created_at`。

`attachments.blob_id` 外键指向同 Vault 的 AttachmentBlob；`attachment_references` 继续外键引用 Attachment ID。数据库约束必须保证 Attachment、AttachmentBlob、Note、Version 和 TrashEntry 不跨 Vault 混用。

为当前 Vault 中 `content_sha256 IS NOT NULL AND local_state = 'READY'` 的记录建立唯一索引。Application 正常先查询再插入；唯一约束同时处理并发竞争。竞争失败的事务重新查询获胜 Blob 并创建本次独立 Attachment，不把底层约束消息暴露为业务错误。

### 5.3 v3 到 v4 迁移

已经发布的 v1、v2 和 v3 Schema 与迁移保持不可变。v3 到 v4 在单个 SQLCipher 事务中：

1. 创建 v4 AttachmentBlob、Attachment 和必要的引用临时表；
2. 为每条旧 Attachment 创建一条对应 AttachmentBlob；
3. 原样迁移 Blob ID、Vault ID、长度、状态、File Key、Manifest 和时间；
4. 将旧 Blob 的 `content_sha256` 设为 `NULL`，因为数据库迁移不能读取或解密文件系统 Blob；
5. 使用原 Attachment ID、文件名、MIME 和 Blob ID 创建规范化 Attachment；
6. 原样迁移全部 AttachmentReference；
7. 校验行数、外键、唯一性和引用归属后替换旧表并更新 `schema_version`。

迁移不依赖网络、AttachmentStore、Renderer、当前 Session 或文件系统。摘要为空的历史 Blob 不参与内容去重，但仍可读取、复制、进入历史、进入回收站和回收。解锁不为这些旧 Blob 强制执行全量明文哈希，避免大型 Profile 被长时间阻塞。

## 6. 导入与 Blob 去重

### 6.1 输入校验

Application 在读取源流前验证：

- Profile 已解锁且服务未关闭；
- Note ID、文件名和 MIME 类型合法；
- Note 存在、属于当前 Vault 且不在回收站；
- 文件名和 MIME 去除首尾空白后非空，并遵守当前 IPC 的 255 Unicode 字符上限；
- `source` 是异步可迭代字节流；调用方取消信号合法。

实际文件大小由 AttachmentStore 流式统计，不能信任调用方声明。单附件最大明文大小保持 100 MiB。

### 6.2 AttachmentStore 输出

`@notera/attachments` 的 `ImportedBlob` 增加：

```ts
readonly contentSha256: Uint8Array;
```

Importer 在现有单遍流式读取中同时更新 SHA-256，不额外缓存完整明文，也不改变随机 File Key、Nonce、分块 AEAD、Manifest 或原子发布规则。返回摘要必须是防御性副本。失败、取消或超限时不得返回不完整摘要。

### 6.3 提交流程

完整导入流程为：

1. 为本次调用生成新的 Attachment ID；
2. AttachmentStore 流式加密并发布一个随机 Blob ID 的候选 Blob，同时返回 File Key、Manifest、实际长度和明文 SHA-256；
3. 在 SQLCipher 事务中按当前 Vault 与 SHA-256 查询现有 `READY` AttachmentBlob；
4. 命中时创建指向现有 Blob 的新 Attachment，并为目标 Note 添加 `NOTE` 引用；
5. 未命中时创建新的 `READY` AttachmentBlob、新 Attachment 和 `NOTE` 引用；
6. 事务提交后，如果命中了旧 Blob，则幂等删除本次候选 Blob；
7. 清零 Application 持有的候选 File Key 和摘要工作副本；
8. 返回新 Attachment 的安全摘要。

每次导入都创建新 Attachment，因此同一 Note 连续导入相同文件两次会返回两个不同 Attachment ID，列表显示两项；两项的底层 Blob ID 相同，磁盘最终只有一份被数据库引用的密文 Blob。

### 6.4 失败补偿

- 候选 Blob 发布前失败：AttachmentStore 清理 staging，数据库不变；
- 候选 Blob 发布后、数据库提交前失败：Application 尝试 `collectBlob()`；清理失败的候选 Blob 成为孤儿，由下次解锁对账处理；
- 复用旧 Blob 的数据库事务成功、候选 Blob 删除失败：导入仍成功，孤儿稍后清理；
- 唯一 SHA-256 竞争：当前事务回滚并重新查询获胜 Blob，再提交本次 Attachment 与引用；
- SQLCipher 事务内任一步失败：Attachment、AttachmentBlob 和引用均不部分提交；
- 提交点后的迟到取消仍返回成功，避免调用方收到取消但 Attachment 已存在的歧义。

补偿失败不能覆盖原始业务结果，也不能把路径、摘要或底层消息写入错误和日志。

## 7. 查询与读取

### 7.1 按 Note 列表

Storage 增加“当前 Note 引用 + Attachment + AttachmentBlob”的稳定分页查询。Application 先验证 Note 有效，再返回：

```ts
interface AttachmentSummary {
  readonly id: AttachmentId;
  readonly fileName: string;
  readonly mime: string;
  readonly byteLength: number;
  readonly localState: 'AVAILABLE' | 'MISSING' | 'CORRUPT';
  readonly previewable: boolean;
  readonly createdAt: number;
}
```

内部 `READY` 映射为 `AVAILABLE`。`IMPORTING` 和 `GC_PENDING` 不得通过有效 Note 引用出现在普通列表；若数据库出现该组合，按完整性错误处理。

`previewable` 使用集中、保守的本地 MIME 白名单，只是后续 UI 的能力提示，不是安全授权。SVG、HTML 和其他主动内容默认不可预览；后续 Media Gateway 仍必须独立执行 Token、Origin、响应头、内容校验和沙箱规则。

分页 Cursor 绑定 Note ID 和确定性排序，不包含文件名、MIME、摘要或 Blob ID。默认排序为 `createdAt DESC, attachmentId DESC`。

### 7.2 Application Reader

`openReader(attachmentId)`：

1. 验证 Attachment 存在且仍有至少一个有效引用；
2. 联查 AttachmentBlob；
3. 只允许 `READY` 状态；
4. 使用 Blob ID、File Key 和 Manifest 打开底层 BlobReader；
5. 立即清理 Application 的 File Key 与 Manifest 工作副本；
6. 返回只暴露安全元数据、完整流、Range 流和 `close()` 的包装 Reader。

包装 Reader 组合调用方取消信号与 `ProfileSession.signal`。完整读取、单块读取或 Range 读取遇到 `BLOB_MISSING` 时，在独立条件事务中把仍为同一 Blob 的状态更新为 `MISSING`；遇到文件长度、密文哈希、Manifest 或 AEAD 认证失败时更新为 `CORRUPT`。状态写入失败不能泄漏底层原因，但读取调用仍返回最初的稳定 Blob 错误。

Reader 的 `close()` 幂等释放底层租约。Profile 锁定取消读取、等待 Reader 收尾，然后关闭 AttachmentStore 和数据库。

## 8. 引用协调

### 8.1 普通 Note

- 导入在 Attachment 与 Blob 事务提交时增加 `NOTE` 引用；
- `removeFromNote` 验证 Note、Attachment 和指定关系后删除该 `NOTE` 引用；
- `saveDraft`、标题修改、移动、标签和收藏不修改附件引用；
- 普通 Note 复制复制源 Note 的全部当前 AttachmentReference；
- 目录树复制和批量复制对每篇新 Note 使用对应源 Note 的当前引用；
- 复制只创建指向原 Attachment 的新 `NOTE` 引用，不创建 Attachment 或 Blob。

Storage 的 NoteCopyPlan、FolderTreeCopyPlan 和批量复制计划扩展为携带完整附件引用集合，Note、标签和附件引用在同一 SQLCipher 事务中写入。现有 Application 中传入空引用集合的临时行为在本阶段移除。

### 8.2 永久历史

- 创建用户永久版本时，把当前 Note 的 Attachment 集合快照为 `NOTE_VERSION` 引用；
- 历史恢复前创建的 `BEFORE_HISTORY_RESTORE` 保护版本同时保存恢复前的引用集合；
- 恢复历史时，用目标 Version 的引用集合替换当前 Note 的 `NOTE` 引用；
- 目标 Version 和其他历史 Version 的 `NOTE_VERSION` 引用保持不变；
- 从历史 Version 复制新 Note 时使用该 Version 的引用集合，不使用源 Note 当前引用；
- 历史重命名和比较不修改引用。

当前 Note、保护版本、目标内容、FTS、内容版本和附件引用变化必须在同一事务提交。任何历史仍引用 Attachment 时，移除当前 Note 引用不能删除该 Attachment 或 Blob。

### 8.3 回收站

Note 或目录子树进入回收站时：

- 每篇 Note 已有自己的 TrashEntry；
- 将该 Note 的全部 `NOTE` 引用转换为对应 TrashEntry 的 `TRASH` 引用；
- 永久历史的 `NOTE_VERSION` 引用不变化；
- TrashPlan、FTS 变化和引用转换在同一事务提交。

恢复删除组时，将每个 Note 对应的 `TRASH` 引用转换回 `NOTE` 引用。永久删除和到期清理完整删除组时删除全部 `TRASH` 引用，并在同一事务对受影响 Attachment 执行引用归零检查。

### 8.4 Attachment 与 Blob 归零

每次删除一组引用后，对受影响 Attachment 执行：

1. 若 Attachment 仍有 `NOTE`、`NOTE_VERSION` 或 `TRASH` 引用，保留；
2. 若 Attachment 引用归零，删除 Attachment 元数据；
3. 若对应 AttachmentBlob 仍被其他 Attachment 使用，保留 Blob；
4. 若 Blob 已无任何 Attachment 使用，将其标记为 `GC_PENDING`；
5. 事务返回去重、稳定排序的待回收 Blob ID 集合；
6. Application 在提交后执行物理 GC。

这套规则同时用于显式移除、历史清理、回收站永久删除和到期清理，不能由各用例复制不同版本的引用计数逻辑。

## 9. 垃圾回收与解锁对账

### 9.1 正常 GC

`collectGarbage()` 查询当前 Vault 全部 `GC_PENDING` Blob，逐个：

1. 再次确认 Blob 仍为 `GC_PENDING` 且无 Attachment；
2. 调用 AttachmentStore `collectBlob(blobId)`；
3. 物理文件不存在视为幂等成功；
4. 活跃 Reader 导致 `BLOB_IN_USE` 时保留记录并继续其他 Blob；
5. 删除成功后执行条件事务，只有状态和 Blob ID 仍匹配时才删除 File Key、Manifest 和 Blob 行。

单个 Blob 失败不应阻止其他 Blob 回收。报告只包含扫描数、成功数、重试数和稳定错误计数，不包含 Blob ID、路径或文件名。

### 9.2 Profile 解锁对账

Profile 解锁后、`ProfileSession` 对外可用前执行：

1. 从 SQLCipher 读取全部已知 Blob ID；
2. 调用 AttachmentStore `reconcile(knownBlobIds)`；
3. 对报告为缺失且数据库仍为 `READY` 的 Blob，条件更新为 `MISSING`；
4. 对 `GC_PENDING` Blob执行幂等物理删除和元数据终结；
5. 对数据库未知的规范孤儿 Blob 调用 `collectBlob()`；
6. 保留未知文件、异常目录、链接和重解析点，只记录非敏感计数；
7. 完成数据库完整性检查后才发布新的 Session。

无法取得可信 Blob 清单或无法提交必要状态修复时，解锁失败并返回稳定 Application 错误。孤儿或遗留 GC 的单次物理删除失败是可重试清理，不使数据库重新变得不一致；对应文件保留到下次解锁或显式 GC。

`MISSING`、`CORRUPT` 或遗留 `IMPORTING` Blob 即使文件名重新出现也不自动提升为 `READY`，因为存在文件不等于内容通过 Manifest、密文哈希和 AEAD 校验。

### 9.3 崩溃窗口

| 崩溃时点 | 持久结果 | 恢复行为 |
| --- | --- | --- |
| staging 写入或原子发布前 | `.part` | AttachmentStore 启动恢复清理 |
| 候选 Blob 发布后、数据库提交前 | 孤儿最终 Blob | 解锁对账确认数据库未知后删除 |
| 复用旧 Blob 的数据库提交后、候选删除前 | 新 Attachment + 孤儿候选 Blob | 解锁对账删除候选 |
| 新 Blob 数据库提交后 | AttachmentBlob + Attachment + 引用 + 最终 Blob | 正常可用 |
| 标记 `GC_PENDING` 后、文件删除前 | GC 元数据 + 最终 Blob | 重试物理删除 |
| 文件删除后、元数据终结前 | GC 元数据，无最终 Blob | 幂等删除后终结元数据 |
| Reader 活跃时进入 GC | GC 元数据 + 租约保护 Blob | 当前删除返回可重试，Reader 关闭后再收集 |

## 10. 并发、取消与生命周期

- ProfileSession 继续追踪全部活动附件 Promise；锁定先中止 Session 信号，再等待操作 settle；
- 导入组合 Session 信号和调用方信号，在读取、加密、发布和数据库提交点前检查取消；
- 数据库提交是导入业务提交点，提交后的迟到取消返回成功；
- 外部用户取消映射为 Application 的稳定取消结果，Session 关闭导致的取消映射为 `PROFILE_LOCKED`；
- SHA-256 查询和 Blob/Attachment/Reference 写入位于同一 SQLCipher 事务，唯一索引解决并发去重竞争；
- Reader 与物理删除使用 AttachmentStore 现有租约互斥；
- `collectGarbage()`、解锁恢复和显式移除可以重复执行，不依赖内存中的上次进度；
- Application 不缓存跨 Session 的 Attachment、AttachmentBlob、摘要、File Key、Manifest、Reader 或 Repository；
- 一个 Vault 的 Attachment ID、Blob ID、SHA-256 或引用不能用于另一个 Vault。

## 11. 错误与安全边界

Application 错误集合补充当前附件业务需要的稳定错误：

- `ATTACHMENT_TOO_LARGE`；
- `ATTACHMENT_IMPORT_FAILED`；
- `BLOB_MISSING`；
- `BLOB_CORRUPT`；
- 内部取消结果；
- 已有 `PROFILE_LOCKED`、`ENTITY_NOT_FOUND`、`INVALID_CURSOR`、`DISK_FULL`、`SAVE_FAILED` 和 `OPERATION_FAILED`。

映射规则：

- Note、Attachment 或归属关系缺失统一为 `ENTITY_NOT_FOUND`；
- 超过 100 MiB 为 `ATTACHMENT_TOO_LARGE`；
- 文件系统空间不足为 `DISK_FULL`；
- Blob 不存在为 `BLOB_MISSING`，并尝试标记 `MISSING`；
- Manifest、长度、密文哈希或 AEAD 认证失败为 `BLOB_CORRUPT`，并尝试标记 `CORRUPT`；
- 导入阶段无法分类的 I/O 或补偿前业务失败为 `ATTACHMENT_IMPORT_FAILED`；
- 引用和元数据事务无法分类的写失败为 `SAVE_FAILED`；
- 未知读取或维护失败收口为 `OPERATION_FAILED`。

任何公共错误不得拼接下层 `message`、路径、文件名、MIME、SHA-256、ADF、File Key、Manifest 或密文信息。

日志采用字段白名单，只允许随机 Operation ID、稳定错误码、耗时、重试次数和非敏感计数。禁止记录 Local Profile ID、Vault ID、Note ID、Attachment ID、Blob ID、文件名、MIME、SHA-256、真实路径、源流内容、File Key、Manifest 或完整调用参数。

Application 必须清零导入过程持有的 File Key 和不再需要的摘要工作副本。Storage 从数据库返回 File Key 与 Manifest 时继续使用防御性复制；Reader 关闭和 Session 锁定必须释放其内部敏感副本。

## 12. 测试策略

### 12.1 AttachmentStore 摘要

- 空文件、单块边界、跨块和最大允许大小的 SHA-256 与已知向量一致；
- 输入被任意切分时摘要不变；
- 摘要计算不改变随机密文、Manifest 或现有 Range 读取结果；
- 取消、超限、源流失败和磁盘失败不发布可用 Blob；
- SHA-256 不出现在 Manifest、Blob 文件、错误和测试日志快照中。

### 12.2 Domain 与 Storage

- Attachment 和 AttachmentBlob 的 Vault、状态、摘要长度和不可变性；
- 多个 Attachment 可以共享一个 Blob；引用仍以 Attachment 为目标；
- v3 到 v4 连续、可回滚，不修改 v1/v2/v3；
- 旧 Attachment、File Key、Manifest 和引用无损迁移，摘要为 `NULL`；
- 新 Blob 的 SHA-256 长度、READY 唯一索引和只按摘要查询；
- 分页联查不泄漏 Blob ID、摘要、File Key 或 Manifest；
- 引用归零、Attachment 删除、Blob `GC_PENDING` 和条件终结删除原子；
- Repository 返回的摘要、File Key 和 Manifest 都是防御性副本。

### 12.3 Application 导入与查询

- 相同内容连续导入两次返回两个不同 Attachment ID，列表显示两项，数据库只有一个 READY Blob，磁盘只有一个被引用最终 Blob；
- 相同或不同文件名、MIME 都不参与去重判断；
- 不同内容创建不同 Blob；
- 摘要为空的迁移 Blob不参与去重；
- 并发相同内容导入由唯一约束收敛为一个 READY Blob；
- 数据库提交失败清理候选 Blob，补偿失败由对账识别；
- 复用成功后的候选 Blob 删除失败不改变导入成功结果；
- Note 缺失、回收站 Note、超限、取消、磁盘不足和锁定产生稳定错误；
- Cursor 稳定且绑定 Note，安全摘要顺序确定。

### 12.4 引用生命周期

- 单篇 Note、目录树和批量复制完整复制当前附件引用；
- 创建用户历史和保护历史保存当时引用快照；
- 历史恢复替换当前引用但保留所有历史引用；
- 历史复制使用目标 Version 引用；
- 单 Note 和目录删除组把 NOTE 引用转换为正确 TrashEntry 的 TRASH 引用；
- 恢复、永久删除和到期清理按完整删除组处理引用；
- 一个 Attachment 引用归零只删除该 Attachment；Blob 仍被别的 Attachment 使用时不进入 GC；
- 任一事务失败时 Note、Version、TrashEntry、FTS 和引用均无部分变化。

### 12.5 Reader、GC 与恢复

- 完整流和 Range 流返回原始字节；
- 缺失 Blob 标记 `MISSING`，损坏 Blob 标记 `CORRUPT`；
- 活跃 Reader 阻止物理删除，关闭后重试成功；
- GC 删除不存在的 Blob 幂等，并能完成元数据终结；
- 解锁对账处理缺失、孤儿和遗留 `GC_PENDING`；
- 未知目录项、链接和异常条目不被删除；
- Profile 锁定取消活动导入和 Reader，旧 Facade 无法读取下一个 Profile；
- 错误、日志和报告不包含任何敏感字段。

### 12.6 验证纪律

实施按完整、可独立测试的功能模块拆分，测试与实现属于同一模块。实施过程中只运行当前模块相关单元测试，每个完整模块通过后提交一次，不创建独立测试提交、验证提交、逐任务审核或额外审核代理。

所有模块完成后只执行一次必要最终验证：相关单元测试全集、受影响包的 typecheck、目标 lint、依赖边界检查和 `git diff --check`。本阶段不修改 Electron 打包入口时不运行 build；某项失败只修复并复测对应失败原因，不重复已通过且未受影响的检查。

## 13. 完成标准

- `ProfileManager.localAttachments` 是唯一公共附件业务入口，且不持有当前 Session；
- Attachment 与 AttachmentBlob 分离，每次导入创建独立 Attachment；
- 当前 Vault 内只按明文 SHA-256 复用 READY Blob；
- 相同内容重复导入可在界面显示多个附件，但底层只保留一个被引用的加密 Blob；
- `attachment_references` 是唯一真实引用来源，ADF 不参与引用推导；
- 导入、复制、历史、回收站和批量用例的数据库变化保持事务原子性；
- Attachment 和 Blob 的两级引用归零规则一致，物理 GC 可重试；
- 所有数据库与文件系统崩溃窗口都有确定、幂等的恢复路径；
- 锁定、切换和关闭不能泄漏旧 Profile 的 Reader、摘要、密钥、Manifest 或数据；
- v4 迁移连续、可回滚，并保持旧附件与引用可用；
- 相关测试与必要静态检查通过；
- 不包含 Electron/Main/Preload、Media Gateway、Renderer、缩略图、导出或任何同步能力。
