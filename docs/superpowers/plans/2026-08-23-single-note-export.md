# Notera 单笔记 Markdown/PDF 导出实施计划

> **执行要求：** 使用 `superpowers:executing-plans` 在当前会话按功能模块顺序实施。遵守仓库 `AGENTS.md`：不使用子代理或重复审核；每个模块把测试与实现一起完成并提交；所有模块完成后只执行一次必要的最终验证。

**目标：** 为已解锁 Profile 实现当前单篇已保存笔记的 Markdown/PDF 明文导出；无附件时直接输出正文文件，有附件时输出包含正文与 `assets/` 的 ZIP，并通过现有 Operation 事件向 UI 发布安全的进度和完成通知。

**架构：** 新增纯逻辑 `@notera/export` 包处理 ADF、Markdown、附件引用和文件名，Main 导出协调器负责数据库快照、附件 Reader、原子文件/ZIP 写入与长任务，隐藏的沙箱化 Atlaskit Renderer 负责 PDF。PDF 图片通过隐藏窗口独立 Session 上的任务级资源协议读取，打印后的附件链接经安全后处理改写为 `assets/` 相对 URI。

**技术栈：** TypeScript 5.8、Electron 42、React 18、Atlaskit Renderer 136、Zod 4、Node.js Streams/File System、Archiver 7、pdf-lib 1.17、Jest 29、ts-jest、Webpack 5。

**设计规格：** `docs/superpowers/specs/2026-08-23-single-note-export-design.md`

---

## 范围与实施顺序

本计划包含六个完整、可独立测试的功能模块，必须按依赖顺序实施：

1. `@notera/export` 的 ADF 引用、Markdown、文件名与输出计划纯逻辑；
2. Shared 导出报告和 `NOTE_EXPORT` Operation 状态、进度及完成通知；
3. Main 直接文件和 ZIP 的无覆盖原子写入；
4. 隐藏 Atlaskit 导出 Renderer、内部合约、专用 Preload 与构建入口；
5. PDF 隐藏窗口、任务资源协议和安全链接后处理；
6. Main 导出协调器、IPC Handler、Runtime 与 Electron 最终装配。

测试与实现属于同一个功能模块，不拆成失败测试、实现、复测等微任务。实施期间只运行当前模块列出的单元测试；每个模块通过后提交一次。第六个模块完成代码和相关单元测试后执行一次必要的最终验证，再提交该完整模块。

本计划不实现主 Renderer 界面、编辑器编辑态、导出按钮、通知组件、内存草稿导出、历史/目录/多笔记导出或任何同步能力。未来 Renderer 发起导出前主动保存，但保存失败完全静默忽略并继续调用现有 `export.startNote`；该 UI 行为不在本计划创建占位代码。

## 实施后的文件职责

```text
packages/export/
  package.json                           # @notera/export workspace 与 Domain 依赖
  tsconfig.json                          # 纯逻辑包类型检查
  src/
    index.ts                             # 唯一公开导出面
    errors.ts                            # 稳定纯逻辑错误码
    types.ts                             # 快照、附件、计划和转换结果
    adf-references.ts                    # 迭代遍历 ADF，提取媒体引用
    filenames.ts                         # Windows 合法名与确定性冲突编号
    markdown.ts                          # ADF 到安全 Markdown
    plan.ts                              # DIRECT/ZIP、正文名和 assets 映射
    __tests__/
      adf-references.test.ts
      filenames.test.ts
      markdown.test.ts
      plan.test.ts

src/shared/
  export-renderer/
    contracts.ts                         # Main、export-preload、隐藏页面内部 Schema
    __tests__/contracts.test.ts
  ipc/contracts/operation.ts             # packaging、NOTE_EXPORT 报告和事件 Schema

src/main/
  export-preload.ts                      # 隐藏页面最小一次性桥
  export/
    types.ts                             # Main Writer、PDF Host 和资源端口
    file-access.ts                       # 保存对话框、扩展名与无覆盖目标分配
    archive-writer.ts                    # 直接文件/ZIP 流式原子写入
    resource-leases.ts                   # 独立 Session 的 notera-export-media 协议
    pdf-postprocess.ts                   # PDF 相对 URI 改写与内部 URL 扫描
    pdf-host.ts                          # 安全隐藏窗口、就绪等待和 printToPDF
    coordinator.ts                       # 已保存快照、附件、转换和 Operation 编排
    __tests__/
      file-access.test.ts
      archive-writer.test.ts
      resource-leases.test.ts
      pdf-postprocess.test.ts
      pdf-host.test.ts
      coordinator.test.ts
  ipc/
    export-handlers.ts                   # export.startNote 真实绑定
    __tests__/export-handlers.test.ts
  operations/
    types.ts                             # NOTE_EXPORT 成功类型
    registry.ts                          # 同类型独占与 100 ms 进度事件节流
    __tests__/registry.test.ts
  runtime.ts                             # 导出依赖装配与全部请求完整性
  main.ts                                # 协议特权、对话框、URL/Preload 路径和窗口工厂

src/renderer/export/
  index.ejs                              # 严格 CSP 的独立 HTML
  index.tsx                              # 一次性接收、渲染、就绪/失败回报
  preload.d.ts                           # window.noteraExport 内部类型
  ReadOnlyDocument.tsx                   # 可供未来主界面复用的 Atlaskit 只读视图
  media-provider.ts                      # Notera Attachment ID 到 Atlaskit Media Provider
  readiness.ts                           # 字体、图片和 Mermaid 稳定终态
  extensions/
    math.tsx                             # KaTeX 只读扩展
    mermaid.tsx                          # Mermaid 只读扩展和状态上报
  print.css                              # A4、分页和打印样式
  __tests__/
    ReadOnlyDocument.test.tsx
    readiness.test.ts

src/__tests__/export-preload.test.ts      # 专用 Preload 固定通道与隔离

.erb/configs/
  webpack.config.renderer.dev.ts         # renderer/export 双入口和 HTML
  webpack.config.renderer.prod.ts
  webpack.config.main.dev.ts              # export-preload Main 开发产物
  webpack.config.main.prod.ts             # export-preload 生产产物
  webpack.config.preload.dev.ts            # 两个 Preload 监听构建

.dependency-cruiser.cjs                  # export 包边界与 Renderer 约束
package.json
package-lock.json                         # ZIP、PDF 和 Atlaskit 锁定依赖
```

