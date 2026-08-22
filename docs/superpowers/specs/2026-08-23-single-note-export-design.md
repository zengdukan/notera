# Notera 单笔记 Markdown/PDF 导出设计

- 状态：已确认
- 日期：2026-08-23
- 平台：Windows Desktop
- 范围：已解锁 Profile 中当前单篇笔记的 Markdown/PDF 明文导出

## 1. 目标与范围

本子项目实现总体架构中 Electron Main / Preload / IPC 核心装配之后的下一个独立阶段：单笔记 Markdown/PDF 明文导出。完成本阶段后，`export.startNote` 从保留合约变为真实可用的 Main handler，导出任务复用现有长任务注册表、Application 本地笔记与附件用例、流式附件读取和安全 Electron 运行时。

本设计覆盖：

- 导出数据库中当前单篇笔记最后一次成功保存的标题与 ADF；
- 将 ADF 转换为 Markdown；
- 使用 Atlaskit 只读 Renderer 和 Chromium 生成高视觉一致性的 PDF；
- 导出当前 ADF 实际引用的原始图片和普通附件；
- 无附件时直接输出 `.md` 或 `.pdf`，有附件时自动输出包含正文与 `assets/` 的 ZIP；
- Windows 文件名合法化、无覆盖冲突分配、流式写入与失败清理；
- 导出任务的启动、进度、查询、取消和完成通知；
- Profile 锁定、应用退出、附件损坏、磁盘满和 PDF 渲染失败时的安全关闭。

本阶段不实现：

- 主 Renderer 界面、编辑器编辑态、导出按钮或通知组件；
- 从 Renderer 内存草稿直接导出；
- 历史版本、回收站、目录、多笔记或整个 Profile 的导出；
- Word、HTML、纯文本或其他格式；
- 将普通附件嵌入 PDF 文件内部；
- 导入、备份或恢复；
- 同步协议、同步引擎、云端 API、同步 Outbox、同步冲突、远端附件状态或任何同步占位结构。

未来 Renderer 集成阶段在发起导出前主动调用 `note.saveDraft`，随后无论保存成功还是失败都继续调用 `export.startNote`。保存失败完全静默忽略。Main 不接收编辑器内存草稿，始终重新读取数据库，因此此时导出上一次成功保存的版本。

## 2. 核心决策

### 2.1 PDF 使用 Atlaskit 只读 Renderer

PDF 通过独立、隐藏、沙箱化的 Chromium 页面生成。该页面复用 `D:\programs\atlassian-editor` 已验证的公开 `@atlaskit/renderer` 用法、相同主题、Media Provider 边界、公式扩展和 Mermaid 扩展；不使用开发用 `.media-data`、固定 Token 服务或 Express Media Server。

隐藏页面完成 ADF 只读渲染后，等待字体、图片、公式和 Mermaid 进入稳定终态，再由 Main 调用 `webContents.printToPDF()`。目标是与未来应用只读视图高度一致，不承诺编辑态与分页 PDF 像素级一致。分页造成的换行、跨页和尺寸调整不视为不一致。

不采用自定义 ADF-to-HTML 后打印或 PDF 绘图库直接排版。前者会长期偏离 Atlaskit 展示语义，后者需要重复实现复杂布局且无法满足高视觉一致性目标。

### 2.2 Markdown 使用纯转换核心

新增纯逻辑包 `@notera/export`，负责 ADF 遍历、Markdown 转换、附件引用提取、文件名分配和导出计划构造。该包不依赖 Electron、Node 文件系统、数据库、Application 或 Renderer，可独立进行单元测试并为未来其他平台复用。

桌面文件选择、附件解密、ZIP、PDF BrowserWindow 和实际写入仍属于 `src/main/export`，不得进入纯转换包。

### 2.3 包装方式由附件存在性自动决定

- 当前 ADF 没有实际附件引用时，Markdown 直接输出 `.md`，PDF 直接输出 `.pdf`。
- 当前 ADF 存在实际附件引用时，无论格式为何都输出 `.zip`。
- ZIP 根目录包含一个正文文件和固定的 `assets/` 目录。
- `format` 仍表示 `MARKDOWN | PDF` 内容格式；完成报告新增 `packaging: DIRECT | ZIP` 表示外层包装。

