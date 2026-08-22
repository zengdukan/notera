# Notera 离线附件基础设施实施计划

> **执行要求：** 实施时必须使用 `superpowers:executing-plans`，按下列完整功能模块顺序执行并使用复选框跟踪；遵守仓库 `AGENTS.md`，不使用子代理审核，不拆分测试、实现和验证提交。

**目标：** 实现版本化附件块密码学、二进制 Manifest、流式原子导入、认证读取、租约垃圾回收和安全崩溃恢复，为后续 Application 层提供离线密文 Blob 基础设施。

**架构：** `@notera/crypto` 增加固定格式的附件块加解密能力，但继续保持无项目内依赖且不公开任意 AAD。`@notera/attachments` 只依赖 Domain、Crypto 和 Node 标准库，以单一密文 Blob、SQLCipher 外置 Manifest、显式 Store 生命周期和确定性路径实现附件文件生命周期，不接触数据库、Electron、IPC、UI 或同步能力。

**技术栈：** TypeScript、Node.js `fs/promises`/`crypto`/异步迭代器、Libsodium XChaCha20-Poly1305、Jest、ts-jest、Dependency Cruiser。

**规格依据：** `docs/superpowers/specs/2026-08-22-offline-attachments-design.md`

---

## 文件结构与职责

计划完成后，相关文件结构如下：

```text
packages/crypto/src/
├─ attachment-chunks.ts                 # 附件 UUID、Nonce、AAD 与固定块 AEAD
├─ random.ts                            # 固定长度 File Key 与 Nonce 前缀生成
├─ parameters.ts                        # 附件密码学固定参数
├─ index.ts                             # 仅导出受约束附件密码学 API
└─ __tests__/attachment-chunks.test.ts  # 附件密码学格式、认证与误用防护

packages/attachments/src/
├─ constants.ts                         # Manifest v1、块大小、上限和文件命名常量
├─ errors.ts                            # 稳定错误码与底层错误归一化
├─ types.ts                             # Store、导入、Reader、恢复和报告公共类型
├─ manifest.ts                          # NTAM v1 编解码、校验与块偏移
├─ paths.ts                             # 从 Profile 根和 Blob ID 推导安全内部路径
├─ cancellation.ts                      # 外部 AbortSignal 与 Store 关闭信号组合
├─ chunker.ts                           # 任意输入分片重组为固定 5 MiB 块
├─ importer.ts                          # 流式加密、staging、刷盘与原子发布
├─ leases.ts                            # 读取租约与删除状态互斥
├─ reader.ts                            # 哈希/AEAD 校验和完整/块/Range 读取
├─ recovery.ts                          # staging 清理、最终 Blob 盘点和 reconcile
├─ store.ts                             # 单实例注册、生命周期和能力编排
├─ index.ts                             # 稳定公共入口
└─ __tests__/
   ├─ helpers.ts                        # 临时 Profile、受控流和测试字节辅助
   ├─ manifest.test.ts                  # Manifest 与错误模型
   ├─ import.test.ts                    # 导入、边界、取消和原子发布
   ├─ reader.test.ts                    # 完整性、Range、租约与关闭
   └─ recovery.test.ts                  # staging、盘点、reconcile 与公共边界

src/__tests__/workspace-resolution.test.ts # 验证附件公共入口与内部能力不泄露
```

以下文件保持职责单一：Manifest 不访问文件系统；Reader 不负责数据库引用；Recovery 不自动删除最终孤儿；Store 只编排组件和生命周期，不重复密码学或格式解析逻辑。

---

## 功能模块 1：受约束的附件块密码学

- [ ] 完成本模块的测试、实现、相关单元验证和一次提交。

**目标：** 为附件包提供固定 File Key、固定 Nonce 和固定 AAD 的 XChaCha20-Poly1305 块能力，同时保持 Crypto 无 Notera 项目内依赖、不公开任意算法或任意 AAD。

**涉及文件：**

- 创建：`packages/crypto/src/attachment-chunks.ts`
- 创建：`packages/crypto/src/__tests__/attachment-chunks.test.ts`
- 修改：`packages/crypto/src/random.ts`
- 修改：`packages/crypto/src/parameters.ts`
- 修改：`packages/crypto/src/index.ts`
- 修改：`packages/crypto/src/__tests__/primitives.test.ts`
- 修改：`packages/crypto/src/__tests__/kdf.test.ts`