---

## 功能模块 1：`@notera/export` 纯转换核心

**目标与功能逻辑**

建立不依赖 Electron、Node 文件系统、Application、Storage 或附件密钥的纯逻辑包。所有输入先由 Domain 的 `AdfDocument` 和品牌 Attachment ID 约束；转换器只处理 JSON、字符串和安全元数据，不能打开附件或记录内容。

公开类型固定为：

```ts
export type ExportFormat = 'MARKDOWN' | 'PDF';
export type ExportPackaging = 'DIRECT' | 'ZIP';

export interface ExportAttachment {
  readonly id: AttachmentId;
  readonly fileName: string;
  readonly mimeType: string;
  readonly byteLength: number;
}

export interface PlannedAsset extends ExportAttachment {
  readonly relativePath: `assets/${string}`;
}

export interface NoteExportPlan {
  readonly format: ExportFormat;
  readonly packaging: ExportPackaging;
  readonly baseName: string;
  readonly documentFileName: string;
  readonly referencedAttachmentIds: readonly AttachmentId[];
  readonly assets: readonly PlannedAsset[];
}

export interface MarkdownResult {
  readonly bytes: Uint8Array;
  readonly lossyNodeCount: number;
}

export class ExportCoreError extends Error {
  readonly code: 'ATTACHMENT_REFERENCE_MISSING' | 'INVALID_EXPORT_INPUT';
}
```

公开函数固定为：

```ts
export function collectAttachmentReferences(
  document: AdfDocument,
): readonly AttachmentId[];

export function sanitizeWindowsBaseName(
  value: string,
  fallback: string,
  maxUtf16Length?: number,
): string;

export function allocateUniqueName(
  requested: string,
  usedCaseFolded: ReadonlySet<string>,
  maxUtf16Length?: number,
): string;

export function createNoteExportPlan(input: {
  readonly requestedBaseName: string;
  readonly format: ExportFormat;
  readonly document: AdfDocument;
  readonly attachments: readonly ExportAttachment[];
}): NoteExportPlan;

export function renderMarkdown(input: {
  readonly document: AdfDocument;
  readonly assetsById: ReadonlyMap<AttachmentId, PlannedAsset>;
}): MarkdownResult;
```

`collectAttachmentReferences()` 使用显式栈迭代遍历，识别 `type: 'media'` 且 `attrs.id` 为合法 Attachment ID 的节点，按第一次出现顺序去重；未知普通节点继续遍历子内容，非法 media ID 计入后续有损占位而不伪造引用。

`sanitizeWindowsBaseName()` 处理控制字符和 `< > : " / \\ | ? *`、尾随点/空格、空值、保留名 `CON/PRN/AUX/NUL/COM1..9/LPT1..9` 及 UTF-16 长度。`allocateUniqueName()` 大小写不敏感，从 `(2)` 开始在扩展名前编号，截断后再次校验。

`createNoteExportPlan()` 只保留 ADF 实际引用且存在于传入附件集合的项目；相同 ID 只生成一个 Asset，不同 ID 的同名文件确定性编号。任一引用没有附件元数据时抛出代码稳定的 `ExportCoreError('ATTACHMENT_REFERENCE_MISSING')`，供 Main 映射为 `BLOB_MISSING`。引用为空时使用 `DIRECT`，否则使用 `ZIP`；ZIP 内路径严格限定为 `assets/<单层文件名>`。

`renderMarkdown()` 覆盖段落、1–6 级标题、文本 Marks、硬换行、规则、列表、任务、引用、代码块、GFM 表格、公式、Mermaid、图片和普通附件。外部链接只输出转义 URL，不访问网络；不输出原始 HTML。未知或无法无损表达的节点写出 `[不支持的内容：<type>]` 并增加 `lossyNodeCount`；合并表格单元格展开且计数。结果固定 UTF-8、LF 和一个结尾换行。

**涉及文件**

