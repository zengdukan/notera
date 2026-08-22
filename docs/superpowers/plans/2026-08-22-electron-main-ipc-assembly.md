# Notera Electron Main / Preload / IPC 核心装配实施计划

> **执行要求：** 使用 `superpowers:executing-plans` 在当前会话按功能模块顺序实施。遵守仓库 `AGENTS.md`：不使用子代理或重复审核；每个模块把测试与实现一起完成并提交；所有模块完成后只执行一次必要的最终验证。

**目标：** 建立安全、类型化、可关闭的 Electron Main 组合根，把现有 Profile、本地笔记和附件 Application 用例接入真实 IPC、系统文件操作、短期媒体协议和桌面生命周期。

**架构：** `MainRuntime` 是唯一桌面组合根，持有 `ProfileManager`、合约驱动的 IPC Router、会话级 `OperationRegistry`、`MediaGateway` 和 `SessionLifecycle`。Main handler 只做 DTO、Electron 与 Application 之间的薄适配；文件路径、明文字节、数据库和密钥均不跨 IPC，锁定、切换和退出使用同一关闭流程。

**技术栈：** TypeScript 5.8、Electron 42、Node.js Streams/File System、Zod 4、Jest 29、ts-jest、Webpack 5。

**设计规格：** `docs/superpowers/specs/2026-08-22-electron-main-ipc-assembly-design.md`

---

## 范围与实施顺序

本计划包含七个完整、可独立测试的功能模块，必须按依赖顺序实施：

1. Shared 传输修正、Preload 完整性与 Main IPC 安全路由；
2. 本地笔记、组织、历史、回收站和搜索 IPC handler；
3. 当前解锁会话内的长任务注册表；
4. 附件导入、另存、列表、移除与 Operation IPC；
5. `notera-media:` 短期预览协议；
6. Profile handler、统一锁定协调与 15 分钟自动锁定；
7. MainRuntime、安全窗口、协议和应用退出的最终装配。

测试与实现属于同一个功能模块任务，不拆成“编写失败测试、运行失败测试、编写实现、运行成功测试”等微步骤。实施期间只运行本模块列出的单元测试；每个模块测试通过后提交一次。第七个模块完成代码后执行一次必要的最终验证，再提交该完整模块。

本计划不实现 `export.startNote` Main handler、Markdown/PDF 生成、Renderer 页面、Atlassian Editor、设置界面、同步协议、同步引擎、云端 API、同步 Outbox、同步冲突或远端附件状态，也不创建这些能力的占位实现。单笔记导出是本计划完成后的下一个独立子项目，完成导出后才进入 Renderer 集成。

## 实施后的文件职责

```text
src/shared/ipc/
  common.ts                              # 所有请求共同允许安全的非法请求响应
  api.ts                                 # NoteraApi 补齐 history.rename
  __tests__/common.test.ts               # 公共传输错误回归

src/main/
  main.ts                                # Electron 早期协议声明、启动与退出入口
  runtime.ts                             # MainRuntime 唯一组合根与幂等关闭
  window.ts                              # BrowserWindow 安全配置、导航和权限策略
  menu.ts                                # Notera 基础菜单，不保留样板外链
  preload.ts                             # 显式白名单桥，补齐 history.rename
  ipc/
    router.ts                            # 调用方、请求、响应校验和 handler 注册/移除
    errors.ts                            # Application/文件错误到安全 IPC 错误
    local-notes-handlers.ts              # 39 个本地笔记与组织用例绑定
    attachment-handlers.ts               # 附件与 Operation 请求绑定
    profile-handlers.ts                  # Profile 请求、确认删除与生命周期绑定
    __tests__/
      router.test.ts
      local-notes-handlers.test.ts
      attachment-handlers.test.ts
      profile-handlers.test.ts
  operations/
    registry.ts                          # 会话级长任务状态机、查询、取消和事件
    types.ts                             # 执行器、事件 Sink 与成功结果类型
    __tests__/registry.test.ts
  attachments/
    file-access.ts                       # 原生对话框、MIME、读流和原子暂存写入
    media-gateway.ts                     # Token、Range、协议 Response 和 Reader 关闭
    __tests__/
      file-access.test.ts
      media-gateway.test.ts
  lifecycle/
    session-lock.ts                      # Session Gate、锁定、切换、移除和关闭
    auto-lock.ts                         # powerMonitor 锁屏/休眠和系统空闲轮询
    __tests__/
      session-lock.test.ts
      auto-lock.test.ts
  __tests__/
    helpers.ts                           # Main 测试的 fake Electron/Application 端口
    runtime.test.ts                      # 组合完整性、事件发布和关闭顺序
    window.test.ts                       # 窗口、导航、权限和外链安全策略

src/__tests__/
  preload.test.ts                        # Preload 固定 API、history.rename 和事件桥

package.json
package-lock.json                        # 移除样板自动更新运行时依赖
```

---

## 功能模块 1：Shared 传输、Preload 与 IPC 安全路由

**目标与功能逻辑**

先建立所有后续 handler 共用的唯一安全入口。Main 不能信任 Preload，必须独立校验调用方、请求和响应；Preload 继续显式暴露固定业务 API，并补齐已经存在于 Registry、但当前 `NoteraApi` 与实现漏掉的 `history.rename`。

