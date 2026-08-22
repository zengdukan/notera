# Notera Electron Main / Preload / IPC 核心装配设计

- 状态：已确认
- 日期：2026-08-22
- 所属阶段：离线桌面版 Electron 组合根与进程边界
- 前置设计：总体架构、离线 IPC 合约、Profile 生命周期、本地笔记用例、附件编排

## 1. 目标与范围

本阶段把已经完成的 `ProfileManager`、`LocalNotesService` 和
`LocalAttachmentsService` 接入 Electron Main 与现有 `src/shared` IPC 合约，建立
可测试、可关闭且不泄漏敏感数据的桌面组合根。

本阶段覆盖：

- Profile 创建、解锁、锁定、切换、重命名、修改主密码和从设备移除；
- 内容树、笔记、标签、收藏、历史、回收站、批量操作和搜索；
- 附件列表、系统文件选择、流式导入、移除、短期预览 URL 和流式另存为；
- 长任务状态、进度、取消和完成事件；
- 系统锁屏、系统休眠、15 分钟无操作超时和应用退出时的统一锁定流程；
- BrowserWindow、导航、IPC 调用方和隐私日志的安全边界；
- Preload 现有白名单桥的完整性修正，包括补齐 `history.rename`。

本阶段不实现：

- `export.startNote` 的 Main handler、Markdown/PDF 生成或任何导出占位实现；
- Renderer 页面、状态管理或 Atlassian Editor 集成；
- 设置界面或可配置的无操作锁定时长；
- 同步协议、同步引擎、云端 API、同步 Outbox、同步冲突、远端附件状态或任何同步占位结构。

完成本阶段后，下一个独立子项目是单笔记 Markdown/PDF 导出；导出完成后再开始
Renderer 与 Atlassian Editor 集成。

## 2. 核心方案

采用模块化 Main Runtime。`src/main/main.ts` 只负责 Electron 启动、窗口创建和退出
编排；`MainRuntime` 是唯一组合根，统一持有 Profile Manager、IPC Router、操作注册
表、Media Gateway、自动锁定控制器和文件访问端口。

不采用以下方案：

- 不在 `main.ts` 直接堆叠全部 `ipcMain.handle()`，避免业务适配、文件流和生命周期
  混成不可独立测试的单文件；
- 不使用按方法名动态反射的通用分发器，因为 Profile、笔记、附件和系统对话框存在
  不同参数及安全边界，隐式映射难以审计。

## 3. 组件与代码边界

建议代码组织如下，计划阶段可以调整不改变职责边界的文件名：

```text
src/main/
  main.ts                         # Electron 启动和窗口生命周期
  runtime.ts                      # MainRuntime 组合根与幂等关闭
  ipc/
    router.ts                     # 合约驱动的注册、校验和安全响应
    errors.ts                     # Application/文件错误到 IPC 错误的映射
    profile-handlers.ts
    local-notes-handlers.ts
    attachment-handlers.ts
    operation-handlers.ts
  operations/
    registry.ts                   # 当前解锁会话内的长任务状态机
    types.ts
  attachments/
    file-access.ts                # 系统对话框、读流、暂存写入和 MIME 映射
    media-gateway.ts              # notera-media: Token 与协议响应
  lifecycle/
    auto-lock.ts                  # 锁屏、休眠和系统无操作检测
    session-lock.ts               # 取消任务、撤销 Token、锁定和事件广播
```

### 3.1 MainRuntime

Main 模块在 `app.whenReady()` 之前声明 `notera-media:` 的固定特权；Electron Ready 后才
安装实际协议处理器，并以 `app.getPath('userData')` 作为应用数据根目录创建唯一
`ProfileManager` 和唯一 `MainRuntime`。Runtime 只向 handler 暴露窄接口，不公开数据库、
密钥、附件真实路径或底层 Store。

Ready 后的 Runtime 启动顺序为：创建 Profile Manager、安装协议处理器、创建窗口、绑定
窗口、注册 IPC、启动生命周期监听。关闭时先同步拒绝新 IPC，再停止生命周期监听、取消
运行任务、撤销 Media Token、移除 handler、关闭 Profile Manager，最后释放窗口引用。
并发或重复关闭复用同一个 Promise。