- 新建：`packages/export/package.json`
- 新建：`packages/export/tsconfig.json`
- 新建：`packages/export/src/index.ts`
- 新建：`packages/export/src/errors.ts`
- 新建：`packages/export/src/types.ts`
- 新建：`packages/export/src/adf-references.ts`
- 新建：`packages/export/src/filenames.ts`
- 新建：`packages/export/src/markdown.ts`
- 新建：`packages/export/src/plan.ts`
- 新建测试：`packages/export/src/__tests__/adf-references.test.ts`
- 新建测试：`packages/export/src/__tests__/filenames.test.ts`
- 新建测试：`packages/export/src/__tests__/markdown.test.ts`
- 新建测试：`packages/export/src/__tests__/plan.test.ts`
- 修改：`.dependency-cruiser.cjs`
- 修改：`package-lock.json`

**单元测试**

- 深层 ADF 使用显式栈且不溢出调用栈；重复媒体 ID 保持首次顺序并去重；
- 非媒体未知节点仍遍历子节点，非法 media ID 不进入引用列表；
- Windows 保留名、非法字符、尾随点/空格、空白、超长 UTF-16、大小写重名和扩展名前编号；
- 空引用生成 `DIRECT`，存在引用生成 `ZIP` 和固定 `assets/`；
- 引用元数据缺失稳定抛出 `ATTACHMENT_REFERENCE_MISSING`；
- 两个不同 ID 的同名附件分配 `文件.ext`、`文件 (2).ext`；
- Markdown 覆盖常用节点、Marks、嵌套列表、GFM 表格、KaTeX、Mermaid、图片和普通附件；
- 原始 HTML 不输出，未知节点保留占位并准确累计有损数量；
- 路径穿越式附件名清理后不能产生 `..`、驱动器、绝对路径或额外目录。

**精确测试命令**

先执行一次 workspace 锁文件登记：

```powershell
npm install
```

然后只运行本模块测试：

```powershell
npm test -- --runInBand packages/export/src/__tests__
```

预期：4 个测试文件全部通过，0 个失败；不得运行其他包测试、全量 lint、typecheck 或 build。

**完成后的提交**

```powershell
git add packages/export .dependency-cruiser.cjs package-lock.json
git commit -m "feat(export): add pure note export core"
```

---

## 功能模块 2：导出 Operation 合约、进度和完成通知

**目标与功能逻辑**

把 Shared 中已经声明但 Main 尚未启用的 `NOTE_EXPORT` 补成完整的类型化长任务结果，并让现有 `operation.progress`、`operation.completed` 和 `operation.getStatus` 直接服务未来 UI。不得新增重复的导出专用事件。

Shared 增加：

```ts
export const exportPackagingSchema = z.enum(['DIRECT', 'ZIP']);

export const exportReportSchema = z.strictObject({
  format: exportFormatSchema,
  packaging: exportPackagingSchema,
  attachmentCount: z.number().int().min(0),
  lossyNodeCount: z.number().int().min(0),
  completedAt: timestampSchema,
});
```

Main Operation 类型改为：

```ts
export type ActiveOperationKind =
  | 'ATTACHMENT_IMPORT'
  | 'ATTACHMENT_SAVE_AS'
  | 'NOTE_EXPORT';

export interface OperationSuccessByKind {
  readonly ATTACHMENT_IMPORT: ImportSuccess;
  readonly ATTACHMENT_SAVE_AS: SaveAsSuccess;
  readonly NOTE_EXPORT: ExportSuccess;
}
```

`OperationRegistry` 对运行中的 `NOTE_EXPORT` 实施同类型独占：第二个 `start({kind:'NOTE_EXPORT'})` 抛出 `ApplicationError('OPERATION_FAILED')`，其他任务类型保持现有并发语义。Registry 构造参数增加可注入 `now()`，每条记录保存最后一次已发布进度的时刻、阶段和值。

每次合法 `context.progress()` 都立即更新可查询状态，但事件发布满足以下规则：阶段改变、值为 0、值为 1 或距离上次发布至少 100 ms 时立即发布；其余同阶段高频更新只更新状态、不发布事件。终态始终立即发送唯一 `operation.completed`。不创建定时器和尾随任务，避免 Session 结束后遗留回调。

`export.startNote` 成功报告通过现有事件和查询返回 `format`、`packaging`、附件数、有损节点数和时间，不增加路径、标题、附件名或正文。

**涉及文件**

- 修改：`src/shared/ipc/contracts/operation.ts`
- 修改测试：`src/shared/ipc/__tests__/file-operation-contracts.test.ts`
- 修改：`src/main/operations/types.ts`
- 修改：`src/main/operations/registry.ts`
- 修改测试：`src/main/operations/__tests__/registry.test.ts`

**单元测试**

- `exportReportSchema` 要求合法 `packaging`，拒绝未知字段和敏感字段；
- `NOTE_EXPORT` 成功终态通过 Shared Schema 并发送一次完成事件；
- 同会话第二个运行中 `NOTE_EXPORT` 被拒绝，前一个终态后允许下一个；
- 附件导入/另存不受 NOTE_EXPORT 独占规则影响；
- 同阶段 100 ms 内高频更新只更新 `getStatus()`，不洪泛事件；
- 阶段变化、0、1 和超过 100 ms 的更新立即发布；
- 取消、失败、Session 结束仍只发布一次终态，节流状态不跨 Session。

**精确测试命令**

```powershell
npm test -- --runInBand src/shared/ipc/__tests__/file-operation-contracts.test.ts src/main/operations/__tests__/registry.test.ts
```

预期：2 个测试文件全部通过，0 个失败；不得运行全量 Shared/Main 测试或其他验证。

**完成后的提交**