`createIpcResponseSchema()` 将 `INVALID_IPC_REQUEST` 作为每个请求都允许的传输错误加入当前合约错误集合，且继续拒绝不属于该请求的其他业务错误。Preload 本地校验失败仍直接返回同一固定错误，不调用 Electron。

新增 Router 端口与绑定类型：

```ts
interface IpcInvokeEventLike {
  readonly sender: { readonly id: number };
  readonly senderFrame?: { readonly routingId: number; readonly parent: unknown };
}

interface IpcMainPort {
  handle(
    channel: string,
    listener: (event: IpcInvokeEventLike, input: unknown) => Promise<unknown>,
  ): void;
  removeHandler(channel: string): void;
}

interface IpcSenderPolicy {
  allows(event: IpcInvokeEventLike): boolean;
}

interface IpcBinding {
  readonly key: keyof typeof requestContracts;
  readonly contract: (typeof requestContracts)[keyof typeof requestContracts];
  invoke(input: unknown): Promise<unknown> | unknown;
}

function defineIpcBinding<Key extends keyof typeof requestContracts>(
  key: Key,
  invoke: (
    input: z.output<(typeof requestContracts)[Key]['request']>,
  ) => Promise<z.input<(typeof requestContracts)[Key]['data']>> |
       z.input<(typeof requestContracts)[Key]['data']>,
): IpcBinding;
```

`registerIpcBindings()` 拒绝重复 Key 或 Channel，使用请求 Schema 解析 Main 收到的原始值，调用绑定后把数据包装为 `{ret:true,data}` 并使用合约响应 Schema 再校验。调用方不合法、未知异常、handler 返回非法数据或当前合约不允许的 Application 错误全部返回固定 `IPC_OPERATION_FAILED`；请求形状非法返回固定 `INVALID_IPC_REQUEST`。注册函数返回幂等 disposer，只移除本次精确注册的 Channel。

`mapIpcError(contract, error)` 只在 `error instanceof ApplicationError` 且 `error.code` 同名存在于 Shared 错误目录并被当前 contract 允许时透传。`OPERATION_FAILED`、`APPLICATION_CLOSED`、`REMOVE_FAILED`、`OPERATION_ABORTED`、不允许的 Application 错误和所有未知异常统一为 `IPC_OPERATION_FAILED`，不读取底层 `message` 或堆栈。

`NoteraApi.history` 增加：

```ts
readonly rename: InvokeMethod<Request<'history.rename'>>;
```

Preload 对应绑定 `requestContracts['history.rename']`。测试更新公开 API Key，不增加任意 Channel 调用能力。

**涉及文件**

- 修改：`src/shared/ipc/common.ts`
- 修改：`src/shared/ipc/api.ts`
- 修改测试：`src/shared/ipc/__tests__/common.test.ts`
- 修改：`src/main/preload.ts`
- 新建：`src/main/ipc/router.ts`
- 新建：`src/main/ipc/errors.ts`
- 新建测试：`src/main/ipc/__tests__/router.test.ts`
- 修改测试：`src/__tests__/preload.test.ts`

**单元测试**

- 公共响应 Schema 接受固定 `INVALID_IPC_REQUEST`，仍拒绝未声明业务错误和伪造消息；
- Router 只接受 sender policy 认可的主 Frame，拒绝其他窗口和子 Frame；
- 请求在 Main 再次校验，非法输入不调用 handler；
- handler 成功数据通过响应 Schema 后返回，非法数据收口为固定失败；
- 合法 Application 错误按当前 contract 透传，未允许/未知错误不泄漏；
- 重复 Key/Channel 注册失败，disposer 幂等且只移除本次 Channel；
- Preload 暴露 `history.rename`，调用固定 `notera:history:rename`，请求和响应继续双重校验。

**精确测试命令**

```powershell
npm test -- --runInBand src/shared/ipc/__tests__/common.test.ts src/main/ipc/__tests__/router.test.ts src/__tests__/preload.test.ts
```

预期：3 个测试文件全部通过，0 个失败；不得运行其他包测试、全量 lint、typecheck 或 build。

**完成后的提交**

```powershell
git add src/shared/ipc/common.ts src/shared/ipc/api.ts src/shared/ipc/__tests__/common.test.ts src/main/preload.ts src/main/ipc/router.ts src/main/ipc/errors.ts src/main/ipc/__tests__/router.test.ts src/__tests__/preload.test.ts
git commit -m "feat(main): add validated ipc router"
```

---

## 功能模块 2：本地笔记与组织 IPC handler

**目标与功能逻辑**

把 `ProfileManager.localNotes` 的 39 个现有业务方法完整绑定到 Shared 合约，但不接入 Profile 生命周期、附件、Operation 或导出。新增一个窄的 Session Gate，使后续锁定协调器能在切换、锁定和退出开始后同步拒绝新业务调用；本模块测试使用始终开放的 fake Gate。