### 3.2 IPC Router 与 handlers

Router 使用 `src/shared` 请求描述符注册固定 Channel。每个调用按以下顺序执行：

```text
验证调用方窗口和主 Frame
  -> 使用请求 Schema 再次解析输入
  -> 调用模块 handler
  -> 构造 IpcResponse
  -> 使用当前合约响应 Schema 校验
  -> 返回安全响应
```

Preload 的验证只用于尽早拒绝错误输入，不是 Main 的安全边界。Router 只接受当前 Notera
窗口主 Frame 的调用；其他窗口、子 Frame、已销毁窗口或非当前绑定 WebContents 返回
固定失败。

Profile、Local Notes 和普通附件 handler 只做 DTO/品牌 ID 映射、空成功结果包装和错误
映射，不重复 Application 业务规则。所有已启用请求描述符有且只有一个 handler；
`export.startNote` 明确保留为未启用合约，本阶段不注册失败占位 handler。

`src/main/preload.ts` 继续显式组装白名单 `window.notera`，并补齐当前注册表已有但 Preload
和 `NoteraApi` 漏掉的 `history.rename`。

### 3.3 文件访问端口

Renderer 不传路径或附件字节。Main 的 `FileAccess` 封装 Electron 对话框和 Node 文件流：

- 导入只接受系统打开对话框返回的精确文件；
- 另存只接受系统保存对话框返回的精确目标；
- 文件名取所选路径的 basename，不把完整路径传给 Application 或 Renderer；
- MIME 使用保守的本地扩展名白名单，未知类型固定为
  `application/octet-stream`，不信任 Renderer 或文件内部声明；
- 文件大小在启动导入前做快速检查，实际 100 MiB 上限仍由现有附件导入实现强制执行。

`FileAccess` 是可替换端口，handler 单元测试使用 fake，不弹出真实系统窗口。

## 4. Profile 与应用生命周期

### 4.1 统一锁定协调器

手动锁定、切换、系统锁屏、系统休眠、无操作超时和应用退出都使用同一个锁定协调器：

1. 合并正在执行的相同锁定请求；
2. 停止接受需要当前会话的新任务；
3. 取消当前操作注册表中的运行任务；
4. 撤销全部 Media Token；
5. 调用 `ProfileManager.lockProfile()` 或退出时调用 `ProfileManager.close()`；
6. 发布通过共享 Schema 验证的 `profile.locked` 事件；
7. 清除当前操作记录和会话代次。

手动锁定发布 `MANUAL`，系统锁屏发布 `SYSTEM_LOCK`，系统休眠发布
`SYSTEM_SUSPEND`，无操作超时发布 `IDLE_TIMEOUT`，应用关闭发布
`SESSION_CLOSED`。

Profile 切换开始时立即发布 `SWITCHED`，要求 Renderer 清除旧 Profile 的敏感内容；随后
调用 Application 切换用例。即使目标密码错误，旧 Profile 内容也不能继续显示。Application
仍是实际关闭旧 Session 和解锁目标 Session 的唯一业务编排者。

Profile 创建、解锁或切换成功后开始新的会话代次。确认移除的目标若是当前 Profile，Main
先以 `MANUAL` 原因完成统一锁定，再调用 Application 移除；这样任务、Token 和 Renderer
敏感状态不会因 Application 内部关闭 Session 而绕过 Main 清理。

### 4.2 无操作锁定

本阶段不引入设置模块。固定规则为系统连续无操作 15 分钟后锁定当前 Profile。
`AutoLockController` 周期性读取 `powerMonitor.getSystemIdleTime()`；锁定状态下不重复调用
Application。系统锁屏与休眠事件始终立即锁定，不等待轮询。

无操作检测使用系统级输入时间，不通过 Renderer 上报鼠标或键盘事件，避免 Renderer 控制
安全计时器。后续设置子项目可以把 15 分钟替换为经校验的配置，但不能改变统一锁定流程。

### 4.3 应用退出