**功能逻辑：**

1. 在 `parameters.ts` 固定并导出：

```ts
export const ATTACHMENT_FORMAT_VERSION = 1 as const;
export const ATTACHMENT_NONCE_PREFIX_BYTES = 16;
```

2. `random.ts` 复用私有 `generateRandomBytes()`，新增：

```ts
export async function generateAttachmentFileKey(): Promise<Uint8Array>;
export async function generateAttachmentNoncePrefix(): Promise<Uint8Array>;
```

File Key 固定 32 字节，Nonce 前缀固定 16 字节，不接受调用方长度或随机源。

3. `attachment-chunks.ts` 定义且只公开受约束上下文：

```ts
export interface AttachmentChunkContext {
  readonly formatVersion: 1;
  readonly vaultId: string;
  readonly blobId: string;
  readonly chunkIndex: number;
  readonly plaintextLength: number;
}

export function encodeAttachmentChunkAad(
  context: AttachmentChunkContext,
): Uint8Array;

export function buildAttachmentChunkNonce(
  noncePrefix: Uint8Array,
  chunkIndex: number,
): Uint8Array;

export function encryptAttachmentChunk(
  plaintext: Uint8Array,
  fileKey: Uint8Array,
  noncePrefix: Uint8Array,
  context: AttachmentChunkContext,
): Promise<Uint8Array>;

export function decryptAttachmentChunk(
  ciphertext: Uint8Array,
  fileKey: Uint8Array,
  noncePrefix: Uint8Array,
  context: AttachmentChunkContext,
): Promise<Uint8Array>;
```

`encodeAttachmentChunkAad()` 先校验两个 ID 均为规范小写 UUID，再按规格写入 `uint16(domainLength)`、固定域 UTF-8、`uint16(version)`、两个 16 字节 UUID、`uint64(chunkIndex)` 和 `uint32(plaintextLength)`。序号必须为非负安全整数，明文块长度必须位于 `0..5 MiB`，未知格式版本在 AEAD 前返回 `UNSUPPORTED_CRYPTO_VERSION`。

4. `buildAttachmentChunkNonce()` 构造 `16 字节前缀 || uint64_be(chunkIndex)`。加解密入口校验 File Key、Nonce 前缀、明文/密文长度和上下文一致后，调用包内已有 `encryptAead()`/`decryptAead()`；解密结果长度与声明不一致返回 `INVALID_CRYPTO_INPUT`。

5. `index.ts` 只导出固定参数、随机生成和加解密入口及 `AttachmentChunkContext` 类型。`encodeAttachmentChunkAad()` 与 `buildAttachmentChunkNonce()` 供包内测试直接导入，不从公共入口导出；`encryptAead`、`decryptAead`、Sodium 初始化和参数覆盖仍保持内部能力。

**单元测试：**

- 固定上下文的 AAD 和 Nonce 十六进制结果完全匹配规格字节顺序；
- File Key 为 32 字节、Nonce 前缀为 16 字节，独立生成值不同；
- 0 字节、普通字节和 5 MiB 边界块正常往返，密文比明文多 16 字节；
- 分别替换 Vault ID、Blob ID、块序号、声明长度、Nonce 前缀、密文和 File Key，认证失败；
- 大写/非 UUID、负数/非整数/超安全整数序号、超 5 MiB 长度、错误 Key/前缀长度和版本 2 被拒绝；
- `publicApi` 不包含 `encryptAead`、`decryptAead`、`encodeAttachmentChunkAad`、`buildAttachmentChunkNonce` 或任意随机字节函数。

**精确测试命令：**

```powershell
npm run test:unit -- packages/crypto/src/__tests__/attachment-chunks.test.ts packages/crypto/src/__tests__/primitives.test.ts packages/crypto/src/__tests__/kdf.test.ts --runInBand
```

预期：三个测试文件全部通过，0 个失败。

**完成后提交：**