```ts
interface SessionCommandGate {
  run<Result>(operation: () => Promise<Result> | Result): Promise<Result>;
}

function createLocalNotesBindings(input: {
  readonly service: LocalNotesService;
  readonly gate: SessionCommandGate;
}): readonly IpcBinding[];
```

绑定按以下规则建立，表中“直传”表示把解析后的整个请求传给同名语义的 Application 方法：

| IPC Key | Application 调用 | 成功转换 |
| --- | --- | --- |
| `contentTree.listChildren` | `listChildren(input)` | 直传结果 |
| `contentTree.createFolder` | `createFolder(input)` | 直传结果 |
| `contentTree.renameFolder` | `renameFolder(input)` | 直传结果 |
| `contentTree.moveFolder` | `moveFolder(input)` | 直传结果 |
| `contentTree.trashFolder` | `trashFolder(input.folderId)` | 直传结果 |
| `note.create` | `createNote(input)` | 直传结果 |
| `note.get` | `getNote(input.noteId)` | 直传结果 |
| `note.saveDraft` | `saveDraft(input)` | 直传结果 |
| `note.move` | `moveNote(input)` | 直传结果 |
| `note.copy` | `copyNote(input)` | 直传结果 |
| `note.trash` | `trashNote(input.noteId)` | 直传结果 |
| `note.listRecent` | `listRecent(input)` | 直传结果 |
| `tag.list` | `listTags(input)` | 直传结果 |
| `tag.create` | `createTag(input.name)` | 直传结果 |
| `tag.rename` | `renameTag(input)` | 直传结果 |
| `tag.delete` | `deleteTag(input.tagId)` | `{}` |
| `tag.addToNote` | `addTagToNote(input)` | `{}` |
| `tag.removeFromNote` | `removeTagFromNote(input)` | `{}` |
| `favorite.list` | `listFavorites(input)` | 直传结果 |
| `favorite.add` | `addFavorite(input.noteId)` | `{}` |
| `favorite.remove` | `removeFavorite(input.noteId)` | `{}` |
| `favorite.reorder` | `reorderFavorite(input)` | `{}` |
| `batch.move` | `batchMove(input)` | `{}` |
| `batch.addTags` | `batchAddTags(input)` | `{}` |
| `batch.removeTags` | `batchRemoveTags(input)` | `{}` |
| `batch.copy` | `batchCopy(input)` | `{}` |
| `batch.trash` | `batchTrash(input)` | 直传结果 |
| `history.list` | `listHistory(input)` | 直传结果 |
| `history.get` | `getHistory(input)` | 直传结果 |
| `history.createPermanent` | `createPermanentVersion(input)` | 直传结果 |
| `history.rename` | `renameHistoryVersion(input)` | 直传结果 |
| `history.compare` | `compareHistory(input)` | 直传结果 |
| `history.restore` | `restoreHistory(input)` | 直传结果 |
| `history.copy` | `copyHistory(input)` | 直传结果 |
| `trash.list` | `listTrash(input)` | 直传结果 |
| `trash.restore` | `restoreTrash(input)` | `{}` |
| `trash.deletePermanent` | `deleteTrashPermanent(input.trashEntryId)` | 直传结果 |
| `trash.purgeExpired` | `purgeExpiredTrash()` | 直传结果 |
| `search.query` | `search(input)` | 直传结果 |

每个调用都必须在 `gate.run()` 内执行。绑定不能导入 Electron，不能重新校验领域规则，也不能把 Vault ID、数据库或路径加入 DTO。返回 `void` 的 Application 方法统一转换为严格空对象。

**涉及文件**

- 新建：`src/main/ipc/local-notes-handlers.ts`
- 新建测试：`src/main/ipc/__tests__/local-notes-handlers.test.ts`
- 按测试需要新建：`src/main/__tests__/helpers.ts`

**单元测试**

- 绑定 Key 集合精确等于上述 39 个 Registry Key，无缺失、重复、附件、Profile、Operation、导出或同步 Key；
- 表驱动 fake `LocalNotesService` 证明每个请求调用正确方法并传递正确输入；
- Folder/Note/Tag/Favorite 的标量提取和所有 `void -> {}` 转换正确；
- `history.rename` 调用 `renameHistoryVersion`，`versionName: null` 原样保留；
- Gate 拒绝时 Application 方法不执行且错误交给 Router 映射；
- 每个绑定的最小合法 fixture 可以通过对应成功响应 Schema。

**精确测试命令**

```powershell
npm test -- --runInBand src/main/ipc/__tests__/local-notes-handlers.test.ts
```

预期：该测试文件全部通过，39 个请求映射全部被覆盖，0 个失败。

**完成后的提交**

```powershell
git add src/main/ipc/local-notes-handlers.ts src/main/ipc/__tests__/local-notes-handlers.test.ts src/main/__tests__/helpers.ts
git commit -m "feat(main): bind local note ipc handlers"
```

---

## 功能模块 3：会话级 OperationRegistry

**目标与功能逻辑**

实现只属于当前解锁 Session 的长任务状态机，为附件导入、另存以及后续单笔记导出提供稳定基础。本模块不访问 Electron、文件系统或 Application，只管理状态、取消信号和经过 Shared Schema 约束的事件数据。

公共接口固定为：