退出过程允许当前清理异步完成，但不能启动第二次关闭。关闭开始后新 IPC 立即失败；运行中
文件操作收到取消信号并清理未完成明文；Profile Manager 关闭数据库、附件资源并清零密钥。
窗口关闭、`before-quit` 和显式退出最终收敛到同一个 Runtime 关闭 Promise。

## 5. 长任务注册表

本阶段运行的任务类型只有 `ATTACHMENT_IMPORT` 和 `ATTACHMENT_SAVE_AS`。注册表的状态机为：

```text
RUNNING -> SUCCEEDED | FAILED | CANCELLED
```

终态不可再次变化。每个任务持有随机 UUID、任务类型、阶段、有界进度、AbortController 和
当前会话代次，不持有供查询返回的路径、文件名、ADF 或明文字节。

操作注册表遵循以下规则：

- 用户取消文件对话框时不创建任务，启动接口返回 `cancelled`；
- 创建任务后启动接口立即返回 `operationId`，后续失败进入任务终态；
- 进度是 `0..1` 的有限数或 `null`，阶段只使用共享枚举；
- 完成事件每个任务最多发送一次；
- `operation.cancel` 对运行任务触发取消，对终态任务返回既有终态；
- Renderer 重载后可以在同一解锁会话查询状态；
- 锁定、切换或退出时取消任务，在发布必要终态后清空记录；新会话不能查询旧会话任务。

后续单笔记导出复用该组件并新增 `NOTE_EXPORT` 执行器，不在本阶段创建空执行器。

## 6. 附件流程

### 6.1 流式导入

`attachment.startImport` 先验证 Note ID，再打开系统单文件选择器。取消选择返回
`{status: 'cancelled'}`。选择文件后创建任务，以只读 AsyncIterable 调用
`localAttachments.importAttachment()`，并把任务取消信号传入 Application。

进度通过源文件已读取字节数和 stat 总长度计算，只公开阶段与比例。Profile 锁定、用户取消、
读取失败、超限或 Application 失败时关闭源流；现有附件编排负责数据库、Blob 和引用补偿。

### 6.2 流式另存为

`attachment.startSaveAs` 先验证 Attachment ID 并打开系统保存对话框。选择目标后创建任务，
调用 `localAttachments.openReader()`，把解密流写入目标同目录下的随机临时文件。

成功时同步并原子发布到用户确认的目标；失败、取消或锁定时关闭 Reader 并删除精确临时文件。
写入 `ENOSPC` 映射为 `DISK_FULL`，其他写出失败映射为
`ATTACHMENT_SAVE_FAILED`。真实目标和临时路径不进入事件、响应或日志。

### 6.3 Media Gateway

`attachment.getPreviewUrl` 为当前 Profile 与 Attachment ID 生成随机内存 Token，默认有效期
5 分钟，返回 `notera-media:` URL 和过期时间。Token 不落盘、不进入日志，并在锁定、切换
或退出时立即全部失效。

协议处理器仅接受自身生成的 Token。验证后通过 `openReader()` 流式响应完整内容或一个合法
的 HTTP Range；拒绝非法、多段或越界 Range。响应包含受控 MIME、长度、`nosniff`、禁止
缓存和安全的 Content-Disposition，不暴露 Blob、Manifest、File Key 或真实路径。

## 7. 窗口与协议安全

BrowserWindow 显式配置：

- `contextIsolation: true`；
- `sandbox: true`；
- `nodeIntegration: false`；
- `webSecurity: true`；
- 只加载 Notera 自身入口与固定 Preload。

Main 阻止 Renderer 导航到非应用入口。`setWindowOpenHandler` 默认拒绝，只允许明确白名单的
`https:` 链接交给系统浏览器；拒绝 `file:`、`javascript:`、任意自定义协议和系统命令。
权限请求默认拒绝，只有后续明确设计并测试的能力才能加入白名单。

移除 Electron React Boilerplate 的自动更新检查。在 Notera 自有更新源、签名、发布清单和
验证流程建立前，应用不向样板仓库或其他更新源发起检查。

从设备移除 Profile 属于破坏性操作。Main 使用原生确认框；取消返回
`{status: 'cancelled'}`，确认后才调用 `removeProfileFromDevice()`，成功返回
`{status: 'removed'}`。