```powershell
git add packages/crypto/src/attachment-chunks.ts packages/crypto/src/random.ts packages/crypto/src/parameters.ts packages/crypto/src/index.ts packages/crypto/src/__tests__/attachment-chunks.test.ts packages/crypto/src/__tests__/primitives.test.ts packages/crypto/src/__tests__/kdf.test.ts
git commit -m "feat(crypto): add attachment chunk encryption"
```

---

## 功能模块 2：Manifest v1 与附件错误模型

- [ ] 完成本模块的测试、实现、相关单元验证和一次提交。

**目标：** 实现与文件系统无关的 NTAM Manifest v1 确定性编码、严格解析、块偏移计算及稳定附件错误，为导入和读取建立不可变格式边界。

**涉及文件：**

- 创建：`packages/attachments/src/constants.ts`
- 创建：`packages/attachments/src/errors.ts`
- 创建：`packages/attachments/src/types.ts`
- 创建：`packages/attachments/src/manifest.ts`
- 创建：`packages/attachments/src/__tests__/manifest.test.ts`

**功能逻辑：**

1. `constants.ts` 固定：

```ts
export const ATTACHMENT_MANIFEST_VERSION = 1 as const;
export const ATTACHMENT_CHUNK_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;
export const MANIFEST_HEADER_BYTES = 38;
export const MANIFEST_CHUNK_RECORD_BYTES = 40;
export const CIPHERTEXT_HASH_BYTES = 32;
```

Magic 固定为 ASCII `NTAM`；最大块数为 20，零字节附件仍有一个认证块。

2. `errors.ts` 定义 `AttachmentStorageError` 与固定安全消息：

```ts
export type AttachmentStorageErrorCode =
  | 'INVALID_ATTACHMENT_INPUT'
  | 'ATTACHMENT_TOO_LARGE'
  | 'OPERATION_ABORTED'
  | 'UNSUPPORTED_MANIFEST_VERSION'
  | 'MANIFEST_CORRUPT'
  | 'BLOB_ALREADY_EXISTS'
  | 'BLOB_MISSING'
  | 'BLOB_CORRUPT'
  | 'BLOB_IN_USE'
  | 'DISK_FULL'
  | 'STORE_ALREADY_OPEN'
  | 'STORE_CLOSED'
  | 'READER_CLOSED'
  | 'ATTACHMENT_IO_FAILED';
```

`mapAttachmentError()` 保留已有 `AttachmentStorageError`，把 `AbortError` 映射为 `OPERATION_ABORTED`、`ENOSPC` 映射为 `DISK_FULL`，其余未知底层错误映射为 `ATTACHMENT_IO_FAILED`。调用处根据语义单独处理 `ENOENT` 和 `EEXIST`，错误消息永不拼接原始异常文本。

3. `types.ts` 定义 Manifest 内部模型：

```ts
export interface AttachmentManifestChunk {
  readonly index: number;
  readonly plaintextOffset: number;
  readonly ciphertextOffset: number;
  readonly plaintextLength: number;
  readonly ciphertextLength: number;
  readonly ciphertextSha256: Uint8Array;
}

export interface AttachmentManifestV1 {
  readonly version: 1;
  readonly chunkSize: number;
  readonly noncePrefix: Uint8Array;
  readonly plaintextLength: number;
  readonly ciphertextLength: number;
  readonly chunks: readonly AttachmentManifestChunk[];
}
```

4. `manifest.ts` 提供内部接口：

```ts
export interface ManifestChunkInput {
  readonly plaintextLength: number;
  readonly ciphertextLength: number;
  readonly ciphertextSha256: Uint8Array;
}

export function encodeManifestV1(input: {
  noncePrefix: Uint8Array;
  plaintextLength: number;
  chunks: readonly ManifestChunkInput[];
}): Uint8Array;

export function decodeManifest(bytes: Uint8Array): AttachmentManifestV1;
```

编码严格使用规格中的 38 字节 Header 和每块 40 字节记录。解析先从实际输入长度推导可接受块数，再分配固定上限的小数组；不得用不可信字段直接分配缓冲区。校验 `totalLength <= 100 MB`、`chunkCount === max(1, ceil(total/5 MiB))`、非末块为 5 MiB、末块精确补足总长度、密文长度等于明文加 16、Manifest 总长度精确一致。所有输出复制 TypedArray 并冻结对象/数组外壳，调用方修改输入不能改变解析结果。

