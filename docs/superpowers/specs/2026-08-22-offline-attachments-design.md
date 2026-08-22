# Notera 离线附件基础设施设计

- 状态：已确认
- 日期：2026-08-22
- 范围：`packages/attachments` 及其所需的最小 `packages/crypto` 公共能力
- 前置模块：`packages/domain`、`packages/crypto`

## 1. 目标

本阶段实现 Notera 的离线附件基础设施，为后续 `application`、Electron Main 和 Media Gateway 提供安全、流式且可恢复的本地密文 Blob 能力。

系统必须满足以下目标：

- 附件二进制不写入 SQLite，也不以明文写入 Profile 目录；
- 单个附件最大明文大小为 100 MB；
- 使用固定 5 MiB 明文分块和 XChaCha20-Poly1305 独立加密每块；
- 导入和读取保持分块内存上限，不把完整附件载入内存；
- 使用 staging、文件同步和同文件系统原子重命名发布完整 Blob；
- 使用版本化二进制 Manifest 描述块布局并支持完整、单块和 Range 读取；
- 所有长操作支持 `AbortSignal`；
- 读取期间使用包内租约阻止 Blob 被垃圾回收；
- 启动恢复安全清理 staging，并由上层参与识别最终孤儿 Blob；
- 错误、公共接口和磁盘格式不泄露真实路径、密钥或用户内容。

## 2. 非目标

本阶段不实现：

- SQLCipher Attachment Repository 编排或数据库事务；
- Attachment ID、Note 引用、ADF Media 节点或历史版本引用的更新；
- Electron 文件选择器、IPC、操作进度事件或 Renderer UI；
- Media Gateway、`notera-media:` 协议或 HTTP Range 服务；
- 图片解码、缩略图生成或预览格式转换；
- 导出为 Markdown/PDF 或“另存为”界面流程；
- 同步协议、同步引擎、云端 API、同步 Outbox、远端附件状态、上传、下载或断点续传；
- 附件内容去重、压缩、OCR、附件正文索引或物理安全擦除。

这些能力由后续独立子项目在本设计的公开边界之上实现。当前不会创建同步占位类型、远端状态或空实现。

## 3. 架构与依赖边界

`packages/attachments` 是纯 Node 基础设施包，只依赖：

- `@notera/domain`：使用 `VaultId`、`BlobId` 和附件大小上限等稳定领域类型；
- `@notera/crypto`：使用受约束的 File Key、Nonce 和附件块 AEAD 能力；
- Node 标准库：文件系统、流、SHA-256 和 UUID。

该包不得依赖 `storage-sqlcipher`、`application`、`src/main`、Electron、IPC 或 Renderer。调用方只能在创建 Store 时提供一个 Profile 根目录；其他公开操作使用规范化 ID，不接受任意文件路径。

包内组件按职责划分：

```text
AttachmentStore
├─ importer       流式分块、大小限制、加密和原子发布
├─ manifest       v1 二进制编解码、严格校验和偏移计算
├─ reader         哈希校验、AEAD 解密、完整/单块/Range 读取
├─ leases         活跃读取租约和删除互斥
├─ recovery       staging 清理、Blob inventory 与 reconcile
├─ paths          仅从可信根目录和规范 ID 推导内部路径
└─ errors         稳定且不泄密的错误模型
```

`AttachmentStore` 具有显式生命周期。`close()` 后拒绝新操作，并终止包内仍活跃的导入和读取。未来 `ProfileSession.close()` 可以直接关闭 Store，而不需要理解其内部句柄和租约。同一进程内同一规范 Profile 根目录最多打开一个 Store；重复创建返回稳定错误。跨进程单实例由后续 Electron 组合根保证，附件包不实现操作系统级锁文件。

## 4. Crypto 支撑能力

现有 `@notera/crypto` 不公开任意 AEAD AAD，这是正确的误用防护，但 `attachments` 需要受约束的附件块能力。本阶段为 Crypto 增加以下最小公共接口：