```ts
type ActiveOperationKind = 'ATTACHMENT_IMPORT' | 'ATTACHMENT_SAVE_AS';

interface OperationContext {
  readonly signal: AbortSignal;
  progress(phase: OperationPhase, value: number | null): void;
}

interface OperationEventSink {
  progress(payload: OperationProgressPayload): void;
  completed(payload: OperationTerminalStatus): void;
}

interface StartOperationInput<Kind extends ActiveOperationKind> {
  readonly kind: Kind;
  execute(context: OperationContext): Promise<OperationSuccessByKind[Kind]>;
  mapError(error: unknown): IpcError;
}

class OperationRegistry {
  beginSession(sessionEpoch: string): void;
  start<Kind extends ActiveOperationKind>(input: StartOperationInput<Kind>): string;
  getStatus(operationId: string): OperationStatus;
  cancel(operationId: string): Promise<OperationStatus>;
  endSession(): Promise<void>;
}
```

`OperationSuccessByKind` 严格对应 Shared 终态：附件导入返回 `{attachment}`，附件另存返回 `{completedAt}`。`beginSession()` 只允许在无活动 Session 时调用；`start()` 在未开始 Session 时抛出 `ApplicationError('PROFILE_LOCKED')`。Operation ID 使用注入的 `randomUUID`，状态从 `RUNNING` 只能单向进入 `SUCCEEDED | FAILED | CANCELLED`。

`progress()` 在任务仍为 RUNNING 时验证阶段和 `0..1 | null`，发布不含 `state` 的共享事件载荷；任务结束后忽略迟到进度。`cancel()` 对 RUNNING 任务 abort 并等待执行器 settle；若 signal 已 abort 或执行器返回 `ApplicationError('OPERATION_ABORTED')`，终态固定为 CANCELLED。终态任务直接返回既有状态，不重复发完成事件。

`endSession()` 先同步禁止新任务，再 abort 全部运行任务，等待所有任务 settle，发布每个必要终态，最后清空任务 Map 和 Session Epoch。新 Session 无法查询旧 ID；未知或跨 Session ID 抛出 `ApplicationError('ENTITY_NOT_FOUND')`，由 Operation handler 在下一模块映射为 `OPERATION_NOT_FOUND`。

**涉及文件**

- 新建：`src/main/operations/types.ts`
- 新建：`src/main/operations/registry.ts`
- 新建测试：`src/main/operations/__tests__/registry.test.ts`

**单元测试**

- 未开始 Session 拒绝 start/get/cancel，开始 Session 后生成确定 UUID；
- 两种任务成功结果形成与 kind 匹配的终态；
- 合法进度发布，NaN、无穷、越界值和终态后的迟到进度不进入 Renderer；
- 执行失败使用注入映射形成安全 FAILED 状态，不包含原始异常；
- cancel 等待执行器退出、返回 CANCELLED、完成事件恰好一次且重复取消幂等；
- 完成与取消竞态只能产生一个终态；
- endSession 取消全部任务并清空，下一 Session 查询旧 ID 失败；
- 同一时刻不能覆盖已有 Session Epoch。

**精确测试命令**

```powershell
npm test -- --runInBand src/main/operations/__tests__/registry.test.ts
```

预期：Operation 状态机、竞态和 Session 隔离测试全部通过，0 个失败。

**完成后的提交**

```powershell
git add src/main/operations/types.ts src/main/operations/registry.ts src/main/operations/__tests__/registry.test.ts
git commit -m "feat(main): manage session file operations"
```

---

## 功能模块 4：附件文件操作与 Operation IPC

**目标与功能逻辑**

实现附件列表、导入、移除、另存为以及 Operation 查询/取消，把系统路径限制在 Main 内部，并复用模块 3 的状态机。Media 预览在下一模块完成；本模块不注册 `attachment.getPreviewUrl`。

文件端口不向 handler 暴露真实路径：

```ts
interface ImportSelection {
  readonly fileName: string;
  readonly mimeType: string;
  readonly byteLength: number;
  open(input: {
    readonly signal: AbortSignal;
    readonly onBytes: (completed: number) => void;
  }): AsyncIterable<Uint8Array>;
}

interface SaveSelection {
  write(input: {
    readonly source: AsyncIterable<Uint8Array>;
    readonly byteLength: number;
    readonly signal: AbortSignal;
    readonly onBytes: (completed: number) => void;
  }): Promise<void>;
}

interface AttachmentFileAccess {
  chooseImport(): Promise<ImportSelection | null>;
  chooseSave(): Promise<SaveSelection | null>;
}
```

Electron 实现使用原生单文件打开/保存对话框。导入文件名只取 basename；MIME 扩展白名单至少固定为 `.avif`、`.gif`、`.jpg/.jpeg`、`.png`、`.webp`、`.txt` 和 `.pdf`，分别映射到标准 MIME，未知扩展为 `application/octet-stream`。选择后先 stat 并拒绝目录、符号链接、负数/不安全长度和超过 100 MiB 的文件；Application 导入仍保留实际流式上限作为最终防线。