**单元测试：**

- 0 字节、1 字节、5 MiB、5 MiB 加 1 字节和 100 MB 的编码长度、块数、明文/密文偏移正确；
- 固定输入编码为固定十六进制 Header 和块记录，重复编码完全相同；
- 编解码往返，修改输入和返回数组外壳不影响内部结果；
- 错误 Magic、版本、块大小、Nonce 长度、截断、尾随字节、块数、块长度、认证标签长度、哈希长度、总长溢出和超过 100 MB 均返回对应固定错误；
- 版本 2 返回 `UNSUPPORTED_MANIFEST_VERSION`，其他结构损坏返回 `MANIFEST_CORRUPT`；
- 模拟 `ENOSPC`、AbortError 和含敏感消息的一般错误，验证映射后的 code/message 不泄露原文。

**精确测试命令：**

```powershell
npm run test:unit -- packages/attachments/src/__tests__/manifest.test.ts --runInBand
```

预期：该测试文件全部通过，0 个失败。

**完成后提交：**

```powershell
git add packages/attachments/src/constants.ts packages/attachments/src/errors.ts packages/attachments/src/types.ts packages/attachments/src/manifest.ts packages/attachments/src/__tests__/manifest.test.ts
git commit -m "feat(attachments): define encrypted blob manifest"
```

---

## 功能模块 3：流式导入、staging 恢复与原子发布

- [ ] 完成本模块的测试、实现、相关单元验证和一次提交。

**目标：** 创建具有单实例生命周期的 `AttachmentStore`，安全初始化 Profile 内部目录、清理规范 staging 残留，并把任意异步字节流以常量分块内存加密后原子发布为单一密文 Blob。

**涉及文件：**

- 创建：`packages/attachments/src/paths.ts`
- 创建：`packages/attachments/src/cancellation.ts`
- 创建：`packages/attachments/src/chunker.ts`
- 创建：`packages/attachments/src/importer.ts`
- 创建：`packages/attachments/src/recovery.ts`
- 创建：`packages/attachments/src/store.ts`
- 创建：`packages/attachments/src/__tests__/helpers.ts`
- 创建：`packages/attachments/src/__tests__/import.test.ts`
- 修改：`packages/attachments/src/types.ts`
- 修改：`packages/attachments/src/errors.ts`

**功能逻辑：**

1. `paths.ts` 先创建 Profile 根目录，再用 `fs.realpath()` 得到规范真实根路径并只暴露内部路径对象；模块级单实例注册和全部子路径均使用该结果，避免相对路径、链接路径或大小写表现差异绕过同进程保护。Blob 路径固定为 `blobs/<uuid去横线前两位>/<uuid>.blob`，staging 文件固定为 `<blobId>.<32位小写十六进制会话标识>.part`。Blob ID 必须先通过 Domain `asBlobId()`；公开导入不接受源路径或目标路径。

2. `store.ts` 使用模块级 `Set<string>` 注册规范 Profile 根目录。同一进程重复打开返回 `STORE_ALREADY_OPEN`；失败创建必须释放注册。成功创建 `blobs/`、`staging/` 后调用 `recoverStaging()`，并在 Store 上保存不可变摘要：

```ts
export interface StartupRecoveryReport {
  readonly removedStagingFileCount: number;
  readonly unexpectedEntryCount: number;
}

export interface AttachmentStore {
  readonly startupRecovery: StartupRecoveryReport;
  importBlob(input: ImportBlobInput): Promise<ImportedBlob>;
  close(): Promise<void>;
}

export function createAttachmentStore(input: {
  readonly profileRoot: string;
}): Promise<AttachmentStore>;
```

3. `recovery.ts` 的启动扫描只使用 `readdir({withFileTypes:true})` 和必要的 `lstat()` 删除 staging 根目录直接子级中名称严格匹配、类型为普通文件的 `.part`。目录、符号链接、重解析点和未知文件保持不动，仅增加 `unexpectedEntryCount`；报告不包含名称或路径。

4. `cancellation.ts` 组合调用方 `AbortSignal` 与 Store 内部关闭控制器，提供同步 `throwIfAborted()` 及监听清理。已经取消的导入在创建任何文件前失败；取消时调用输入迭代器的 `return()`。