示例：

```text
项目计划.zip
├── 项目计划.pdf
└── assets/
    ├── 架构图.png
    ├── 需求文档.docx
    └── 数据表.xlsx
```

ZIP 是普通明文导出容器，不提供 ZIP 密码或额外加密。导出完成后，其内容不再受 Notera 加密保护。

### 2.4 不覆盖已有结果

保存对话框以合法化后的笔记标题作为默认名，空标题使用 `未命名笔记`。用户可以修改名称；最终选择的基名同时用于直接文件、ZIP 名和 ZIP 内正文名。

若候选目标已经存在，自动寻找统一可用编号，例如 `项目计划 (2).zip`。系统不提供覆盖旁路，不删除或替换已有正文、ZIP 或目录。

## 3. 组件与依赖边界

```text
Renderer 导出命令
  → Preload：export.startNote
    → Main 导出 Handler
      → 导出协调器
        ├─ LocalNotesService：数据库笔记快照
        ├─ LocalAttachmentsService：附件摘要与解密 Reader
        ├─ @notera/export：ADF、Markdown、引用与文件名纯逻辑
        ├─ PDF Render Host：隐藏 Atlaskit Renderer + printToPDF
        ├─ Export Resource Lease：任务级图片 URL
        └─ Export Writer：直接文件或流式 ZIP
```

### 3.1 `@notera/export`

建议文件：

```text
packages/export/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── types.ts
    ├── adf-references.ts
    ├── markdown.ts
    ├── filenames.ts
    ├── plan.ts
    └── __tests__/
```

公开接口围绕不可变输入输出设计：

- 笔记快照：标题、ADF 和已解析附件安全元数据；
- 引用计划：ADF 中去重后的 Attachment ID 及其出现位置；
- 文件计划：合法正文名、每个 Attachment ID 对应的唯一 `assets/<name>`；
- Markdown 结果：UTF-8 内容和有损节点数量；
- PDF 辅助模型：只读展示所需的安全附件映射，不含路径、密钥或字节。

该包不得打开附件 Reader、写文件、创建 ZIP、记录日志或决定 Electron 窗口策略。

### 3.2 Main 导出模块

建议文件：

```text
src/main/export/
├── coordinator.ts
├── file-access.ts
├── archive-writer.ts
├── pdf-host.ts
├── pdf-postprocess.ts
├── resource-leases.ts
└── __tests__/

src/main/ipc/export-handlers.ts
src/main/export-preload.ts
```

职责如下：

- `coordinator.ts`：读取一致的已保存笔记快照，列出全部附件页，交叉校验 ADF 引用，选择包装方式并编排任务；
- `file-access.ts`：保存对话框、建议扩展名、冲突编号、同目录随机 `.part` 文件、同步与最终重命名；
- `archive-writer.ts`：使用锁定版本的流式 ZIP 实现写入正文和附件，不把完整附件载入内存；
- `pdf-host.ts`：创建并销毁隐藏 BrowserWindow、发送一次性文档载荷、等待就绪、调用 `printToPDF`；
- `pdf-postprocess.ts`：把 Chromium 生成的临时附件链接改写为安全相对链接，并扫描 PDF，阻止内部 URL、Token 或路径进入最终文件；
- `resource-leases.ts`：复用现有 Media Gateway 的会话校验、受控 MIME 和 Range 读取逻辑，在隐藏页面的独立 Session 上注册专用导出资源协议，并为每个任务成组管理短期 Lease；
- `export-handlers.ts`：把 `export.startNote` 连接到 Session Gate、保存对话框和 `OperationRegistry`；
- `export-preload.ts`：只暴露隐藏页面渲染所需的一次性接收与完成回报，不暴露主窗口 `window.notera`。

### 3.3 隐藏导出 Renderer

建议文件：

```text
src/renderer/export/
├── index.tsx
├── ReadOnlyDocument.tsx
├── readiness.ts
├── print.css
└── __tests__/

src/shared/export-renderer/contracts.ts
```

`ReadOnlyDocument` 封装 Atlaskit ReactRenderer、公式、Mermaid、媒体属性和统一主题，未来主 Renderer 的只读视图可以复用。`readiness.ts` 只在以下条件全部满足后回报可打印：