另存使用目标同目录的 `.<basename>.notera-<uuid>.part`，以独占创建写入，处理 backpressure，成功后 `sync()`、关闭并原子 rename 到用户确认目标。失败、取消或锁定时只删除本次精确临时文件，不先删除现有目标。`ENOSPC` 映射 `DISK_FULL`，其余失败映射 `ATTACHMENT_SAVE_FAILED`。

新增绑定：

- `attachment.listForNote` -> Gate 内调用 `localAttachments.listForNote(input)`；
- `attachment.startImport` -> 选择取消返回 `cancelled`；超限直接返回业务错误；选择成功后用 OperationRegistry 启动导入，进度按已读字节/总长度发布，成功结果为 `{attachment}`；
- `attachment.removeFromNote` -> Gate 内调用并返回 `{}`；
- `attachment.startSaveAs` -> 选择取消返回 `cancelled`；任务中 `openReader()`、流式写出、finally 关闭 Reader，成功返回 `{completedAt: now()}`；
- `operation.getStatus` -> 当前 Gate 可用时查询 Registry，把未知 ID 转为 `ApplicationError('OPERATION_NOT_FOUND')` 的 Main 本地错误类型或等价固定映射；
- `operation.cancel` -> 当前 Gate 可用时调用 Registry cancel。

为避免把 Main 错误塞入 Application 包，`src/main/ipc/errors.ts` 增加本地 `MainIpcError`，只允许 Shared 错误码和固定消息；Router 同样按当前 contract 白名单映射。附件任务 `mapError` 把 Application 的 `OPERATION_ABORTED` 转为取消，其余只允许当前任务合约定义的安全错误。

**涉及文件**

- 新建：`src/main/attachments/file-access.ts`
- 新建：`src/main/ipc/attachment-handlers.ts`
- 修改：`src/main/ipc/errors.ts`
- 新建测试：`src/main/attachments/__tests__/file-access.test.ts`
- 新建测试：`src/main/ipc/__tests__/attachment-handlers.test.ts`

**单元测试**

- 打开/保存对话框取消不创建 Operation；
- 导入只使用 basename 和白名单 MIME，未知扩展回退 octet-stream；
- 目录、符号链接、超限和 stat/read 失败不调用 Application；
- 导入流进度有界，取消/锁定关闭源流，成功只返回安全 Attachment 摘要；
- 列表与移除经过 Gate，移除返回严格空对象；
- 另存逐块写入同目录随机临时文件，成功同步/关闭/rename，失败和取消清理精确临时文件；
- Reader 在成功、失败、取消和同步 throw 后都恰好关闭一次；
- Operation get/cancel 的未知 ID、Session 锁定和终态幂等符合合约；
- 绑定 Key 精确为四个非预览附件 Key与两个 Operation Key，不包含导出或同步。

**精确测试命令**

```powershell
npm test -- --runInBand src/main/attachments/__tests__/file-access.test.ts src/main/ipc/__tests__/attachment-handlers.test.ts
```

预期：2 个测试文件全部通过，0 个失败；真实系统对话框不得弹出。

**完成后的提交**

```powershell
git add src/main/attachments/file-access.ts src/main/ipc/attachment-handlers.ts src/main/ipc/errors.ts src/main/attachments/__tests__/file-access.test.ts src/main/ipc/__tests__/attachment-handlers.test.ts
git commit -m "feat(main): stream attachment file operations"
```

---

## 功能模块 5：notera-media 短期预览协议

**目标与功能逻辑**

实现不暴露真实路径的附件预览能力，并补齐 `attachment.getPreviewUrl` 绑定。协议由 Main 在 Ready 前声明固定特权，实际 handler 由 Runtime 在 Ready 后安装；本模块先实现可直接以 Web `Request/Response` 测试的纯协议核心和一个窄 Electron 适配端口。

```ts
interface MediaProtocolPort {
  handle(
    scheme: 'notera-media',
    handler: (request: Request) => Promise<Response>,
  ): void;
  unhandle(scheme: 'notera-media'): void;
}

interface MediaGateway {
  start(): void;
  issue(attachmentId: string): Promise<{ readonly url: string; readonly expiresAt: number }>;
  revokeAll(): void;
  close(): void;
}
```

Token 使用注入的 32 字节安全随机数编码为 base64url，记录 `{attachmentId, localProfileId, expiresAt}`，默认 5 分钟，URL 固定为 `notera-media://preview/<token>`。`issue()` 必须在 Session Gate 内调用 `openReader()` 验证附件当前可读，取得 MIME/长度后立即关闭验证 Reader，再保存 Token；不把文件名放入 URL 或 Token 记录。

协议请求先验证 scheme、host、单段 path、Token、过期时间和当前 `ProfileManager.getSessionState().localProfileId`。无 Range 返回 200；支持 `bytes=start-end`、`bytes=start-` 和 `bytes=-suffix` 三种单 Range，转换成 Application 的 `[start,endExclusive)` 并返回 206。多 Range、非法数字、空区间或越界返回 416 和 `Content-Range: bytes */<length>`。