```ts
generateAttachmentFileKey(): Promise<Uint8Array>;
generateAttachmentNoncePrefix(): Promise<Uint8Array>; // 固定 16 字节

encryptAttachmentChunk(input: {
  fileKey: Uint8Array;
  noncePrefix: Uint8Array;
  formatVersion: 1;
  vaultId: string;
  blobId: string;
  chunkIndex: number;
  plaintextLength: number;
  plaintext: Uint8Array;
}): Promise<Uint8Array>;

decryptAttachmentChunk(input: {
  fileKey: Uint8Array;
  noncePrefix: Uint8Array;
  formatVersion: 1;
  vaultId: string;
  blobId: string;
  chunkIndex: number;
  plaintextLength: number;
  ciphertext: Uint8Array;
}): Promise<Uint8Array>;
```

Crypto 继续保持无项目内依赖，因此这里使用原始字符串而不导入 Domain 品牌类型；Crypto 自行要求两个 ID 都是规范小写 UUID，`attachments` 可以直接传入 `VaultId` 和 `BlobId`。具体实现可以复用 Crypto 内部已有的 AEAD 原语，但公共入口仍不接受任意算法、任意 Nonce 长度或任意 AAD。File Key 固定为 32 字节，Nonce 前缀固定为 16 字节。

完整 24 字节 Nonce 按以下方式构造：

```text
nonce = random_prefix[16] || uint64_be(chunk_index)
```

AAD 使用固定、无歧义的大端二进制编码，依次绑定：

1. `uint16` 固定域字节长度；
2. UTF-8 固定域 `notera/attachment-chunk`；
3. `uint16` 附件格式版本；
4. 去除 UUID 分隔符后解码的 16 字节 Vault ID；
5. 去除 UUID 分隔符后解码的 16 字节 Blob ID；
6. `uint64` 块序号；
7. `uint32` 明文块长度。

因此，密文块跨 Vault、跨 Blob、跨序号替换或修改声明长度都会认证失败。Crypto 返回的底层错误由 `attachments` 映射为附件级稳定错误，不向上泄露 Sodium 细节。

## 5. Blob 与 Manifest v1

### 5.1 文件布局

每个附件对应一个无 Header 的单一密文 Blob：

```text
profiles/<local-profile-id>/
├─ blobs/
│  └─ <blob-id前两位>/
│     └─ <blob-id>.blob
└─ staging/
   └─ <blob-id>.<随机会话标识>.part
```

前缀取规范小写 UUID 去除分隔符后的前两个十六进制字符。最终 Blob 只包含按块序号顺序拼接的密文，不包含文件名、MIME、Vault ID、Blob ID、明文长度、Manifest 或其他用户元数据。

staging 与 `blobs` 必须位于同一 Profile 根目录和文件系统中，以便使用原子重命名。路径模块只接受构造 Store 时的根目录和经过领域校验的 Blob ID，禁止公开拼接任意相对路径。

### 5.2 Manifest 编码

Manifest v1 使用确定性大端二进制编码。固定 Header 为 38 字节，随后每个块使用 40 字节记录：

| 偏移 | 长度 | 内容 |
| --- | --- | --- |
| 0 | 4 | ASCII Magic `NTAM`（`4e 54 41 4d`） |
| 4 | 2 | `uint16` Manifest/附件格式版本 `1` |
| 6 | 4 | `uint32` 固定明文块大小 `5 * 1024 * 1024` |
| 10 | 16 | 随机 Nonce 前缀 |
| 26 | 8 | `uint64` 附件总明文长度 |
| 34 | 4 | `uint32` 块数 |

每个块记录依次为：4 字节 `uint32` 明文长度、4 字节 `uint32` 密文长度和 32 字节密文 SHA-256。Manifest 总长度必须严格等于 `38 + 40 * chunkCount`。

Manifest 不保存文件名、MIME、真实路径或 File Key。v1 编码一经发布保持不可变；未来格式新增独立版本解析器，不修改或猜测 v1 语义。

解析器必须在任何文件读取前完成结构校验：