```powershell
git add src/shared/ipc/contracts/operation.ts src/shared/ipc/__tests__/file-operation-contracts.test.ts src/main/operations/types.ts src/main/operations/registry.ts src/main/operations/__tests__/registry.test.ts
git commit -m "feat(export): publish note export operations"
```

---

## 功能模块 3：直接文件与 ZIP 的原子写入

**目标与功能逻辑**

实现只在 Main 存在的保存目标选择和输出 Writer。真实路径永不进入 Shared、Preload、Renderer、Operation 状态或日志。使用 `archiver@7.0.1` 流式生成 ZIP，测试使用 `yauzl@3.2.0` 验证实际条目。

新增端口：

```ts
export interface ExportDialogPort {
  chooseExportPath(input: {
    readonly suggestedName: string;
    readonly extension: 'md' | 'pdf' | 'zip';
  }): Promise<string | null>;
}

export interface ExportEntry {
  readonly archivePath: string;
  readonly byteLength: number;
  open(signal: AbortSignal): AsyncIterable<Uint8Array>;
}

export interface ExportSelection {
  readonly baseName: string;
  readonly packaging: ExportPackaging;
  write(input: {
    readonly entries: readonly ExportEntry[];
    readonly signal: AbortSignal;
    readonly onBytes: (completed: number, total: number) => void;
  }): Promise<void>;
}

export interface ExportFileAccess {
  choose(input: {
    readonly suggestedBaseName: string;
    readonly format: ExportFormat;
    readonly packaging: ExportPackaging;
  }): Promise<ExportSelection | null>;
}
```

`choose()` 根据包装固定扩展名：ZIP 使用 `.zip`，DIRECT Markdown/PDF 分别使用 `.md`/`.pdf`。对话框返回路径后重新合法化用户基名，并使用 `lstat` 大小写无关地寻找第一个不存在的 `name`, `name (2)` 目标；任何时刻不覆盖已有文件。用户取消返回 `null`。

`write()` 在最终目标同目录创建 `.<最终名>.notera-<uuid>.part`，使用 `open(..., 'wx')` 防止碰撞。DIRECT 只接受一个正文 Entry；ZIP 要求根目录只有一个正文，其他条目只能是单层 `assets/<安全名>`。Writer 累计所有 Entry 的声明字节数，高频调用 `onBytes`，由 OperationRegistry 统一节流。每个 Entry 的实际字节必须精确等于声明值。

ZIP 通过 `Readable.from(entry.open(signal))` 按计划顺序 append，关闭中央目录后等待输出流 `close`，同步文件句柄再最终 rename。失败、Abort、短写、长写、Archiver 错误、磁盘满或最终 rename 失败都关闭资源并只删除本次 `.part`；原目标永不删除。`ENOSPC` 映射为 `MainIpcError('DISK_FULL')`，Abort 映射为 `ApplicationError('OPERATION_ABORTED')`，其他错误映射为 `MainIpcError('EXPORT_FAILED')`。

**涉及文件**

- 新建：`src/main/export/types.ts`
- 新建：`src/main/export/file-access.ts`
- 新建：`src/main/export/archive-writer.ts`
- 新建测试：`src/main/export/__tests__/file-access.test.ts`
- 新建测试：`src/main/export/__tests__/archive-writer.test.ts`
- 修改：`package.json`
- 修改：`package-lock.json`

**单元测试**

- 取消对话框返回 null，不创建文件；
- DIRECT/ZIP 使用正确过滤扩展名，用户基名决定最终和内部正文名称；
- 已有目标自动使用 `(2)`，大小写冲突也不覆盖；
- DIRECT 完成后目录只包含最终文件，无 `.part`；
- ZIP 使用 yauzl 验证正文、`assets/` 文件、字节和条目顺序；
- 拒绝绝对路径、`..`、驱动器、反斜杠和 `assets/` 下额外层级；
- 重复条目名、声明/实际长度不一致和多正文失败；
- Abort、Reader 失败、Archiver 失败和 ENOSPC 关闭流并删除 `.part`；
- 已有目标和无关文件在任何失败路径下保持原样。

**精确测试命令**

先锁定运行时和测试依赖：

```powershell
npm install archiver@7.0.1
npm install --save-dev @types/archiver@6.0.3 yauzl@3.2.0 @types/yauzl@2.10.3
```

然后只运行本模块测试：

```powershell
npm test -- --runInBand src/main/export/__tests__/file-access.test.ts src/main/export/__tests__/archive-writer.test.ts
```

预期：2 个测试文件全部通过，0 个失败；不得运行 PDF、Runtime 或全量测试。

**完成后的提交**

```powershell
git add src/main/export/types.ts src/main/export/file-access.ts src/main/export/archive-writer.ts src/main/export/__tests__/file-access.test.ts src/main/export/__tests__/archive-writer.test.ts package.json package-lock.json
git commit -m "feat(export): write atomic export files"
```

---

## 功能模块 4：隐藏 Atlaskit 导出 Renderer 与专用 Preload

**目标与功能逻辑**

建立可独立构建和单元测试的隐藏只读页面，但本模块不创建 BrowserWindow、文件或 PDF。只引入 `D:\programs\atlassian-editor` 中渲染所需的公开 Atlaskit 用法与公式/Mermaid 只读逻辑，不复制编辑器工具栏、上传服务、`.media-data`、固定 Token、Express Server 或编辑态 Provider。