成功响应只包含受控 `Content-Type`、`Content-Length`、必要的 `Content-Range`、`Accept-Ranges: bytes`、`Cache-Control: no-store`、`X-Content-Type-Options: nosniff` 和 `Content-Disposition: inline`。无效/过期/跨 Profile Token 返回无详情 404；已签发后 Reader 变为缺失或损坏返回无详情 410；未知读取失败返回无详情 500。所有分支 finally 关闭 Reader；锁定、切换、退出调用 `revokeAll()`，`close()` 同时移除协议 handler 并幂等。

`createAttachmentBindings()` 接受 `previewUrlProvider` 并新增 `attachment.getPreviewUrl`，仍经 Gate 执行。至此附件绑定精确覆盖五个附件请求。

**涉及文件**

- 新建：`src/main/attachments/media-gateway.ts`
- 修改：`src/main/ipc/attachment-handlers.ts`
- 新建测试：`src/main/attachments/__tests__/media-gateway.test.ts`
- 修改测试：`src/main/ipc/__tests__/attachment-handlers.test.ts`

**单元测试**

- issue 在锁定状态失败，可读附件生成符合 Shared Schema 的 URL 和未来 5 分钟过期时间；
- Token 长度、随机性、URL 形状、Profile 绑定和一次 revokeAll 全部验证；
- 完整流返回 200，三种合法单 Range 返回正确 206、长度、Content-Range 和精确字节；
- 多 Range、非法/越界范围返回 416；无效、过期、跨 Profile Token 返回 404；
- Reader 缺失/损坏和未知失败只返回固定状态，不泄漏错误、路径、文件名或 Token；
- 每个请求分支 Reader 恰好关闭，Gateway close 幂等并移除协议 handler；
- 附件绑定现精确覆盖五个附件请求，getPreviewUrl 经过 Gate。

**精确测试命令**

```powershell
npm test -- --runInBand src/main/attachments/__tests__/media-gateway.test.ts src/main/ipc/__tests__/attachment-handlers.test.ts
```

预期：2 个测试文件全部通过，完整流和 Range 字节断言一致，0 个失败。

**完成后的提交**

```powershell
git add src/main/attachments/media-gateway.ts src/main/ipc/attachment-handlers.ts src/main/attachments/__tests__/media-gateway.test.ts src/main/ipc/__tests__/attachment-handlers.test.ts
git commit -m "feat(main): serve session attachment previews"
```

---

## 功能模块 6：Profile 生命周期、统一锁定与自动锁定

**目标与功能逻辑**

建立 Main 的 Session 安全门和 Profile handler，把手动锁定、切换、移除当前 Profile、系统锁屏、休眠、15 分钟系统无操作和 Runtime 关闭收敛到一个可合并的流程。本模块使用窄 Electron PowerMonitor/Scheduler 端口，不创建真实窗口或顶层 Runtime。

```ts
type LockReason =
  | 'MANUAL'
  | 'SWITCHED'
  | 'SYSTEM_LOCK'
  | 'SYSTEM_SUSPEND'
  | 'IDLE_TIMEOUT'
  | 'SESSION_CLOSED';

interface ProfileEventSink {
  locked(reason: LockReason): void;
}

class SessionLifecycle implements SessionCommandGate {
  run<Result>(operation: () => Promise<Result> | Result): Promise<Result>;
  create(input: CreateProfileInput): Promise<UnlockedSession>;
  unlock(input: UnlockProfileInput): Promise<UnlockedSession>;
  switch(input: SwitchProfileInput): Promise<UnlockedSession>;
  lock(reason: Exclude<LockReason, 'SWITCHED' | 'SESSION_CLOSED'>): Promise<void>;
  remove(localProfileId: string): Promise<void>;
  close(): Promise<void>;
}
```

Gate 在 Profile 为 LOCKED、正在切换/锁定或 Runtime 正在关闭时同步拒绝新 Session 业务，返回 `ApplicationError('PROFILE_LOCKED')`；已经登记到 Application Session 的操作由现有 `ProfileSession.close()` 等待或取消。create/unlock 成功后以注入 UUID 调用 `operations.beginSession(epoch)` 并开放 Gate。

switch 若旧 Session 已解锁，先同步关闭 Gate、发布 `SWITCHED`、`operations.endSession()`、`media.revokeAll()`，再调用 `manager.switchProfile(input)`；成功后开始新 Epoch，失败时保持 Gate 关闭和 Manager LOCKED。并发 Profile 变更串行化，不能让两个 Session 同时开放。

lock 合并并发调用，顺序为关闭 Gate、`operations.endSession()`、`media.revokeAll()`、`manager.lockProfile()`，成功或稳定失败后只发布一次对应事件。remove 在原生确认已完成后调用；若目标是当前 Profile，先以 `MANUAL` 锁定，再调用 `removeProfileFromDevice()`。close 幂等，使用同一流程取消任务和 Token 后调用 `manager.close()`，原来已解锁时发布 `SESSION_CLOSED`。

Profile 绑定精确映射：

- list/getSessionState 直接调用 Manager，不要求解锁；
- create/unlock/switch 通过 SessionLifecycle；
- lock 调用 `lifecycle.lock('MANUAL')` 并返回 `{}`；
- rename/changePassword 在 Gate 内执行，void 转 `{}`；
- removeFromDevice 先调用原生确认端口，取消返回 `{status:'cancelled'}`，确认后调用 lifecycle.remove 并返回 `{status:'removed'}`。