- Magic 和版本有效；
- 固定块大小与 v1 一致；
- 总明文长度不超过 100 MB；
- 块数严格等于 `max(1, ceil(totalPlaintextLength / 5 MiB))`，且所有计算不溢出；
- 除最后一块外，明文块均为 5 MiB；
- 密文长度严格等于明文长度加 16 字节认证标签；
- 所有长度、累计偏移和文件总长度可安全表示；
- 输入没有截断或尾随字节。

零字节附件编码为一个明文长度为 0、密文长度为 16 的认证块。这样空文件仍验证 File Key、Vault ID、Blob ID 和格式上下文，而不是无条件返回空内容。

Manifest 由 `attachments` 返回为 `Uint8Array`，后续 `application` 原样写入 SQLCipher 已有的 `manifest` 字段。Manifest 与 Blob 或 Vault 互换会在 AEAD 认证阶段失败。

## 6. 公开接口与所有权

核心公开接口形态如下；实现计划可以在不改变语义的前提下细化命名：

```ts
interface CreateAttachmentStoreInput {
  readonly profileRoot: string;
}

interface ImportBlobInput {
  readonly vaultId: VaultId;
  readonly source: AsyncIterable<Uint8Array>;
  readonly signal?: AbortSignal;
}

interface ImportedBlob {
  readonly blobId: BlobId;
  readonly fileKey: Uint8Array;
  readonly manifestVersion: 1;
  readonly manifest: Uint8Array;
  readonly plaintextLength: number;
}

interface OpenBlobReaderInput {
  readonly vaultId: VaultId;
  readonly blobId: BlobId;
  readonly fileKey: Uint8Array;
  readonly manifest: Uint8Array;
  readonly signal?: AbortSignal;
}

interface BlobReader {
  stream(): AsyncIterable<Uint8Array>;
  readChunk(index: number): Promise<Uint8Array>;
  streamRange(start: number, endExclusive: number): AsyncIterable<Uint8Array>;
  close(): Promise<void>;
}

interface AttachmentStore {
  importBlob(input: ImportBlobInput): Promise<ImportedBlob>;
  openReader(input: OpenBlobReaderInput): Promise<BlobReader>;
  collectBlob(blobId: BlobId): Promise<void>;
  reconcile(knownBlobIds: ReadonlySet<BlobId>): Promise<ReconcileReport>;
  close(): Promise<void>;
}
```

Node `Readable` 可以作为异步可迭代源使用，因此包无需依赖 Electron 文件选择结果或接受源文件路径。取消时 importer 尝试结束异步迭代器；Node Readable 的异步迭代退出会销毁对应流。

`ImportedBlob.fileKey` 的所有权转交给调用方。包只清零自己的工作副本；后续 `application` 在 SQLCipher Repository 完成复制后负责清零调用方持有的 File Key。Reader 同样只清零其内部副本，不修改调用方传入的缓冲区。

## 7. 导入与原子发布

导入流程如下：

1. 校验 Store 状态、Vault ID、输入流和 `AbortSignal`；
2. 生成 Blob ID、File Key、Nonce 前缀和随机 staging 会话标识；
3. 以排他方式创建 staging 文件，禁止覆盖任何既有条目；
4. 将来源重新分块为固定 5 MiB 明文块，累计明文长度；
5. 一旦读取到第 `100 MB + 1` 个字节，立即返回附件过大错误；
6. 逐块加密，计算密文 SHA-256，并按序写入 staging；
7. 输入为空时生成一个零长度认证块；
8. 完成后同步文件内容、关闭句柄，并构造和回读校验 Manifest；
9. 确保最终父目录存在，将 staging 原子重命名到最终 Blob 路径；该成功重命名是导入提交点；
10. 最终路径已存在时拒绝覆盖；
11. 返回 Blob ID、File Key、Manifest 和总明文长度。