内部合约固定为：

```ts
export const exportRenderAttachmentSchema = z.strictObject({
  id: uuidSchema,
  fileName: limitedUnicodeString(255),
  mimeType: limitedUnicodeString(255),
  byteLength: z.number().int().min(0).max(MAX_ATTACHMENT_BYTES),
  relativePath: limitedUnicodeString(512),
});

export const exportRenderDocumentSchema = z.strictObject({
  operationId: uuidSchema,
  nonce: z.string().min(43).max(43),
  title: noteTitleSchema,
  document: adfDocumentSchema,
  mediaBaseUrl: z.string()
    .regex(/^notera-export-media:\/\//u)
    .max(2048),
  attachments: z.array(exportRenderAttachmentSchema).max(1000),
});

export const exportRenderReadySchema = z.strictObject({
  operationId: uuidSchema,
  nonce: z.string().min(43).max(43),
  lossyNodeCount: z.number().int().min(0),
});

export const exportRenderFailureSchema = z.strictObject({
  operationId: uuidSchema,
  nonce: z.string().min(43).max(43),
});
```

内部附件数组固定最多 1,000 项，与现有笔记标签等本地集合的安全数量级一致；超出时在进入隐藏 Renderer 前拒绝，不创建无界载荷。

`export-preload.ts` 只暴露：

```ts
interface NoteraExportBridge {
  receiveDocument(listener: (value: ExportRenderDocument) => void): () => void;
  ready(value: ExportRenderReady): void;
  failed(value: ExportRenderFailure): void;
}
```

Preload 使用固定内部 Channel、输入输出 Schema 和一次性订阅；不暴露 `window.notera`、任意 `ipcRenderer.send/on`、Node、文件或路径。

`ReadOnlyDocument` 使用 `@atlaskit/renderer` 的 `ReactRenderer`、`adfStage="stage0"`、固定 full-page appearance、只读公式/Mermaid Extension Handler 和导出 Media Provider。Media Provider 的 Auth `baseUrl` 来自 Main 载荷的任务级专用协议，ADF 的 `attrs.id` 保持 Notera Attachment ID；它只支持读取和缩略图请求，不提供上传、删除、下载按钮或 Atlaskit Media Viewer。

公式使用 KaTeX 本地同步渲染；Mermaid 使用本地库、固定安全配置和异步状态注册。`readiness.ts` 等待 React commit、`document.fonts.ready`、所有 `img.decode()` 以及所有 Mermaid 成功/错误终态。非法公式、非法 Mermaid 和未知扩展显示含原始源码的明确占位并增加有损数量，不调用远端资源。

`index.ejs` 固定 CSP，生产只允许自身脚本/样式、data 字体/图片和 `notera-export-media:`；禁止 object、frame、form、worker 和远程连接。`print.css` 使用 A4、固定页边距、背景色和 break-inside 规则。

Webpack Renderer 开发/生产配置从单 entry 改为 `renderer` 与 `export` 命名 entry，输出 `[name].js`/`[name].dev.js`，两个 HtmlWebpackPlugin 分别限制 chunks，生成 `index.html` 和 `export.html`。Main 开发/生产及 preload watch 配置同时构建 `preload` 与 `export-preload`，主 Preload 行为不变。

**涉及文件**

- 新建：`src/shared/export-renderer/contracts.ts`
- 新建测试：`src/shared/export-renderer/__tests__/contracts.test.ts`
- 修改：`src/shared/index.ts`
- 新建：`src/main/export-preload.ts`
- 新建测试：`src/__tests__/export-preload.test.ts`
- 新建：`src/renderer/export/index.ejs`
- 新建：`src/renderer/export/index.tsx`
- 新建：`src/renderer/export/preload.d.ts`
- 新建：`src/renderer/export/ReadOnlyDocument.tsx`
- 新建：`src/renderer/export/media-provider.ts`
- 新建：`src/renderer/export/readiness.ts`
- 新建：`src/renderer/export/extensions/math.tsx`
- 新建：`src/renderer/export/extensions/mermaid.tsx`
- 新建：`src/renderer/export/print.css`
- 新建测试：`src/renderer/export/__tests__/ReadOnlyDocument.test.tsx`
- 新建测试：`src/renderer/export/__tests__/readiness.test.ts`
- 修改：`.erb/configs/webpack.config.renderer.dev.ts`
- 修改：`.erb/configs/webpack.config.renderer.prod.ts`
- 修改：`.erb/configs/webpack.config.main.dev.ts`
- 修改：`.erb/configs/webpack.config.main.prod.ts`
- 修改：`.erb/configs/webpack.config.preload.dev.ts`
- 修改：`package.json`
- 修改：`package-lock.json`

**单元测试**

- 内部 Schema 拒绝额外字段、非法 ADF、过多附件、非法 URL、错误 operationId/nonce；
- export-preload 只暴露三个固定方法，订阅可释放且输入输出都校验；
- 主 `window.notera` 不出现在隐藏 Bridge，主 Preload 不新增内部 Channel；
- ReactRenderer 收到同一 ADF、附件 Provider、公式和 Mermaid Handler；
- 图片、普通附件、非法公式、非法 Mermaid 和未知扩展显示明确内容；
- readiness 在字体、图片或 Mermaid 未终态时不 resolve，全部完成后返回稳定有损数量；
- 外部 URL 只作为文字链接，不触发测试 fetch；
- Webpack 配置源码断言两个 HTML 只包含各自 chunk，export-preload 使用独立文件名。