`AutoLockController` 固定 `AUTO_LOCK_SECONDS = 15 * 60`、`IDLE_POLL_MS = 5_000`。start 注册 `powerMonitor` 的 `lock-screen` 和 `suspend`，分别调用 SYSTEM_LOCK/SYSTEM_SUSPEND；轮询 `getSystemIdleTime()`，只在当前 UNLOCKED 且达到 900 秒时调用 IDLE_TIMEOUT。所有事件调用捕获 Promise rejection 并交给只接收固定错误码的日志端口；stop 清理精确 listener 和 timer，重复 start/stop 幂等。

**涉及文件**

- 新建：`src/main/lifecycle/session-lock.ts`
- 新建：`src/main/lifecycle/auto-lock.ts`
- 新建：`src/main/ipc/profile-handlers.ts`
- 新建测试：`src/main/lifecycle/__tests__/session-lock.test.ts`
- 新建测试：`src/main/lifecycle/__tests__/auto-lock.test.ts`
- 新建测试：`src/main/ipc/__tests__/profile-handlers.test.ts`

**单元测试**

- locked/transitioning/closing Gate 拒绝，成功 create/unlock 打开新 Epoch；
- switch 先发布清理事件并结束旧 Operation/Token，再调用 Manager；密码错误后保持锁定；
- 手动、系统和 idle 锁定顺序一致，并发调用只关闭资源与发布事件一次；
- 移除非当前 Profile 不锁当前 Session，移除当前 Profile 先 MANUAL 锁定；
- close 幂等，原已锁定时不伪造 SESSION_CLOSED；
- Profile 九个 Key 精确覆盖，确认框取消不调用 Manager，void 转空对象；
- powerMonitor 锁屏/休眠立即锁定，899 秒不锁定，900 秒锁定；
- 5 秒轮询、重复 start/stop、listener/timer 清理和异步失败日志均确定；
- 自动锁定不依赖 Renderer 输入，锁定状态不重复关闭。

**精确测试命令**

```powershell
npm test -- --runInBand src/main/lifecycle/__tests__/session-lock.test.ts src/main/lifecycle/__tests__/auto-lock.test.ts src/main/ipc/__tests__/profile-handlers.test.ts
```

预期：3 个测试文件全部通过，所有锁定来源和九个 Profile 请求覆盖，0 个失败。

**完成后的提交**

```powershell
git add src/main/lifecycle/session-lock.ts src/main/lifecycle/auto-lock.ts src/main/ipc/profile-handlers.ts src/main/lifecycle/__tests__/session-lock.test.ts src/main/lifecycle/__tests__/auto-lock.test.ts src/main/ipc/__tests__/profile-handlers.test.ts
git commit -m "feat(main): coordinate secure profile locking"
```

---

## 功能模块 7：MainRuntime、安全窗口与应用装配

**目标与功能逻辑**

把前六个模块装配为真实 Electron 应用入口，确保已启用 IPC 完整覆盖、安全窗口配置、事件发布、协议生命周期和应用退出顺序全部可验证。本模块完成后，除 `export.startNote` 外的 Profile、本地笔记、附件和 Operation 合约均由真实 Main handler 服务。

`MainRuntime` 接口为：

```ts
interface MainRuntime {
  start(): Promise<void>;
  close(): Promise<void>;
}

async function createMainRuntime(input: {
  readonly appDataRoot: string;
  readonly window: BrowserWindow;
  readonly electron: MainElectronPorts;
}): Promise<MainRuntime>;
```

Runtime 创建唯一 `ProfileManager`、SessionLifecycle、OperationRegistry、MediaGateway、AttachmentFileAccess、AutoLockController 和事件 Publisher。Publisher 在发送前用 `eventContracts` payload Schema 校验，窗口销毁后静默停止发送；只发送 `profile.locked`、`operation.progress`、`operation.completed` 三个固定 Channel。

Runtime 汇总 Profile 9 个、本地笔记 39 个、附件 5 个和 Operation 2 个绑定，共 55 个。启动时断言绑定 Key 恰好等于 `requestContracts` 去掉 `export.startNote` 后的集合，任何缺失、重复或额外 Key 都拒绝启动。`export.startNote` 不注册 handler，也不返回假成功/固定失败占位。

关闭开始时 Runtime 同步标记不可用，先停止 AutoLock，再调用 `SessionLifecycle.close()`；该调用同步关闭 Gate，并作为 Operation、Token 和 ProfileManager 的唯一关闭所有者依次完成模块 6 定义的清理。Runtime 随即移除 55 个 IPC handler，等待 Lifecycle 关闭结束，再调用 `MediaGateway.close()` 卸载协议 handler 并清理窗口引用。Runtime 不直接第二次调用 `operations.endSession()`、`media.revokeAll()` 或 `manager.close()`。前一边界失败不阻止后续清理，保留第一个固定错误；重复 close 返回同一 Promise。

`window.ts` 显式创建：