- React 文档已提交；
- `document.fonts.ready` 完成；
- 所有图片完成 `decode()` 或进入可报告错误；
- 数学公式同步完成；
- 所有 Mermaid 进入成功或明确错误状态；
- 有损/错误节点计数稳定。

Main 与隐藏页面之间使用 `src/shared/export-renderer/contracts.ts` 定义的内部 Schema 校验载荷和回报。该通道不属于公开 `window.notera` API，也不接受来自主 Renderer 的任意消息。

### 3.4 构建与依赖约束

Renderer Webpack 开发和生产配置新增独立 `export.html` 与 export bundle；Main 构建新增 `export-preload` 入口。主界面 bundle 与导出 bundle 不互相启动。

依赖规则增加 `packages/export` 边界：它可以依赖 `@notera/domain` 的 ADF 类型，但不得依赖 Crypto、Storage、Attachments、Application 或 `src`。`src/renderer/export` 继续遵守 Renderer 只能依赖 `src/shared` 和外部包的规则；`src/main` 不导入 Renderer 源码，只解析构建产物位置。

## 4. 数据流

### 4.1 启动前准备

1. `export.startNote({noteId, format})` 经过共享请求 Schema 和当前窗口主 Frame 校验。
2. Session Gate 确认 Profile 已解锁，并拒绝同一会话中的第二个运行中 `NOTE_EXPORT`。
3. Main 调用 `LocalNotesService.getNote()` 读取当前已保存笔记快照。
4. Main 分页读取 `LocalAttachmentsService.listForNote()` 的全部结果。
5. `@notera/export` 遍历 ADF，提取并去重实际引用的 Attachment ID。
6. 每个引用必须存在于该笔记的当前附件引用集合。ADF 引用了不存在的附件元数据时按 `BLOB_MISSING` 失败，不打开保存对话框。
7. 根据引用数量决定 `DIRECT` 或 `ZIP`，再打开具有正确扩展名的保存对话框。
8. 用户取消时返回 `{status: 'cancelled'}`，不创建 Operation，也不发送完成事件。
9. 用户确认后分配不冲突的最终路径，创建 `NOTE_EXPORT` Operation 并立即返回 `operationId`。

准备阶段取得的笔记与引用构成此次导出的固定快照。保存对话框打开之后发生的新编辑或自动保存不改变已启动导出的内容。

### 4.2 Markdown

Markdown 转换使用以下确定规则：

- 标题、段落、粗体、斜体、删除线、行内代码和超链接映射为标准 Markdown；
- 有序列表、无序列表、任务列表、引用和代码块保留对应结构；
- 表格输出 GitHub Flavored Markdown；无法无损表示的合并单元格展开，并增加有损节点数量；
- 行内公式输出 `$...$`，块公式输出 `$$...$$`；
- Mermaid 输出 `mermaid` 围栏代码块；
- 图片输出 `![说明](assets/文件名)`；
- 普通附件输出 `[文件名](assets/文件名)`；
- 外部超链接保留 URL 文本，但转换过程不访问网络；
- 不输出原始 HTML；
- 无法转换的节点输出 `[不支持的内容：节点类型]` 并增加有损节点数量，绝不静默删除。

Markdown 使用 UTF-8、LF 换行，并以单个换行结束。

### 4.3 PDF

PDF 页面包含合法化前的原始笔记标题和 ADF 正文，使用 A4、固定页边距和 `printBackground: true`。打印样式对表格行、代码块、图片、公式和 Mermaid 使用 `break-inside` 约束；内容超过单页时允许 Chromium 自然分页。

图片通过任务级短期 URL 由专用导出资源协议流式解密展示。普通附件在 ADF 对应位置显示文件名、MIME 类型和格式化大小，并先使用只包含 Attachment ID 的临时链接标记。`printToPDF` 完成后，Main 在写入前把对应 PDF Link Annotation 改写为经过百分号编码的 `assets/<文件名>` 相对 URI；不得保留 Chromium 解析后的绝对页面 URL、自定义协议 URL或资源 Token。图片在 PDF 正文显示，同时原始图片仍写入 ZIP 的 `assets/`。