**精确测试命令**

锁定与本地 Atlassian 示例一致的只读依赖：

```powershell
npm install @atlaskit/adf-schema@56.7.3 @atlaskit/css-reset@8.1.3 @atlaskit/editor-common@119.0.0 @atlaskit/media-core@38.0.0 @atlaskit/renderer@136.0.0 @atlaskit/tokens@16.7.0 @emotion/react@11.14.0 katex@0.16.47 mermaid@11.16.1 react-intl@7.1.14
```

然后只运行本模块测试：

```powershell
npm test -- --runInBand src/shared/export-renderer/__tests__/contracts.test.ts src/__tests__/export-preload.test.ts src/renderer/export/__tests__/ReadOnlyDocument.test.tsx src/renderer/export/__tests__/readiness.test.ts
```

预期：4 个测试文件全部通过，0 个失败；本模块不提前运行 Renderer build，构建只在最终验证执行一次。

**完成后的提交**

```powershell
git add src/shared/export-renderer src/shared/index.ts src/main/export-preload.ts src/__tests__/export-preload.test.ts src/renderer/export .erb/configs/webpack.config.renderer.dev.ts .erb/configs/webpack.config.renderer.prod.ts .erb/configs/webpack.config.main.dev.ts .erb/configs/webpack.config.main.prod.ts .erb/configs/webpack.config.preload.dev.ts package.json package-lock.json
git commit -m "feat(export): render secure export documents"
```

---

## 功能模块 5：PDF Host、任务资源协议与链接后处理

**目标与功能逻辑**

把模块 4 的隐藏页面装配为一次性 PDF Render Host。本模块通过注入端口测试窗口、Session、内部 IPC 和 printToPDF，不接入公开 `export.startNote`。

核心接口：

```ts
export interface PdfRenderAsset {
  readonly id: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly byteLength: number;
  readonly relativePath: `assets/${string}`;
}

export interface PdfRenderHost {
  render(input: {
    readonly operationId: string;
    readonly title: string;
    readonly document: AdfDocument;
    readonly assets: readonly PdfRenderAsset[];
    readonly signal: AbortSignal;
    readonly onResourceBytes: (completed: number) => void;
  }): Promise<{ readonly bytes: Uint8Array; readonly lossyNodeCount: number }>;
  close(): Promise<void>;
}
```

每次 `render()` 生成 32 随机字节 nonce 和非持久 Partition `notera-export-<operationId>`，在该窗口 `webContents.session.protocol` 上注册 `notera-export-media:` Handler，再加载 `export.html`。生产 URL 来自打包的 `export.html`，开发只允许精确的本机 Dev Server `/export.html`；该开发例外不能访问任意 HTTP/HTTPS 子资源。

资源协议 Auth base URL 同时包含 job Token 和 operationId，Handler 解析 Atlaskit Media API 的当前只读 GET/HEAD/metadata/items 路径，只允许计划内 Attachment ID。每个请求重新确认当前 ProfileSession、用途、Token、到期时间和 ID；打开 `LocalAttachmentsService.openReader()` 后复用现有 Media Gateway 的 Range、受控 MIME、no-store 和 Reader 关闭语义。成功、失败、Abort、窗口 destroyed 或 Host close 都成组撤销 Token、注销当前临时 Session Handler 并销毁窗口。

窗口固定 `show:false`、sandbox、contextIsolation、nodeIntegration false、webSecurity true、专用 export-preload、禁止 DevTools、权限、导航、新窗口和下载。只接受当前隐藏 webContents、匹配 operationId 和 nonce 的 ready/failed 回报。等待超时固定 60 秒；超时、renderer-process-crashed、unresponsive、加载失败或非法回报统一失败并清理。

`printToPDF({pageSize:'A4', printBackground:true, margins})` 返回后使用 `pdf-lib@1.17.1` 遍历 Link Annotation：

- `notera-export-asset:<AttachmentId>` 按计划改写为百分号编码的 `assets/<文件名>` 相对 URI；
- 用户原始 `https:`/`http:` 链接保留；
- `file:`、页面 URL、`notera-export-media:`、Token、本地路径或其他 Scheme 导致失败；
- 无法安全改写的附件 Link 删除 Action、保留页面可见路径文本并增加有损数量；
- 序列化后的 PDF 再扫描任务 Token、内部 Scheme、开发 origin 和本地页面路径，任一命中按 `EXPORT_FAILED` 处理。

**涉及文件**

- 新建：`src/main/export/resource-leases.ts`
- 新建：`src/main/export/pdf-postprocess.ts`
- 新建：`src/main/export/pdf-host.ts`
- 新建测试：`src/main/export/__tests__/resource-leases.test.ts`
- 新建测试：`src/main/export/__tests__/pdf-postprocess.test.ts`
- 新建测试：`src/main/export/__tests__/pdf-host.test.ts`
- 修改：`src/main/export/types.ts`
- 修改：`package.json`
- 修改：`package-lock.json`

**单元测试**