实现必须在读取、加密、写入和原子重命名前的最终化阶段检查外部取消信号以及 Store 的内部关闭信号。任何提交点前的失败或取消都执行一次收尾：结束输入迭代、关闭句柄、删除本次 staging 文件并清零包内 File Key 副本。原子重命名成功后，即使取消信号紧接着到达也返回成功结果，避免“调用方收到取消但最终 Blob 已发布”的歧义。清理失败不能覆盖最初的业务错误，但可以进入非敏感诊断记录。

导入返回成功只表示最终密文 Blob 已完整发布，不表示 SQLCipher 元数据已提交。`application` 后续按以下顺序编排：

```text
Blob 原子发布成功
        ↓
SQLCipher 事务写入附件元数据与引用
        ↓
调用方清零 File Key
```

发布后、数据库提交前崩溃会留下最终孤儿 Blob，由第 10 节的 reconcile 流程发现。

## 8. 读取、完整性与 Range

打开 Reader 时必须先取得租约，然后严格解析 Manifest、打开最终 Blob 并确认实际文件长度与所有密文块长度之和完全一致。文件截断或存在尾随数据均视为损坏。

读取每块的顺序固定为：

1. 使用 Manifest 计算密文偏移与长度；
2. 读取且只读取该块密文；
3. 计算 SHA-256，并使用恒定时间比较 Manifest 哈希；
4. 调用 Crypto 使用对应块上下文执行 AEAD 解密；
5. 验证明文长度；
6. 向调用方交付该块或所需切片。

`stream()` 按块顺序输出完整明文。`readChunk(index)` 返回单个完整明文块。`streamRange(start, endExclusive)` 只读取和解密覆盖范围的块，并裁剪首尾块；范围使用半开区间，必须满足 `0 <= start <= endExclusive <= plaintextLength`。空范围立即结束，但仍要求 Reader 已通过 Manifest 和文件长度校验。

哈希用于在执行 AEAD 前发现磁盘传输或存储损坏；AEAD 是真实性和上下文绑定的最终安全判断。任何哈希、认证、长度或格式失败都不尝试修复 Blob，也不返回未经认证的当前块。

流式读取可能已经向调用方交付早期已认证块后，才发现后续块损坏。这是常量内存流的明确语义；需要完整原子输出的上层功能必须先读入其自行管理的临时目标并在全部成功后发布。

## 9. 租约、垃圾回收与 Store 关闭

租约和删除状态由单个 Store 实例内部管理：

- `openReader()` 在首次异步文件操作前同步登记读取租约；
- Reader 的所有方法共享该租约，`close()` 幂等释放；
- `collectBlob()` 先同步尝试进入“删除中”状态；
- 存在读取租约时返回 `BLOB_IN_USE`，不改变文件；
- Blob 处于删除中时拒绝新 Reader；
- 删除操作结束后清除删除状态；
- 删除不存在的 Blob 视为幂等成功；
- 读取不存在的 Blob 返回 `BLOB_MISSING`。

`collectBlob()` 只负责物理 Blob，不判断 Attachment 引用。调用它之前，后续 `application` 必须使用领域规则和 SQLCipher Repository 确认引用归零并标记 `GC_PENDING`。

`AttachmentStore.close()`：

1. 原子标记 Store 已关闭并拒绝新操作；
2. 触发内部关闭信号，取消活跃导入和读取；
3. 等待包内操作完成收尾；
4. 关闭残余句柄并释放租约；
5. 清零包内仍持有的密钥副本。

关闭后所有业务方法返回稳定的 `STORE_CLOSED`，重复关闭成功返回。

## 10. 崩溃恢复与文件盘点

创建 Store 时扫描 staging：

- 只删除名称严格匹配本包 staging 格式、类型为普通文件且位于 staging 根目录直接子级的条目；
- 不跟随符号链接或重解析点；
- 未知文件、目录、链接和异常条目保持不变并写入恢复报告；
- 清理操作可重复执行。

最终 `blobs` 目录不在启动时自动清理。`reconcile(knownBlobIds)` 使用上层从 SQLCipher 取得的已知 Blob ID 集合，与规范最终文件盘点结果比较，返回：