PDF 后处理还会扫描链接 Annotation：只允许明确保留的外部 `https:`/`http:` 用户链接和本次计划生成的 `assets/` 相对 URI。无法安全改写的附件链接会被移除可点击行为、保留可见的 `assets/<文件名>` 文本并增加有损节点数量；任何内部页面地址、`file:` URL、导出资源 URL、Token 或本地路径都会使导出失败。不同 PDF 阅读器对相对附件链接的支持可能不同，但可见相对路径始终保留。

非法公式或 Mermaid 显示包含原始源码的明确错误块，计入有损节点，不导致整个任务失败。其他无法渲染的 ADF 节点显示明确占位并计数。隐藏页面崩溃、导航、远程请求、资源认证失败或等待超时导致整个 PDF 导出失败。

### 4.4 文件和 ZIP 写入

直接文件与 ZIP 都先写入最终目标同目录下的随机隐藏 `.part` 文件。正文和全部附件成功、文件同步完成且 ZIP 中央目录结束后，关闭句柄并将 `.part` 重命名为最终名称。

ZIP 结构固定为：

```text
<用户选择基名>.zip
├── <用户选择基名>.md | <用户选择基名>.pdf
└── assets/
    └── <合法且唯一的附件名>
```

附件逐个打开 `AttachmentContentReader` 并流式写入 ZIP，任何时刻不把完整附件集合载入内存。相同 Attachment ID 在 ADF 中出现多次只导出一个原始文件，各处引用相同相对路径。不同附件具有相同显示名时使用 `文件名 (2).扩展名`。ZIP 条目只允许正文基名或单层 `assets/<文件名>`，拒绝绝对路径、驱动器、`..` 和额外目录层级。

## 5. 文件名与冲突规则

Windows 合法化必须统一处理：

- `< > : " / \\ | ? *` 和控制字符；
- 尾随点和空格；
- `CON`、`PRN`、`AUX`、`NUL`、`COM1` 至 `COM9`、`LPT1` 至 `LPT9` 等保留名；
- 空字符串、仅空白或清理后为空；
- 超出内部 UTF-16 长度上限的名称；
- 大小写不敏感的重名；
- 附件扩展名保留和编号插入位置。

名称清理不得包含本地路径信息。正文默认名为空时使用 `未命名笔记`，附件默认名为空时使用 `附件`。冲突编号从 `(2)` 开始，并在截断后再次验证完整名称长度与保留名。

## 6. 长任务、进度与 UI 通知

`OperationRegistry` 的有效任务类型增加真实 `NOTE_EXPORT` 执行器和成功结果。一个 ProfileSession 同时只允许一个 `NOTE_EXPORT`；第二个请求在打开保存对话框前以安全 `EXPORT_FAILED` 失败。附件导入和附件另存任务不受此单类型限制。

任务阶段为：

```text
PREPARING
  → READING
  → RENDERING（仅 PDF）
  → WRITING
  → FINALIZING
  → SUCCEEDED | FAILED | CANCELLED
```

`export.startNote` 返回 `operationId` 后，UI 使用现有 `operation.progress` 接收：

- `operationId`；
- `kind: NOTE_EXPORT`；
- 当前 `phase`；
- `0..1` 的有限进度或 `null`。

阶段变化、阶段开始、阶段结束和任务终态立即通知。附件解密和 ZIP 写入等高频字节进度最多每 100 毫秒通知一次，防止事件洪泛；0、1 和阶段变化不受节流影响。PDF 渲染等无法可靠量化的阶段使用 `progress: null`，供 UI 显示不确定进度动画。

任务结束只发送一次现有 `operation.completed`：

- 成功结果包含 `format`、`packaging`、`attachmentCount`、`lossyNodeCount` 和 `completedAt`；
- 失败结果只包含允许的安全 IPC 错误；
- 取消结果使用 `CANCELLED`；
- 不包含目标路径、标题、正文、附件名、资源 URL 或底层异常。

Renderer 重载后可以用 `operation.getStatus(operationId)` 恢复当前会话的任务展示。Profile 锁定后旧任务记录按既有 Session 结束语义清空，新会话不能查询旧任务。

## 7. Electron 与资源安全

PDF BrowserWindow 固定：