5. `chunker.ts` 消费 `AsyncIterable<Uint8Array>`，验证每个产出确为 `Uint8Array`，把任意输入分片重组为最多 5 MiB 的块。它逐段复制，内部待处理缓冲不超过一个明文块；累计读取到 100 MB 后，只再探测一个字节，存在第 `100 MB + 1` 字节即返回 `ATTACHMENT_TOO_LARGE`。空输入产出一个零长度块。

6. `importer.ts` 实现：

```ts
export interface ImportBlobInput {
  readonly vaultId: VaultId;
  readonly source: AsyncIterable<Uint8Array>;
  readonly signal?: AbortSignal;
}

export interface ImportedBlob {
  readonly blobId: BlobId;
  readonly fileKey: Uint8Array;
  readonly manifestVersion: 1;
  readonly manifest: Uint8Array;
  readonly plaintextLength: number;
}
```

生成 Blob UUID、File Key、Nonce 前缀和 staging 会话 ID；以 `open(..., 'wx', 0o600)` 排他创建临时文件；逐块调用 Crypto 加密、用 `createHash('sha256')` 计算密文哈希，并由内部 `writeAll(handle, bytes)` 循环处理 `FileHandle.write()` 的短写和零进度异常。完成后 `FileHandle.sync()`、关闭文件、编码并立即解码 Manifest 进行内部确认，再在同一 Profile 文件系统内重命名到最终路径。

7. 原子重命名是提交点。提交点前每次昂贵操作之间检查取消；失败时保留首个稳定错误，关闭句柄、结束输入迭代、删除本次 staging 并清零内部 File Key。提交点后不再把迟到取消转换为失败，返回调用方拥有的新 File Key 副本，并清零包内工作副本。最终路径存在时返回 `BLOB_ALREADY_EXISTS`，绝不覆盖。

8. 本模块的 `AttachmentStore.close()` 标记关闭、触发内部取消、等待活跃导入收尾、释放根目录注册并幂等返回。关闭后导入返回 `STORE_CLOSED`；后续模块在同一生命周期中加入 Reader。

**单元测试：**

- 临时 Profile 初始化出 `blobs/`、`staging/`，规范 staging 文件被清理，未知文件/目录/链接保留且报告计数正确；
- 相同规范根目录（包括不同相对写法）不能重复打开，关闭后可以重新打开；
- 输入分片为 1 字节、不规则分片和大于 5 MiB 单分片时，最终 Manifest 块边界相同；
- 0 字节、1 字节、5 MiB、5 MiB 加 1 字节和恰好 100 MB 导入成功；100 MB 加 1 字节失败；
- 逐块解密测试辅助确认内容完全一致，最终 Blob 不包含已知连续明文；
- 导入成功后 staging 不存在且最终路径存在；既有最终 Blob 不被覆盖；
- 输入流抛错、非法输入分片、读取中取消、最后一块后/重命名前取消均关闭句柄且不留下 staging 或最终 Blob；
- 使用受控写入适配验证短写会继续直至完整，零进度写入归一化失败且完成清理；
- 提交点后的迟到取消仍返回成功；
- `close()` 取消活跃导入、等待清理并拒绝新导入；
- `ENOSPC` 和未知 I/O 失败映射稳定且错误不含根目录、文件名、Blob 内容或底层消息。

**精确测试命令：**

```powershell
npm run test:unit -- packages/attachments/src/__tests__/manifest.test.ts packages/attachments/src/__tests__/import.test.ts --runInBand
```

预期：Manifest 和 Import 两个测试文件全部通过，0 个失败。

**完成后提交：**

```powershell
git add packages/attachments/src/paths.ts packages/attachments/src/cancellation.ts packages/attachments/src/chunker.ts packages/attachments/src/importer.ts packages/attachments/src/recovery.ts packages/attachments/src/store.ts packages/attachments/src/types.ts packages/attachments/src/errors.ts packages/attachments/src/__tests__/helpers.ts packages/attachments/src/__tests__/import.test.ts
git commit -m "feat(attachments): import encrypted blobs atomically"
```

---

## 功能模块 4：认证读取、Range、租约垃圾回收与完整关闭