```ts
interface ReconcileReport {
  readonly missingBlobIds: readonly BlobId[];
  readonly orphanBlobIds: readonly BlobId[];
  readonly unexpectedEntryCount: number;
}
```

- `missingBlobIds`：数据库已知，但规范最终文件不存在；
- `orphanBlobIds`：存在规范最终文件，但数据库未知；
- `unexpectedEntryCount`：目录结构、文件名或文件类型不符合规范。

报告使用稳定排序，不包含真实路径。reconcile 只报告，不自动删除、创建、移动或修复最终 Blob。上层核对数据库事务和当前操作后，才能显式调用 `collectBlob()` 清理孤儿。

崩溃窗口的处理结果为：

| 崩溃时点 | 磁盘结果 | 恢复行为 |
| --- | --- | --- |
| staging 写入期间 | 不完整 `.part` | 下次创建 Store 时清理 |
| 原子重命名前 | 完整或不完整 `.part` | 下次创建 Store 时清理 |
| 重命名后、数据库提交前 | 完整最终 Blob | reconcile 报告孤儿，由上层决定 GC |
| 数据库提交后 | 完整最终 Blob 与元数据 | 正常可用 |
| GC 标记后、文件删除前 | `GC_PENDING` 与最终 Blob | 上层重试幂等删除 |
| 文件删除后、元数据收尾前 | `GC_PENDING` 且文件缺失 | 幂等删除成功，上层完成元数据收尾 |

## 11. 错误模型

`attachments` 导出 `AttachmentStorageError`，只包含稳定 `code` 和通用消息。至少定义：

| 错误码 | 含义 |
| --- | --- |
| `INVALID_ATTACHMENT_INPUT` | 非法 ID、流、Range、块序号或参数 |
| `ATTACHMENT_TOO_LARGE` | 明文超过 100 MB |
| `OPERATION_ABORTED` | 外部取消或 Store 关闭导致当前操作中止 |
| `UNSUPPORTED_MANIFEST_VERSION` | Manifest 版本不受支持 |
| `MANIFEST_CORRUPT` | Manifest 结构、长度或约束非法 |
| `BLOB_ALREADY_EXISTS` | 最终 Blob 或排他目标已存在 |
| `BLOB_MISSING` | 读取目标不存在 |
| `BLOB_CORRUPT` | 文件长度、哈希、AEAD 或明文长度校验失败 |
| `BLOB_IN_USE` | Blob 有活跃租约，拒绝 GC |
| `DISK_FULL` | 文件系统报告空间不足 |
| `STORE_ALREADY_OPEN` | 同一进程已打开相同 Profile 根目录的 Store |
| `STORE_CLOSED` | Store 已关闭，拒绝新操作 |
| `ATTACHMENT_IO_FAILED` | 其他已归一化的文件系统或流错误 |

错误对象和消息不得包含 Profile 根路径、最终路径、源文件名、Blob 内容、Manifest 原文、File Key、Nonce、底层堆栈或操作系统原始错误消息。底层 `ENOENT`、`EEXIST`、`ENOSPC`、取消和 Crypto 认证失败按当前操作语义映射，未知错误统一收口。

## 12. 测试策略

测试只使用临时 Profile 目录、确定性输入内容和受控异步流，不依赖 Electron、SQLCipher、网络或同步状态。

### 12.1 Crypto 单元测试

- File Key 为 32 字节，Nonce 前缀为 16 字节，独立生成结果不同；
- 固定输入产生固定 Nonce 与 AAD 编码；
- 单块加解密往返；
- 替换 Vault ID、Blob ID、块序号、声明长度、Nonce 前缀、密文或 File Key 时认证失败；
- 非法长度、非法序号和未知格式版本被拒绝；
- 公共入口仍不导出任意 AAD 或任意算法能力。

### 12.2 Manifest 单元测试

- v1 编解码确定且往返一致；
- 0 字节、单块、整块、跨块和 100 MB 边界的长度与偏移正确；
- 未知版本、错误 Magic、截断、尾随字节、计数不一致、非法块长度、认证标签长度错误和整数溢出被拒绝；
- 解析不读取 Blob，也不分配由不可信长度直接决定的超大缓冲区。