- 专用协议只接受有效 Token、当前 Profile、计划内 ID 和只读 Atlaskit 路径；
- Range、HEAD、metadata、受控 MIME、Reader 错误和 cancel 均关闭 Reader；
- 临时 Session 注册/注销 Handler，不误用主窗口默认 Session；
- BrowserWindow 安全参数、Partition、导航/权限/新窗口/下载拒绝固定；
- 非当前 webContents、错误 nonce、重复 ready 和迟到消息不改变状态；
- Abort、60 秒超时、crash、unresponsive、load failure 和 print failure 都销毁窗口并撤销 Lease；
- pdf-lib fixture 的附件 Marker 改写为 `assets/` 相对 URI，HTTP(S) 用户链接保留；
- file、内部协议、Token、开发 origin、本地路径或未知 Scheme 不能进入输出 PDF；
- 无法安全改写的附件链接删除 Action、保留可见文本并增加有损数量。

**精确测试命令**

先锁定 PDF 后处理依赖：

```powershell
npm install pdf-lib@1.17.1
```

然后只运行本模块测试：

```powershell
npm test -- --runInBand src/main/export/__tests__/resource-leases.test.ts src/main/export/__tests__/pdf-postprocess.test.ts src/main/export/__tests__/pdf-host.test.ts
```

预期：3 个测试文件全部通过，0 个失败；不得运行 Runtime、Renderer build 或全量验证。

**完成后的提交**

```powershell
git add src/main/export/resource-leases.ts src/main/export/pdf-postprocess.ts src/main/export/pdf-host.ts src/main/export/types.ts src/main/export/__tests__/resource-leases.test.ts src/main/export/__tests__/pdf-postprocess.test.ts src/main/export/__tests__/pdf-host.test.ts package.json package-lock.json
git commit -m "feat(export): generate secure note pdfs"
```

---

## 功能模块 6：导出协调器、IPC 与 Electron 最终装配

**目标与功能逻辑**

把前五个模块连接到真实 Application 服务、OperationRegistry、公开 `export.startNote`、MainRuntime 和 Electron 启动。Main handler 仍是薄适配，所有业务编排集中在 `NoteExportCoordinator`。

协调器接口：

```ts
export interface NoteExportCoordinator {
  start(input: {
    readonly noteId: string;
    readonly format: 'MARKDOWN' | 'PDF';
  }): Promise<
    | { readonly status: 'cancelled' }
    | { readonly status: 'started'; readonly operationId: string }
  >;
  close(): Promise<void>;
}
```

`start()` 使用同步 `busy` 标志覆盖读取快照、打开原生对话框以及整个 NOTE_EXPORT Executor 生命周期；已有 `busy` 请求直接抛出 `MainIpcError('EXPORT_FAILED')`，第二个请求不能打开第二个对话框。OperationRegistry 的同类型独占是独立的第二层保护。流程固定为：

1. 在 Session Gate 内调用 `localNotes.getNote(noteId)`；
2. 使用 `limit: 100` 和 `nextCursor` 分页列出该笔记全部附件，拒绝重复 Cursor；
3. 调用 `createNoteExportPlan()`，引用元数据缺失映射为 `BLOB_MISSING`；
4. 任一计划内摘要为 MISSING/CORRUPT 时分别抛出对应错误，不打开保存对话框；
5. 调用 ExportFileAccess，用户取消时释放 `busy` 并返回 cancelled；
6. 创建独占 NOTE_EXPORT Operation，立即返回 operationId；Executor 的 `finally` 在所有 Reader、Writer 和 Host 清理完成后释放 `busy`；
7. Executor 对 Markdown 调用纯转换，对 PDF 调用 PdfRenderHost；
8. DIRECT 写一个正文 Entry，ZIP 写正文和按计划排序的 Asset Entry；每个 Asset Entry 只在 Writer 请求时打开 Reader，并在完成/失败时关闭；
9. 发布 PREPARING、READING、RENDERING、WRITING、FINALIZING；字节比例用正文与附件声明总量计算，PDF RENDERING 使用 null；
10. 成功返回 `{report:{format,packaging,attachmentCount,lossyNodeCount,completedAt}}`。

协调器不把快照放入 Operation 状态，不记录标题/路径/附件名。任一 Reader、Writer 或 PDF 失败由 export contract 的 `toIpcError()` 收口。`close()` 阻止新请求并等待启动中的对话框收敛；SessionLifecycle 先 `operations.endSession()` 取消 Executor，再由 Runtime 关闭 PDF Host。

`createExportBindings()` 只注册一个 `export.startNote`，外层使用既有 SessionCommandGate。Runtime bindings 完整性不再排除导出，预期 56 个请求全部绑定；启动、关闭失败仍按当前组合根的幂等清理顺序执行。

`main.ts` 在 app ready 之前把 `notera-export-media` 与 `notera-media` 一起注册为 standard/secure/stream/supportFetchAPI；提供导出保存对话框、隐藏 BrowserWindow 工厂、`export.html` URL、export-preload 开发/生产路径、随机数和 60 秒调度端口。导出对话框的 filters 根据 `.md/.pdf/.zip` 固定，路径只返回 Main。

**涉及文件**

- 新建：`src/main/export/coordinator.ts`
- 新建测试：`src/main/export/__tests__/coordinator.test.ts`
- 新建：`src/main/ipc/export-handlers.ts`
- 新建测试：`src/main/ipc/__tests__/export-handlers.test.ts`
- 修改：`src/main/runtime.ts`
- 修改：`src/main/main.ts`
- 修改：`src/main/__tests__/helpers.ts`
- 修改测试：`src/main/__tests__/runtime.test.ts`
- 修改：`src/main/ipc/errors.ts`（把 `ATTACHMENT_REFERENCE_MISSING` 固定映射为 `BLOB_MISSING`，其他 ExportCoreError 收口为 `EXPORT_FAILED`）