- `show: false`；
- `sandbox: true`；
- `contextIsolation: true`；
- `nodeIntegration: false`；
- 专用 `export-preload`；
- 独立、临时 Session Partition，并在该 Session 自己的 `protocol` 上注册专用导出资源 Handler；
- 禁止打开新窗口、导航、下载、权限请求和 DevTools；
- 严格 CSP，仅允许自身 bundle、内联受控样式、`data:` 字体/图片以及专用导出资源协议；
- 阻止 HTTP、HTTPS、file、blob 及未列入白名单的请求。

开发构建加载页面时只允许精确的本机 Renderer Dev Server 页面来源；该例外不允许页面继续访问任意 HTTP/HTTPS 子资源，也不存在于生产构建。

任务级资源 Lease 同时绑定随机 Token、当前 Local Profile ID、Attachment ID、用途 `NOTE_EXPORT`、操作 ID 和过期时间。专用协议 Handler 与 BrowserWindow 使用同一个临时 Session，并仍经过当前解锁会话校验。成功、失败、取消、锁定或窗口销毁时成组撤销并注销 Handler；过期是额外防线，不替代任务终态撤销。

目标路径、文件句柄、附件密钥、Manifest、Blob 路径和解密流只存在于 Main。隐藏页面只接收 ADF、显示所需附件元数据和短期 URL。

隐私日志不得记录：

- 笔记标题或 ADF；
- 附件名称、MIME 之外的内部元数据或字节；
- 目标路径或 `.part` 路径；
- Token、密钥、Manifest、Blob ID 或数据库标识；
- 原始 Error message、堆栈或 Chromium 页面内容。

## 8. 取消、清理与错误映射

Operation 的 AbortSignal 传播到附件 Reader、ZIP Writer、文件 Writer、PDF Host 和资源 Lease。终止时按以下顺序收敛：停止接收进度、撤销资源、销毁隐藏页面、关闭所有 Reader/Writer、等待活动操作结束、删除 `.part`、发布唯一终态。

错误映射：

- Profile 已锁定或导出中锁定：`PROFILE_LOCKED` 或任务 `CANCELLED`，遵循现有会话关闭竞态规则；
- 笔记不存在：`ENTITY_NOT_FOUND`；
- ADF 引用缺少附件元数据或 Blob 文件缺失：`BLOB_MISSING`；
- 密文、Manifest、分块认证或长度校验失败：`BLOB_CORRUPT`；
- 目标磁盘空间不足：`DISK_FULL`；
- PDF 页面失败、超时、ZIP 失败、文件冲突分配异常或未知导出错误：`EXPORT_FAILED`；
- Handler/响应 Schema 等 IPC 边界失败：`IPC_OPERATION_FAILED`。

任一实际引用附件失败时整个导出失败，不产生缺附件的部分结果。非法公式、非法 Mermaid 和有明确占位的未知 ADF 节点属于成功但有损的导出，不属于任务失败。

普通异常、用户取消、Profile 锁定和正常应用退出都删除 `.part`。操作系统或进程被强制终止时，用户目录可能留下 `.part` 文件；它不具有最终扩展名，永远不被报告为成功结果。系统不持久化用户目标路径，因此不会为强制崩溃遗留文件建立跨启动扫描。

## 9. IPC 与共享 Schema 变更

公开请求保持：

```ts
export.startNote({
  noteId,
  format: 'MARKDOWN' | 'PDF',
})
```

不增加草稿 ADF、目标路径、覆盖开关或压缩开关。是否 ZIP 由当前已保存 ADF 的实际附件引用自动决定。

`exportReportSchema` 增加：

```ts
packaging: 'DIRECT' | 'ZIP'
```

`OperationSuccessByKind` 增加 `NOTE_EXPORT`，`ActiveOperationKind` 包含 `NOTE_EXPORT`。Main Runtime 的启用合约断言不再排除 `export.startNote`，全部请求合约必须有且只有一个真实 binding。

主 Preload 已有 `window.notera.export.startNote`，保持显式白名单方式。隐藏 export-preload 使用另一套内部类型，不暴露或复用完整主 Preload API。

## 10. 测试设计

### 10.1 纯转换包