- [ ] 完成本模块的测试、实现、相关单元验证和一次提交。

**目标：** 提供完整、单块和明文字节范围的流式认证读取，以租约消除读取与删除竞争，并使 Store 关闭能够取消 Reader、关闭句柄和清零密钥副本。

**涉及文件：**

- 创建：`packages/attachments/src/leases.ts`
- 创建：`packages/attachments/src/reader.ts`
- 创建：`packages/attachments/src/__tests__/reader.test.ts`
- 修改：`packages/attachments/src/store.ts`
- 修改：`packages/attachments/src/types.ts`
- 修改：`packages/attachments/src/errors.ts`
- 修改：`packages/attachments/src/__tests__/helpers.ts`

**功能逻辑：**

1. `leases.ts` 维护每个 Blob 的读取数和删除状态。`acquireReader(blobId)` 在任何 `await` 前同步登记，并返回幂等 release；`beginDelete(blobId)` 在有 Reader 时返回 `BLOB_IN_USE`，成功后阻止新 Reader，直到 `finally` 清除状态。删除中的 Blob 新建 Reader 同样返回 `BLOB_IN_USE`；Store 关闭后两种入口均拒绝。

2. `reader.ts` 定义：

```ts
export interface OpenBlobReaderInput {
  readonly vaultId: VaultId;
  readonly blobId: BlobId;
  readonly fileKey: Uint8Array;
  readonly manifest: Uint8Array;
  readonly signal?: AbortSignal;
}

export interface BlobReader {
  stream(): AsyncIterable<Uint8Array>;
  readChunk(index: number): Promise<Uint8Array>;
  streamRange(start: number, endExclusive: number): AsyncIterable<Uint8Array>;
  close(): Promise<void>;
}
```

`openReader()` 的顺序固定为：同步取得租约、解析 Manifest、复制 File Key/Manifest 所需字节、打开最终文件、`stat()` 确认文件长度严格等于 Manifest 密文总长。任一步失败均关闭句柄、清零副本并释放租约。缺失文件映射 `BLOB_MISSING`，Manifest 结构错误保留 Manifest 错误，文件/内容不一致映射 `BLOB_CORRUPT`。

3. 所有块读取使用带绝对 position 的循环 `FileHandle.read()`，拒绝短读。对每块先用 `createHash('sha256')` 和 `timingSafeEqual()` 校验密文哈希，再调用 `decryptAttachmentChunk()`，最后验证返回明文长度。Crypto 认证失败在 Reader 边界统一映射 `BLOB_CORRUPT`。

4. `stream()` 顺序输出全部认证块；`readChunk()` 只允许 `0 <= index < chunkCount` 的整数；`streamRange()` 验证安全整数半开区间 `0 <= start <= endExclusive <= plaintextLength`，只读取覆盖范围的块并裁剪首尾。空 Range 不读取块，但 Reader 必须已经通过 Manifest 和文件长度检查。

5. Reader 支持多个位置读取操作，但跟踪活跃操作数。`close()` 先标记关闭并触发 Reader 内部取消，等待活跃读取退出，再关闭 FileHandle、清零 File Key 副本并释放租约；重复关闭成功。调用方 AbortSignal 触发相同关闭流程，避免取消后长期持有租约；关闭后的 Reader 方法返回 `READER_CLOSED`。

6. `store.ts` 新增：

```ts
openReader(input: OpenBlobReaderInput): Promise<BlobReader>;
collectBlob(blobId: BlobId): Promise<void>;
```

`collectBlob()` 通过租约注册表进入删除状态，只删除规范最终文件且不递归；`ENOENT` 视为幂等成功。Store `close()` 先拒绝新工作、取消导入和全部 Reader，等待收尾后释放单实例注册。若导入已越过原子提交点，它仍返回成功结果再完成 Store 关闭。

**单元测试：**