## 8. 错误与隐私日志

Main Router 只返回共享错误目录中的固定码和固定消息：

- 所有请求响应 Schema 共同允许 `INVALID_IPC_REQUEST`，确保 Main 独立验证失败仍能返回
  合法安全包络；
- `ApplicationError` 只有在当前请求声明允许时才透传对应码；
- `OPERATION_FAILED`、`APPLICATION_CLOSED`、`REMOVE_FAILED`、未允许的 Application
  错误和未知异常统一为 `IPC_OPERATION_FAILED`；
- 文件 `ENOSPC` 映射为 `DISK_FULL`；附件文件边界的其他错误按操作映射为固定导入或另存
  失败；
- 已启动任务的失败通过 `operation.completed` 和状态查询表达，不把异步失败塞回启动响应。

生产日志采用字段白名单，只允许固定错误码、随机操作 ID、任务阶段、耗时和非敏感计数。
禁止记录主密码、密钥、Profile 名、标题、正文、目录、标签、搜索词、附件名、MIME、路径、
ADF、Media Token、IPC 参数、底层异常消息或堆栈。

## 9. 测试策略

测试按完整、可独立验证的功能模块组织，使用 fake Electron 端口和临时目录，优先验证功能
逻辑而不是依赖真实桌面交互。

### 9.1 Router 与 handler

- 请求与响应双重校验；
- 当前窗口主 Frame 限制；
- 已启用合约恰好注册一个 handler，导出明确未注册；
- Profile、笔记和附件 DTO 映射；
- Application 错误、未知错误和文件错误的安全映射；
- `history.rename` 通过 Preload 暴露并使用固定 Channel；
- 非法响应、异常对象和路径不会越过 IPC。

### 9.2 生命周期

- 手动锁定、切换、系统锁屏、休眠和 15 分钟无操作锁定；
- 切换失败时旧内容清除事件仍已发布；
- 重复锁定和退出事件合并；
- 关闭开始后拒绝新请求，任务、Token 和 Profile 资源只清理一次；
- 系统活动重置空闲判断，锁定状态不重复关闭。

### 9.3 操作与文件

- 合法状态迁移、进度边界、取消幂等和完成事件恰好一次；
- 同会话 Renderer 重载查询与跨会话清空；
- 对话框取消不创建任务；
- 导入流、实际大小上限、取消、锁定和读失败；
- 另存随机临时文件、成功发布、取消清理和磁盘满；
- MIME 白名单与未知类型回退。

### 9.4 Media Gateway 与窗口安全

- Token 随机性、5 分钟过期、Profile 绑定和锁定失效；
- 完整读取、合法单 Range、非法/多段/越界 Range；
- MIME、长度、安全头和真实路径不泄漏；
- BrowserWindow 安全选项、导航限制、外部协议白名单和权限默认拒绝；
- 启动过程不再创建 Boilerplate 自动更新器。

实施过程中只运行当前功能模块相关单元测试。全部模块完成后只执行一次必要最终验证：Main、
Shared 和 Preload 相关测试全集，以及按实际改动需要执行的 typecheck、依赖边界检查、lint 和
production Main build。失败时只针对失败原因修复并复测。

## 10. 完成标准

- 除 `export.startNote` 外，当前 Profile、笔记和附件 IPC 全部接通真实 Application 用例；
- Main 独立校验请求、响应和事件，并拒绝非当前窗口主 Frame；
- Profile 的全部锁定来源使用同一安全关闭流程；
- 15 分钟系统无操作会锁定，系统锁屏和休眠立即锁定；
- 附件导入、预览、另存和取消不跨 IPC 暴露路径或大文件字节；
- 操作状态只在当前解锁会话有效，锁定后任务和 Token 全部失效；
- BrowserWindow、导航、协议、权限和日志满足本设计安全边界；
- Preload 白名单包含全部已启用 API，包括 `history.rename`；
- 不包含 Renderer、编辑器、笔记导出或任何同步实现和占位结构；
- 总体架构固定顺序更新为“核心 Electron 装配 -> 单笔记导出 -> Renderer -> E2EE 同步”。