### 12.3 导入与读取单元测试

- 0 字节、1 字节、5 MiB、5 MiB 加 1 字节、恰好 100 MB均成功；
- 100 MB 加 1 字节立即失败且没有最终 Blob 或 staging 残留；
- 完整读取、单块读取、块内 Range、跨块 Range、空 Range 和尾部 Range 结果正确；
- 输入分片与加密分块边界无关；
- 最终 Blob 不包含可搜索的已知明文；
- 既有 Blob 不被覆盖；
- 成功前最终路径不可见，成功后 staging 不存在。

### 12.4 损坏与错误单元测试

- 分别篡改密文、SHA-256、Manifest、块顺序、文件长度和添加尾随数据；
- 错误 Vault、Blob、File Key 和 Nonce 上下文返回 `BLOB_CORRUPT`；
- 缺失文件、目标冲突、空间不足和一般 I/O 错误映射到固定错误；
- 错误对象不包含路径、用户内容、密钥或底层错误文本。

### 12.5 取消、租约与恢复单元测试

- 在读取、加密、写入和原子重命名前的最终化阶段取消，句柄关闭且 staging 清理；提交点后的迟到取消仍返回成功；
- Reader 活跃时 GC 返回 `BLOB_IN_USE`，关闭 Reader 后删除成功；
- 删除状态阻止新 Reader，删除不存在文件幂等成功；
- `close()` 取消活跃操作、释放资源，之后所有操作返回 `STORE_CLOSED`；
- 同一进程对相同规范 Profile 根目录重复创建 Store 返回 `STORE_ALREADY_OPEN`；
- 启动恢复只删除规范 staging 普通文件，保留未知文件、目录和链接；
- reconcile 稳定报告缺失、孤儿和异常条目，且不修改最终 Blob。

### 12.6 边界验证

- `@notera/attachments` 可从 workspace 根正常解析；
- Dependency Cruiser 证明 `attachments` 只依赖 Domain、Crypto 与 Node/外部依赖；
- Crypto、Attachments 和应用 TypeScript 检查通过；
- 公共 API 不暴露任意文件路径操作、底层文件句柄、Sodium API 或任意 AAD。

## 13. 实施与验证约束

后续实施计划必须遵守仓库 `AGENTS.md`：

- 使用中文编写；
- 按完整、可独立测试的功能模块划分；
- 每个模块同时包含目标、逻辑、接口、文件、单元测试、精确测试命令和完成后的提交；
- 测试和实现属于同一个模块任务；
- 实施过程中只运行当前模块相关单元测试；
- 每完成一个完整模块提交一次；
- 不进行逐模块代码审核、规格审核或额外审核代理；
- 所有模块完成后只进行一次必要最终验证；
- 不把同步协议、同步引擎、云端 API、同步 Outbox、同步冲突或远端附件状态纳入计划。

## 14. 完成标准

- `packages/attachments` 提供版本化 Manifest、流式导入、完整/单块/Range 读取、租约 GC、恢复和生命周期 API；
- 明文从不写入 Profile 的 staging 或 Blob 路径；
- 导入和读取不把完整附件载入内存；
- 100 MB 上限、5 MiB 分块、Nonce、AAD、哈希和 AEAD 规则固定且有测试；
- Blob 只在完整成功后原子发布，失败和取消不会留下可用的半成品；
- 崩溃后 staging 可安全清理，最终孤儿 Blob 只报告不自动删除；
- 活跃读取期间物理删除被包内租约阻止；
- Store 关闭可取消活跃操作并释放敏感资源；
- 错误和公共 API 不泄露路径、密钥、用户内容或底层实现；
- 不包含 SQLCipher 编排、Media Gateway、缩略图、Electron/IPC/UI 或任何同步能力；
- 相关单元测试、类型检查、依赖检查及本次改动需要的最终验证全部通过。