- 读取 0 字节、单块、多块和 100 MB Blob；完整输出与原输入一致；
- `readChunk()` 返回正确块，非法序号返回 `INVALID_ATTACHMENT_INPUT`；
- 覆盖块内、跨块、全文件、尾部、空区间以及非法 Range；只读取范围覆盖块；
- 分别篡改密文、SHA-256、Manifest、块顺序、文件截断和尾随字节，返回稳定损坏错误；
- 替换 Vault ID、Blob ID、File Key 和 Nonce 前缀后认证失败；不返回未经认证的当前块；
- Reader 持有期间 `collectBlob()` 返回 `BLOB_IN_USE` 且文件保留；Reader 关闭后删除成功；
- 删除状态期间新 Reader 被拒绝，删除不存在 Blob 幂等成功；
- 外部取消和 Store `close()` 中止活跃读取、关闭句柄、清零内部 Key 并释放租约；关闭后的 Store/Reader 拒绝新读取；
- 错误对象不包含 Profile 路径、Manifest、密钥、底层异常或用户字节。

**精确测试命令：**

```powershell
npm run test:unit -- packages/attachments/src/__tests__/reader.test.ts --runInBand
```

预期：该测试文件全部通过，0 个失败。

**完成后提交：**

```powershell
git add packages/attachments/src/leases.ts packages/attachments/src/reader.ts packages/attachments/src/store.ts packages/attachments/src/types.ts packages/attachments/src/errors.ts packages/attachments/src/__tests__/helpers.ts packages/attachments/src/__tests__/reader.test.ts
git commit -m "feat(attachments): read and collect encrypted blobs"
```

---

## 功能模块 5：最终 Blob 对账与公共 API 收口

- [ ] 完成本模块的测试、实现、相关单元验证和一次提交。

**目标：** 只读盘点规范最终 Blob，与上层提供的数据库 Blob ID 集合生成稳定 reconcile 报告，并把附件包公共入口收口为后续 Application 层需要的安全能力。

**涉及文件：**

- 创建：`packages/attachments/src/__tests__/recovery.test.ts`
- 修改：`packages/attachments/src/recovery.ts`
- 修改：`packages/attachments/src/store.ts`
- 修改：`packages/attachments/src/types.ts`
- 修改：`packages/attachments/src/index.ts`
- 修改：`packages/attachments/src/__tests__/helpers.ts`
- 修改：`src/__tests__/workspace-resolution.test.ts`

**功能逻辑：**

1. `recovery.ts` 只读遍历 `blobs/`：一级目录必须是两个小写十六进制字符；二级文件必须是规范小写 Blob UUID、扩展名 `.blob`、前缀与父目录一致且类型为普通文件。未知目录、文件、链接、重解析点和更深层级只计为异常，不跟随、不删除且不返回路径。

2. `store.ts` 增加：

```ts
export interface ReconcileReport {
  readonly missingBlobIds: readonly BlobId[];
  readonly orphanBlobIds: readonly BlobId[];
  readonly unexpectedEntryCount: number;
}

reconcile(knownBlobIds: ReadonlySet<BlobId>): Promise<ReconcileReport>;
```

先复制并逐个运行 Domain ID 校验，拒绝运行期间被调用方修改的 Set。`missingBlobIds = known - disk`，`orphanBlobIds = disk - known`，两个数组按 UUID 字典序稳定排序并冻结；对账期间不创建、删除、移动、解析或修复任何最终 Blob。

3. `index.ts` 只导出：

```ts
export {
  AttachmentStorageError,
  type AttachmentStorageErrorCode,
} from './errors';
export {
  ATTACHMENT_CHUNK_BYTES,
  ATTACHMENT_MANIFEST_VERSION,
  MAX_ATTACHMENT_BYTES,
} from './constants';
export { createAttachmentStore } from './store';
export type {
  AttachmentStore,
  BlobReader,
  ImportedBlob,
  ImportBlobInput,
  OpenBlobReaderInput,
  ReconcileReport,
  StartupRecoveryReport,
} from './types';
```

不得导出 Profile 内部路径、Manifest 编解码器、LeaseRegistry、Importer、Reader 实现、Recovery 扫描器、文件句柄、任意删除路径能力或 Crypto/Sodium 内部原语。

4. `workspace-resolution.test.ts` 证明 `@notera/attachments` 正常解析，`createAttachmentStore` 与三个公共常量可用，并断言 `encodeManifestV1`、`deriveBlobPath`、`LeaseRegistry`、`encryptAead` 等内部名字未公开。

**单元测试：**