```ts
webPreferences: {
  preload: resolvedPreloadPath,
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  webSecurity: true,
}
```

`will-navigate` 只允许应用入口的同源导航；`setWindowOpenHandler` 默认 deny，仅把 `https:` URL 交给 `shell.openExternal()`，拒绝 `http:`、`file:`、`javascript:`、`notera-media:` 和其他协议。默认 Session 的 permission request/check handler 全部拒绝。窗口关闭后 Runtime 仍由应用退出流程负责安全关闭，不能直接遗失 ProfileManager。

`main.ts` 在 `app.whenReady()` 前调用 `protocol.registerSchemesAsPrivileged()`，仅声明 `notera-media` 为 standard/secure/stream/fetch 支持；Ready 后创建 Runtime 和窗口。`before-quit` 首次触发时 preventDefault，等待 Runtime close，再用一次性退出标记调用 `app.exit(0)`；并发 quit 不重复关闭。删除 `AppUpdater`、`electron-updater`、`electron-log` 和 Electron Boilerplate Help 外链，移除对应依赖与锁文件条目。开发扩展安装失败只使用不含敏感参数的固定开发日志。

**涉及文件**

- 新建：`src/main/runtime.ts`
- 新建：`src/main/window.ts`
- 重构：`src/main/main.ts`
- 修改：`src/main/menu.ts`
- 修改：`package.json`
- 修改：`package-lock.json`
- 新建测试：`src/main/__tests__/runtime.test.ts`
- 新建测试：`src/main/__tests__/window.test.ts`
- 按最终 fake 端口需要修改：`src/main/__tests__/helpers.ts`
- 按公开面完整性修改：`src/__tests__/preload.test.ts`

**单元测试与集成测试**

- Runtime 精确组合 55 个 Key，唯一缺失 Key 为 `export.startNote`，没有同步 Key；
- event publisher 只发送三个已验证 Channel，非法 payload 和销毁窗口不发送；
- start/close 顺序、Lifecycle 对 Session 资源的唯一关闭权、部分失败继续清理、并发关闭和 handler 精确移除；
- BrowserWindow 五个安全选项明确设置；
- 同源导航允许，跨源导航阻止；只有 https 外链交给系统浏览器；
- 权限 request/check 默认拒绝；
- `notera-media` 特权在 Ready 前声明、handler 在 Ready 后安装；
- before-quit 等待 Runtime，重复 quit 不重复关闭；
- Main 源码和依赖不再包含 AppUpdater、样板更新源、`electron-updater`、`electron-log` 或 Electron Boilerplate Help 外链；
- Preload 最终仍只公开命名业务 API，不暴露 `ipcRenderer` 或任意 Channel。

**实施期间精确测试命令**

先只运行本模块新建和直接修改的测试：

```powershell
npm test -- --runInBand src/main/__tests__/runtime.test.ts src/main/__tests__/window.test.ts src/__tests__/preload.test.ts
```

预期：3 个测试文件全部通过，0 个失败。

**所有模块完成后的唯一最终验证**

按以下顺序执行一次，不在各模块后重复：

```powershell
npm test -- --runInBand src/shared/ipc/__tests__/common.test.ts src/shared/ipc/__tests__/registry.test.ts src/main src/__tests__/preload.test.ts
npm run typecheck
npm run check:deps
npx eslint src/main src/shared/ipc/common.ts src/shared/ipc/api.ts src/__tests__/preload.test.ts --ext .ts,.tsx
npm run build:main
```

预期：

- Shared Registry、Main 和 Preload 相关测试全部通过，0 个失败；
- 所有 workspace 与 app TypeScript 检查通过；
- 依赖方向无循环，Preload 仍只依赖 Shared，Renderer 未新增依赖；
- 本次涉及文件 ESLint 通过；
- production Main 与 Preload bundle 构建成功；
- 不运行全部 Application、Storage、Attachment、Crypto、Domain 测试或 Renderer build。

若某项失败，只修复对应原因并复测该失败项；未受影响且已经通过的检查不重复运行。

**完成后的提交**

最终验证全部通过后提交本模块完整改动：

```powershell
git add src/main/runtime.ts src/main/window.ts src/main/main.ts src/main/menu.ts src/main/__tests__/runtime.test.ts src/main/__tests__/window.test.ts src/main/__tests__/helpers.ts src/__tests__/preload.test.ts package.json package-lock.json
git commit -m "feat(main): assemble secure electron runtime"
```

---

## 最终范围确认

计划完成时必须同时满足：

- 55 个已启用 Main 请求绑定与 Shared 合约一一对应，`export.startNote` 明确留给下一子项目；
- Profile、本地笔记、附件和 Operation 调用全部经过 Main 独立请求/响应校验；
- 任何 IPC、事件、日志和 Media URL 都不暴露路径、密钥、ADF 或明文内容；
- 系统锁屏、休眠、15 分钟无操作、手动锁定、切换、移除当前 Profile 和退出共享安全关闭语义；
- 附件导入、另存与预览全程流式，失败和取消清理精确资源；
- Renderer、编辑器、导出和同步均未被提前实现或占位；
- 每个功能模块只有一次对应提交，全部模块后只有一次必要最终验证。