- ADF 标题、段落、Marks、列表、任务、引用、代码和 GFM 表格；
- 公式与 Mermaid；
- 图片与普通附件相对链接；
- 重复 Attachment ID 去重；
- 未引用附件排除；
- 未知节点明确占位和有损数量；
- 原始 HTML 不输出；
- Windows 非法字符、保留名、尾随点/空格、空标题、超长名称和大小写不敏感重名；
- 正文、ZIP 和附件编号保持确定性；
- ZIP 条目路径穿越输入被拒绝。

### 10.2 Main 编排与写入

- 无附件 Markdown/PDF 选择直接文件；
- 有附件 Markdown/PDF 选择 ZIP，内部正文名与用户基名一致；
- 分页列出附件并只打开实际引用 Reader；
- 同一附件只流式写一次；
- 用户取消对话框不创建 Operation；
- 第二个 `NOTE_EXPORT` 不打开对话框；
- 目标存在时自动编号且不覆盖；
- `.part` 完成后同步、关闭并重命名；
- Reader、ZIP、PDF、磁盘满、取消和锁定失败均关闭资源并删除 `.part`；
- BLOB_MISSING、BLOB_CORRUPT、DISK_FULL 和 EXPORT_FAILED 安全映射；
- 强制异常不把路径、标题、ADF 或附件名写入日志和 IPC。

### 10.3 PDF Host 与隐藏 Renderer

- BrowserWindow 固定安全参数和独立 Session；
- 专用 Preload 不暴露 `window.notera`；
- 导航、新窗口、权限、下载与远程请求被阻止；
- 内部载荷和回报双向 Schema 校验；
- 字体、图片和 Mermaid 未完成时不打印；
- 完成后使用 A4、背景打印与固定页边距；
- PDF 后处理只保留用户外部链接和 `assets/` 相对附件链接，不泄漏页面 URL、专用协议、Token 或路径；
- 非法公式、Mermaid 和未知节点显示占位并计数；
- 超时、崩溃、取消和 Profile 锁定销毁窗口并撤销所有 Lease。

### 10.4 Operation、IPC 与 Runtime

- `NOTE_EXPORT` 的进度、成功、失败和取消终态；
- 高频进度最多每 100 毫秒发送，阶段变化与 0/1 不丢失；
- `operation.completed` 每个任务最多一次；
- 成功报告包含 `packaging` 且不含敏感字段；
- Renderer 重载后 `operation.getStatus` 可恢复同会话状态；
- `export.startNote` 请求/响应与错误集合校验；
- Runtime 完整性断言包含导出并拒绝缺失、重复或额外 binding。

## 11. 最终验证

实施过程中只运行当前完整功能模块相关的单元测试。全部模块完成后只执行一次必要最终验证：

- `packages/export` 相关单元测试全集；
- `src/main/export`、导出 Handler、Operation、Runtime 与隐藏 Renderer 相关测试全集；
- workspace 与 app TypeScript 检查；
- 依赖方向检查；
- 本次涉及文件的 ESLint；
- production Main、Preload 和 Renderer build。

若检查失败，只修复对应原因并复测该失败项；未受影响且已通过的检查不重复运行。最终验证不运行未受影响的 Domain、Crypto、Storage、Attachment 或 Application 全部测试，也不进入同步范围。

## 12. 完成标准

- `export.startNote` 接通真实 Main handler，并受当前窗口主 Frame、Schema 和 Session Gate 保护；
- 无附件时直接输出 Markdown/PDF，有附件时自动输出包含正文和 `assets/` 的 ZIP；
- 当前 ADF 实际引用的所有附件完整导出，未引用、历史、回收站和其他笔记附件不泄漏；
- Markdown 不静默丢节点，PDF 与 Atlaskit 只读视图高度一致并明确报告有损节点；
- 文件名、附件名、ZIP 条目和目标冲突符合 Windows 安全规则且从不覆盖已有结果；
- 附件全程流式读取，目标目录之外不产生明文临时文件；
- 进度和完成通知足够 UI 显示阶段、比例、成功、失败和取消，并且不携带敏感内容；
- 取消、锁定、正常退出和所有可处理失败关闭 Reader、窗口、Lease、Writer 并删除 `.part`；
- 隐藏 Renderer 不能访问 Node、主窗口 API、远程资源、任意导航或真实路径；
- Renderer 主界面、编辑器编辑态、内存草稿导出和任何同步能力未被提前实现或占位。