**单元测试与集成测试**

- 快照、分页附件、ADF 引用交叉校验和固定快照顺序；
- 缺失/损坏附件在对话框前失败；用户取消不创建 Operation；
- 启动中或运行中第二个导出不打开对话框；
- Markdown DIRECT、PDF DIRECT、Markdown ZIP、PDF ZIP 使用正确正文和 assets 条目；
- 相同 Attachment ID 多次引用只打开/写入一次，所有 Reader 在成功、失败、取消和锁定时关闭；
- PDF 有损数量与 Core 有损数量安全合并且不溢出；
- Operation 阶段、比例、成功报告、失败与取消通知不携带路径、标题、ADF 或附件名；
- Handler 使用 Session Gate、固定 contract 和安全错误映射；
- Runtime 精确注册全部 56 个请求，包含导出且无重复/额外 binding；
- Runtime 关闭活动导出时取消 Operation、关闭 Host、撤销协议并移除全部 Handler；
- `main.ts` 源码测试固定两个特权 Scheme、export-preload 路径和导出对话框边界。

**本模块相关测试命令**

先只运行本模块新增和直接修改的测试：

```powershell
npm test -- --runInBand src/main/export/__tests__/coordinator.test.ts src/main/ipc/__tests__/export-handlers.test.ts src/main/__tests__/runtime.test.ts
```

预期：3 个测试文件全部通过，0 个失败。

**全部模块完成后的唯一最终验证**

按顺序各运行一次：

```powershell
npm test -- --runInBand packages/export/src/__tests__ src/shared/export-renderer/__tests__ src/shared/ipc/__tests__/file-operation-contracts.test.ts src/main/operations/__tests__/registry.test.ts src/main/export src/main/ipc/__tests__/export-handlers.test.ts src/main/__tests__/runtime.test.ts src/__tests__/export-preload.test.ts src/renderer/export
npm run typecheck
npm run check:deps
npx eslint packages/export/src src/shared/export-renderer src/shared/ipc/contracts/operation.ts src/main/export src/main/export-preload.ts src/main/ipc/export-handlers.ts src/main/operations src/main/runtime.ts src/main/main.ts src/main/__tests__/helpers.ts src/main/__tests__/runtime.test.ts src/renderer/export src/__tests__/export-preload.test.ts .erb/configs/webpack.config.renderer.dev.ts .erb/configs/webpack.config.renderer.prod.ts .erb/configs/webpack.config.main.dev.ts .erb/configs/webpack.config.main.prod.ts .erb/configs/webpack.config.preload.dev.ts --ext .ts,.tsx
npm run build
```

预期：

- 全部导出相关单元测试通过，0 个失败；
- 所有 workspace 与 app TypeScript 检查通过；
- 依赖方向无循环，`@notera/export`、Renderer、Preload 和 Main 边界符合规则；
- 本次涉及文件 ESLint 通过；
- production Main、主 Preload、export-preload、主 Renderer 和 export Renderer 全部构建成功；
- 不运行未受影响的 Domain、Crypto、Storage、Attachment、Application 全部测试，也不运行同步或 Electron E2E。

若某项失败，只修复对应原因并复测该失败项；未受影响且已经通过的检查不重复运行。

**完成后的提交**

最终验证全部通过后提交本模块完整改动：

```powershell
git add src/main/export/coordinator.ts src/main/export/__tests__/coordinator.test.ts src/main/ipc/export-handlers.ts src/main/ipc/__tests__/export-handlers.test.ts src/main/runtime.ts src/main/main.ts src/main/__tests__/helpers.ts src/main/__tests__/runtime.test.ts src/main/ipc/errors.ts
git commit -m "feat(export): assemble single note exports"
```

---

## 最终范围确认

计划完成时必须同时满足：

- `export.startNote` 使用当前窗口主 Frame、Shared Schema、Session Gate 和真实 Main Handler；
- Main 只读取数据库中最后成功保存的当前笔记版本，不接收 Renderer 内存草稿；
- 无附件输出 `.md/.pdf`，有附件自动输出 ZIP，内部固定为正文加 `assets/`；
- 当前 ADF 实际引用的附件完整导出，重复引用只写一次，未引用和其他版本内容不泄漏；
- Markdown 不静默丢节点，PDF 与 Atlaskit 只读视图高度一致且有损内容明确计数；
- Windows 文件名、ZIP 路径和目标冲突安全，从不覆盖已有结果；
- 进度最多每 100 ms 发布一次高频更新，阶段/0/1/终态即时，完成通知包含安全报告；
- PDF 独立 Session、专用协议、沙箱、CSP、链接后处理和最终扫描不泄漏 Token、路径或内部 URL；
- 取消、锁定、正常退出和所有可处理失败关闭 Reader、Writer、窗口和 Lease，并删除 `.part`；
- 每个完整功能模块只有一次提交，全部模块后只有一次必要最终验证；
- Renderer 主界面、编辑态、内存草稿导出和任何同步实现或占位结构均不进入本计划。