- 健康目录和空目录返回空差异；
- 已知但缺失、存在但未知和二者同时存在时返回精确稳定排序；
- 错误前缀、错误扩展名、前缀不一致、目录伪装 Blob、文件伪装前缀、链接和嵌套未知项计数正确；
- 对账前后文件树内容和哈希不变，证明不自动修复或删除；
- 调用期间修改原 Set 不影响本次结果，非法 ID 输入返回 `INVALID_ATTACHMENT_INPUT`；
- 报告不含真实路径或异常条目名称；Store 关闭后 reconcile 返回 `STORE_CLOSED`；
- Workspace 公共入口存在且内部模块没有泄露。

**精确测试命令：**

```powershell
npm run test:unit -- packages/attachments/src/__tests__/recovery.test.ts src/__tests__/workspace-resolution.test.ts --runInBand
```

预期：两个测试文件全部通过，0 个失败。

**完成后提交：**

```powershell
git add packages/attachments/src/recovery.ts packages/attachments/src/store.ts packages/attachments/src/types.ts packages/attachments/src/index.ts packages/attachments/src/__tests__/helpers.ts packages/attachments/src/__tests__/recovery.test.ts src/__tests__/workspace-resolution.test.ts
git commit -m "feat(attachments): reconcile encrypted blob storage"
```

---

## 最终验证

五个功能模块全部完成并分别提交后，只执行以下一次必要最终验证：

```powershell
npm run test:unit -- packages/crypto/src/__tests__/attachment-chunks.test.ts packages/crypto/src/__tests__/primitives.test.ts packages/crypto/src/__tests__/kdf.test.ts packages/attachments/src/__tests__ src/__tests__/workspace-resolution.test.ts --runInBand
npm run typecheck -w @notera/crypto
npm run typecheck -w @notera/attachments
npm run typecheck:app
npm run check:deps
npm run lint
git diff --check
```

预期结果：

- Crypto 附件能力、Attachments 全部单元测试和 Workspace 解析测试通过，0 个失败；
- Crypto、Attachments 与应用 TypeScript 检查通过；
- Dependency Cruiser 显示 0 个违规，Attachments 只依赖 Domain、Crypto 与 Node/外部依赖，Crypto 仍无项目内依赖；
- ESLint 通过；
- `git diff --check` 无输出；
- 工作区只保留用户原有且未纳入计划的未跟踪内容。

本次不运行 SQLCipher 原生运行时测试或生产构建，因为附件包不修改 SQLCipher、Electron 入口、Webpack 或 Renderer。若最终验证暴露确由本次改动造成的 TypeScript、依赖或 lint 问题，只修复失败原因并复测对应失败检查；已经通过且未受修复影响的检查不重复运行。若修复涉及某个功能模块的逻辑，追加到该模块提交；若仅是所有模块完成后才暴露的统一格式或应用类型适配，创建一次收尾提交：

```powershell
git add packages/crypto packages/attachments src/__tests__/workspace-resolution.test.ts
git commit -m "style(attachments): satisfy final checks"
```

## 完成标准

- 五个完整功能模块各完成一次提交，不按测试、实现或验证拆分；
- Crypto 提供固定附件 File Key、Nonce、AAD 和块 AEAD，且不依赖 Domain、不公开任意 AAD；
- Manifest v1 字节布局、验证规则和版本行为固定；
- 导入以 5 MiB 分块、100 MB 上限和包内存上限运行，明文不写入 Profile；
- Blob 仅在完整成功后原子发布，提交点前失败/取消无 staging 残留，提交点后迟到取消返回成功；
- Reader 支持完整、单块和 Range 读取，并在交付每块前验证 SHA-256 与 AEAD；
- 活跃 Reader 阻止物理删除，Store 关闭终止操作、释放句柄/租约并清零内部密钥副本；
- 启动恢复只清理规范 staging 普通文件，reconcile 只报告最终 Blob 差异且不自动修改；
- 公共 API 和错误不泄露真实路径、文件句柄、密钥、Manifest 原文、用户内容或底层实现；
- 不包含 SQLCipher 编排、Media Gateway、缩略图、Electron/IPC/UI 或同步相关能力；
- 相关单元测试和必要最终验证全部通过。
