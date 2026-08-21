# Notera 离线 IPC 合约设计

- 状态：已确认
- 日期：2026-08-21
- 适用阶段：`src/shared` 离线 IPC 合约与类型化 Preload 桥接
- 前置设计：Notera 总体架构、离线领域模型、离线加密

## 1. 目标与范围

本子项目建立 Renderer、Preload 与 Main 之间的完整首版离线业务合约。合约必须同时提供 TypeScript 静态类型和运行时校验，确保 Renderer 只能调用固定业务动作，所有跨进程输入、响应和主动事件都经过相同 Schema 验证。

本设计覆盖：

- 本地 Profile 的创建、解锁、锁定、切换、重命名、修改主密码和从设备移除；
- 目录与笔记混合树、笔记当前稿、标签、收藏、批量操作；
- 永久历史、回收站、最近使用和本地搜索；
- 附件导入、预览、移除、另存为；
- 当前单篇笔记的 Markdown/PDF 导出；
- 长任务进度、完成、查询和取消。

本设计不包含同步协议、同步引擎、云端 API、账户与订阅、同步 Outbox、同步冲突、远端附件状态或任何同步占位接口。它也不实现 Application 用例、数据库 Repository、Blob Store、Media Gateway 或真实 Main Handler；这些由后续子项目实现。

## 2. 核心决策

### 2.1 面向业务用例的调用边界

IPC 不暴露通用 CRUD、Repository 方法或任意 Channel 调用。每个请求代表一个完整、可授权、可事务化的业务动作，例如：

- `note.saveDraft` 保存一份带预期内容版本的当前稿；
- `contentTree.moveFolder` 移动目录子树；
- `batch.move` 原子移动一组目录或笔记；
- `trash.restore` 恢复一个回收站对象；
- `attachment.startImport` 打开系统选择器并启动导入任务。

业务规则和事务由 Main 后面的 Application 层执行。IPC 合约只定义可序列化输入、输出、错误和事件，不把业务编排推给 Renderer。

### 2.2 请求响应与主动事件

普通命令和查询使用 Electron 的 `ipcRenderer.invoke()` / `ipcMain.handle()`。Main 主动通知 Renderer 时使用 `webContents.send()`，Preload 使用 `ipcRenderer.on()` 接收。

请求响应是主通道。主动事件只用于：

1. Profile 因系统锁屏、休眠、无操作超时等原因被锁定；
2. 附件导入、附件另存为和笔记导出等长任务的进度与完成状态。

不发布完整领域事件流，也不依靠轮询替代必要的主动通知。Renderer 重载可能错过事件，因此长任务另有状态查询接口。

### 2.3 Schema 驱动

`src/shared` 使用 Zod 作为直接生产依赖。Zod Schema 是跨进程数据形状的唯一事实来源，TypeScript DTO 从 Schema 推导，不平行维护一份容易漂移的手写接口。

`src/shared` 不导入 Electron、Node API、`packages/domain` 或其他项目模块。它只依赖 Zod，并保持总体架构中第 0 层的依赖方向。

### 2.4 文件系统边界

附件导入、附件另存为和笔记导出都由 Main 打开系统文件或目录选择器。Renderer 不向 Main 传递真实文件路径，也不通过 IPC 传输最大可达 100 MB 的附件字节。

用户关闭系统选择器属于正常的 `cancelled` 数据结果，不作为业务错误。所有未完成的明文写出在 Profile 锁定或用户取消时终止并清理。

### 2.5 乐观并发保存

`note.saveDraft` 必须携带 `expectedContentVersion`。Main 只有在当前版本匹配时才保存标题与 ADF，并返回递增后的内容版本。版本不匹配时返回 `CONTENT_VERSION_CONFLICT`，不得让较晚到达的旧请求覆盖新正文。

恢复历史版本等会替换当前正文的操作同样携带预期内容版本。普通读取不携带版本前置条件。

## 3. 进程边界与公开 API

### 3.1 Renderer 可见接口

Preload 最终只向 Renderer 暴露 `window.notera`。公开形状按业务模块命名，例如：

```ts
window.notera.profile.list(input)
window.notera.note.saveDraft(input)
window.notera.contentTree.listChildren(input)
window.notera.attachment.startImport(input)
window.notera.operation.cancel(input)
window.notera.events.onProfileLocked(listener)
```

Renderer 不获得以下能力：

- 通用 `ipcRenderer`；
- `sendMessage(channel, ...)`、`invoke(channel, ...)` 或任意字符串 Channel；
- Electron 的事件对象；
- 数据库连接、Row ID、SQL 或 FTS 表达式；
- 主密码以外的任何密钥材料；
- 附件真实路径、File Key、Manifest 或密文块。

事件订阅方法返回取消订阅函数。Preload 包装回调时丢弃 `IpcRendererEvent`，Renderer 只接收通过 Schema 校验的业务载荷。

### 3.2 Channel 规则

所有请求和事件 Channel 都是编译期固定常量，使用 `notera:<module>:<action>` 格式，例如：

```text
notera:profile:list
notera:note:save-draft
notera:content-tree:list-children
notera:operation:progress
```

Channel 必须满足：

- 以 `notera:` 开头；
- 仅使用小写 ASCII、数字与连字符；
- 请求 Channel 和事件 Channel 在全局注册表中唯一；
- 不能在运行时由 Renderer 输入拼接；
- 当前注册表中不能出现同步、Outbox、冲突或远端附件能力。

### 3.3 合约注册表

每个请求描述符固定包含：

- Channel；
- 请求 Schema；
- 成功数据 Schema；
- 允许返回的稳定业务错误码集合。

每个事件描述符固定包含 Channel 与事件载荷 Schema。唯一注册表汇总全部描述符，为 Main Handler 注册、Preload 白名单映射、类型推导和一致性测试提供共同依据。

注册表不会自动把任意内容暴露给 Renderer。Preload 仍显式组装 `NoteraApi` 的命名方法，以便安全边界可读、可审计。

## 4. 通用传输类型

### 4.1 响应包络

所有请求统一返回：

```ts
type IpcResponse<T> =
  | { ret: true; data: T }
  | { ret: false; error: { code: string; message: string } };
```

两条分支严格互斥：成功响应不能带 `error`，失败响应不能带 `data`。对象拒绝未知字段。

`code` 是稳定、机器可读的 IPC 错误码。`message` 是固定、安全、可展示的英文后备文案；Renderer 以 `code` 执行本地化和交互分支。消息不能插入 Profile 名、目录名、标题、标签、搜索词、附件名、路径、ADF、密码、密钥或底层异常文本。

### 4.2 标识、时间与 JSON

- 业务 ID 使用符合 RFC 4122 形状的 UUID 字符串，不把领域品牌类型跨 IPC 传输；
- 时间使用非负安全整数表示 Unix 毫秒，不传 `Date`；
- 内容版本和排序值使用规定范围内的安全整数；
- 可选字段省略时不传 `undefined` 值；
- 不允许 `BigInt`、`Map`、`Set`、函数、自定义原型、访问器对象或循环引用；
- 所有 DTO 必须能通过结构化克隆并保持 Schema 等价。

Renderer 不需要 Vault ID。Main 始终把业务请求限定在当前已解锁 Profile 对应的 Vault 内，避免调用方用 Vault ID 选择或混合安全边界。

### 4.3 分页

所有可能无界增长的列表统一使用：

```ts
interface CursorPageRequest {
  cursor?: string;
  limit: number;
}

interface CursorPage<T> {
  items: T[];
  nextCursor?: string;
}
```

`limit` 必须是 1–100 的整数。游标是 Main 生成的不透明字符串，绑定 Profile、查询类型、父目录或查询条件及排序边界。游标不能跨 Profile、父目录、搜索词或列表类型复用；非法或过期游标返回 `INVALID_CURSOR`。

实现使用确定性排序和键集游标，不暴露数据库 Row ID，也不采用 `offset` 或页码作为公共合约。

### 4.4 资源限制

IPC 层执行以下固定上限：

| 数据 | 上限 |
| --- | ---: |
| 分页条数 | 100 |
| 单次批量目标 | 500 |
| 搜索词 | 500 个 Unicode 字符 |
| Profile 名 | 100 个 Unicode 字符 |
| 目录名 | 255 个 Unicode 字符 |
| 标签名 | 100 个 Unicode 字符 |
| 笔记标题 | 1,000 个 Unicode 字符 |
| ADF UTF-8 JSON | 8 MiB |
| ADF/JSON 节点总数 | 100,000 |
| ADF/JSON 最大嵌套 | 128 层 |
| 单个附件 | 100 MiB |

字符上限按 Unicode code point 计算，不按 UTF-16 code unit 截断。超限输入直接返回 `INVALID_IPC_REQUEST`；Main 不执行部分业务动作。

### 4.5 ADF

ADF 使用纯 JSON DTO。验证规则包括：

- 根对象必须为 `type: "doc"`、`version: 1`；
- `content` 若存在必须为数组；
- 数字必须有限；
- 对象必须是普通对象且不能包含危险原型；
- 结构不能循环，并满足大小、节点数和深度上限。

IPC 层不复制 Atlassian 的完整节点 Schema，也不拒绝结构安全但当前编辑器尚不认识的扩展节点。编辑器适配层与 Application 层负责完整 ADF 语义验证和兼容处理。IPC 层的职责是阻止不可序列化、形状明显错误或资源消耗失控的载荷跨越边界。

## 5. 离线业务合约目录

以下名称是 `window.notera` 的业务方法名；注册表将其映射为对应固定 Channel。

### 5.1 Profile

| 方法 | 语义 |
| --- | --- |
| `profile.list` | 在锁定状态下列出本地 Profile 的非敏感索引摘要 |
| `profile.getSessionState` | 返回 `LOCKED` 或当前已解锁 Profile 的安全会话摘要 |
| `profile.create` | 使用显示名称和主密码创建并解锁本地 Profile，返回创建后的会话摘要 |
| `profile.unlock` | 使用 Local Profile ID 和主密码解锁目标 Profile |
| `profile.lock` | 手动关闭当前 ProfileSession |
| `profile.switch` | 先关闭当前会话，再使用目标 Profile ID 和密码解锁目标 Profile |
| `profile.rename` | 重命名当前 Profile，并刷新非敏感名称缓存 |
| `profile.changePassword` | 使用旧、新主密码重新包装当前 Profile 密钥 |
| `profile.removeFromDevice` | 由 Main 执行原生确认后从本设备移除目标本地 Profile |

密码只允许出现在 `create`、`unlock`、`switch` 和 `changePassword` 请求中。任何响应、事件和列表项都不能包含密码、Salt、KDF 参数、Database Key、Vault Key、密钥包或 `vault.meta` 内容。

### 5.2 内容树与笔记

| 方法 | 语义 |
| --- | --- |
| `contentTree.listChildren` | 按父目录懒加载一页直接子目录和笔记摘要 |
| `contentTree.createFolder` | 在指定父目录创建目录 |
| `contentTree.renameFolder` | 重命名目录 |
| `contentTree.moveFolder` | 将目录子树移动到新父目录 |
| `contentTree.reorderEntry` | 在同一父目录中重排一个目录或笔记 |
| `contentTree.trashFolder` | 将非根目录及完整子树移入回收站 |
| `note.create` | 在指定目录创建空白或给定初始标题的笔记 |
| `note.get` | 读取当前笔记标题、ADF、内容版本、标签和安全元数据 |
| `note.saveDraft` | 使用 `expectedContentVersion` 原子保存标题与 ADF |
| `note.move` | 移动单篇笔记 |
| `note.copy` | 复制单篇笔记当前版本及当前附件引用 |
| `note.trash` | 将单篇笔记移入回收站 |
| `note.listRecent` | 按最近访问时间分页列出笔记摘要 |

`contentTree.listChildren` 返回 `folder | note` 判别联合。只返回界面展示与后续业务动作所需字段，不返回 Vault ID、数据库 Row ID、完整 ADF 或附件内部状态。

### 5.3 标签、收藏与批量操作

| 方法 | 语义 |
| --- | --- |
| `tag.list` | 分页列出标签摘要 |
| `tag.create` | 创建标签 |
| `tag.rename` | 重命名标签 |
| `tag.delete` | 删除标签及其关联，不删除笔记 |
| `tag.addToNote` | 幂等地为笔记添加标签 |
| `tag.removeFromNote` | 幂等地从笔记移除标签 |
| `favorite.list` | 分页列出收藏笔记 |
| `favorite.add` | 幂等地加入收藏 |
| `favorite.remove` | 幂等地移出收藏 |
| `favorite.reorder` | 调整收藏顺序 |
| `batch.move` | 原子移动最多 500 个目录或笔记 |
| `batch.addTags` | 原子地为最多 500 篇笔记添加一组标签 |
| `batch.removeTags` | 原子地从最多 500 篇笔记移除一组标签 |
| `batch.copy` | 原子复制最多 500 个显式目标及目录后代 |
| `batch.trash` | 原子地把最多 500 个目标移入回收站 |

批量输入中的每个目标都是 `folder | note` 判别联合。重复目标、祖先与后代同时作为不合法组合提交、跨 Profile 游标或超过上限都在执行前整体拒绝；IPC 不表达部分成功。

### 5.4 历史与回收站

| 方法 | 语义 |
| --- | --- |
| `history.list` | 分页列出一篇笔记的用户版本和系统保护版本摘要 |
| `history.get` | 读取指定历史版本的完整标题与 ADF 快照 |
| `history.createPermanent` | 为当前笔记创建用户永久版本 |
| `history.compare` | 返回两个指定版本或当前版本的可比较快照 |
| `history.restore` | 以预期内容版本恢复历史，并由 Application 创建保护版本 |
| `history.copy` | 从历史快照创建新笔记，不改变当前笔记 |
| `trash.list` | 分页列出目录或笔记回收站条目 |
| `trash.restore` | 恢复条目；原父目录无效时要求显式目标目录 |
| `trash.deletePermanent` | 立即永久删除一个回收站条目 |
| `trash.purgeExpired` | 清理所有已到 30 天期限的条目 |

Renderer 不能指定或伪造系统保护版本来源。回收站摘要包含恢复界面需要的对象类型、安全显示名称、删除时间和到期时间，但不包含已删除正文或附件路径。

### 5.5 搜索

`search.query` 接收规范化前的用户查询、游标和 `limit`。Main 决定使用 trigram 还是 1–2 字符回退，不允许 Renderer 传 SQL、FTS 查询或通配表达式。

返回项包含 Note ID、标题、有限长度摘要、标题/摘要中的安全高亮区间和更新时间。高亮使用字符串 code point 的半开区间，所有区间必须有序、不重叠并落在对应文本范围内。

游标绑定规范化查询和确定性排序条件。搜索词不进入错误消息、日志或事件。

### 5.6 附件

| 方法 | 语义 |
| --- | --- |
| `attachment.listForNote` | 列出当前笔记引用的附件安全摘要 |
| `attachment.startImport` | Main 打开文件选择器并启动导入及引用创建 |
| `attachment.removeFromNote` | 移除当前笔记引用，不直接声明删除共享 Blob |
| `attachment.getPreviewUrl` | 返回短期、仅限当前会话的 Media Gateway URL |
| `attachment.startSaveAs` | Main 打开保存选择器并启动明文另存为 |

附件摘要只包含 Attachment ID、显示文件名、MIME、字节数、本地可用状态和预览能力。Media Gateway URL 是不透明、短期、锁定后失效的字符串；Schema 不拆解或记录其中的 Token。File Key、Manifest、Chunk、Blob 路径、staging 路径、引用计数和垃圾回收细节不跨 IPC。

`startImport` 和 `startSaveAs` 返回 `cancelled`，或返回已启动任务的 `operationId`。附件导入完成结果包含新 Attachment ID 和安全摘要，不含选择的源路径。

### 5.7 单篇笔记导出

`export.startNote` 接收 Note ID 和 `MARKDOWN | PDF` 格式。Main 打开目标位置选择器；用户取消时返回 `cancelled`，开始时返回 `operationId`。

完成结果是安全报告摘要，包括格式、成功状态、导出附件数量和无法无损转换的节点计数。它不返回目标真实路径、附件文件名列表、标题或正文。Profile 锁定或用户取消时中止任务并清理未完成输出。

### 5.8 长任务

| 方法/事件 | 语义 |
| --- | --- |
| `operation.getStatus` | 查询当前会话中指定任务的最新状态 |
| `operation.cancel` | 幂等请求取消任务 |
| `operation.progress` | 发布任务 ID、任务类型、阶段和有界进度 |
| `operation.completed` | 发布成功数据、安全错误或已取消终态 |

任务类型限定为 `ATTACHMENT_IMPORT | ATTACHMENT_SAVE_AS | NOTE_EXPORT`。任务状态限定为 `RUNNING | SUCCEEDED | FAILED | CANCELLED`。进度使用 0–1 的有限数或 `null` 表示不可确定进度，并包含不敏感的枚举阶段；不得发送路径、文件名、正文或底层错误。

任务 ID 只在当前 ProfileSession 内有效。Renderer 重载后可调用 `getStatus` 恢复展示；Profile 锁定时取消全部需要已解锁密钥或明文句柄的任务。取消已结束的任务返回其既有终态，不产生第二个完成事件。

## 6. 主动事件

### 6.1 Profile 锁定

`profile.locked` 载荷只包含锁定原因：

```text
MANUAL
SWITCHED
SYSTEM_LOCK
SYSTEM_SUSPEND
IDLE_TIMEOUT
SESSION_CLOSED
```

事件不携带主密码、密钥、Vault ID 或失败详情。手动锁定和切换虽然已有请求响应，仍可发布同一事件，使所有已订阅界面组件统一清理敏感内存状态。

### 6.2 长任务事件

Main 在调用 `webContents.send()` 前使用共享事件 Schema 校验；Preload 收到后再次校验。非法事件不传给 Renderer，并通过不含载荷内容的固定错误码进入隐私日志。

`operation.completed` 是按任务类型判别的联合，成功数据必须与任务类型一致；失败分支使用与 `IpcResponse` 相同的安全错误对象；取消使用独立 `CANCELLED` 终态，不把用户取消伪装成内部失败。

## 7. 校验数据流

一次请求按以下顺序执行：

```text
Renderer 调用命名业务方法
  → Preload 使用请求 Schema 校验
  → ipcRenderer.invoke(固定 Channel, 已解析输入)
  → Main Handler 再次使用请求 Schema 校验
  → Application 执行业务用例
  → Main 映射为 IpcResponse 并校验响应 Schema
  → Preload 再次校验收到的响应
  → Renderer 获得 IpcResponse
```

双重验证的目的不同：Preload 尽早拒绝被攻破或出错 Renderer 的非法输入；Main 不能把 Preload 当成安全边界，必须独立验证；Preload 又不能信任任意 Main 返回形状，以免错误对象或 Electron 内部对象泄漏到界面。

Preload 请求校验失败时不调用 Main，直接返回 `INVALID_IPC_REQUEST`。Main 收到非法请求时返回同一码。Main 构造出非法响应属于实现错误；Preload 将其替换为 `INVALID_IPC_RESPONSE`，不向 Renderer 暴露原始值。

## 8. 错误模型

### 8.1 IPC 基础错误

| 错误码 | 含义 |
| --- | --- |
| `INVALID_IPC_REQUEST` | 请求形状、字段、边界或未知字段非法 |
| `INVALID_IPC_RESPONSE` | Main 返回不符合已注册合约的数据 |
| `IPC_OPERATION_FAILED` | 未识别的内部异常 |
| `INVALID_CURSOR` | 游标非法、过期或用于错误查询范围 |
| `PROFILE_LOCKED` | 操作需要已解锁 Profile |
| `OPERATION_NOT_FOUND` | 当前会话中不存在该长任务 |

### 8.2 稳定业务错误目录

当前阶段的 Renderer 业务错误码是以下穷举集合；新增错误码必须作为显式合约变更加入 Schema、固定消息目录和相关请求描述符：

- `WRONG_PASSWORD`、`VAULT_META_INVALID`、`CRYPTO_UNAVAILABLE`；
- `DB_CORRUPT`、`DB_SCHEMA_TOO_NEW`、`MIGRATION_FAILED`；
- `ENTITY_NOT_FOUND`、`INVALID_ENTITY_STATE`、`INVALID_NAME`；
- `FOLDER_CYCLE`、`ROOT_FOLDER_IMMUTABLE`、`PARENT_FOLDER_INVALID`、`DUPLICATE_TARGET_ID`；
- `CONTENT_VERSION_CONFLICT`、`CONTENT_VERSION_OVERFLOW`、`VERSION_NOTE_MISMATCH`；
- `TRASH_ENTRY_EXPIRED`、`TRASH_TARGET_REQUIRED`；
- `ATTACHMENT_TOO_LARGE`、`ATTACHMENT_STILL_REFERENCED`、`BLOB_MISSING`、`BLOB_CORRUPT`；
- `SAVE_FAILED`、`DISK_FULL`、`ATTACHMENT_IMPORT_FAILED`、`ATTACHMENT_SAVE_FAILED`、`EXPORT_FAILED`。

每个请求描述符声明其允许错误集合，避免任意内部错误码穿过边界。后续 Main 适配层显式把 Domain、Crypto、Storage、Attachment 和 Application 错误映射为 IPC 错误；不得直接序列化 `Error`、堆栈或底层 `message`。

## 9. 代码组织

```text
src/shared/
  ipc/
    common.ts
    errors.ts
    pagination.ts
    adf.ts
    contract.ts
    registry.ts
    api.ts
    contracts/
      profile.ts
      content-tree.ts
      note.ts
      tag.ts
      favorite.ts
      batch.ts
      history.ts
      trash.ts
      search.ts
      attachment.ts
      export.ts
      operation.ts
    __tests__/
      common.test.ts
      contracts.test.ts
      registry.test.ts
      adf.test.ts
  index.ts
```

职责划分：

- `common.ts`：UUID、整数、时间、受限字符串、严格对象和 `IpcResponse` 构造器；
- `errors.ts`：稳定 IPC 错误码、固定安全消息和按操作允许集合；
- `pagination.ts`：游标请求与页面结果；
- `adf.ts`：纯 JSON 与 ADF 资源受限验证；
- `contract.ts`：类型安全的请求/事件描述符；
- `contracts/*`：各业务模块 DTO 与描述符；
- `registry.ts`：唯一请求及事件注册表；
- `api.ts`：Renderer 可见 `NoteraApi` 与事件订阅类型；
- `index.ts`：有意公开的 Shared API，禁止导出 Zod 内部细节之外的 Electron 能力。

本功能模块同时修改：

- `package.json` 与锁文件：把 Zod 加入生产依赖；
- `src/main/preload.ts`：建立显式 `window.notera` 白名单桥；
- `src/renderer/preload.d.ts`：声明 `NoteraApi`；
- `src/main/main.ts` 与 `src/renderer/index.tsx`：删除 `ipc-example` 样板 Handler 和 ping；
- Preload 相关单元测试：使用模拟 Electron API 验证固定映射和订阅清理。

本阶段不注册真实业务 Handler，也不让占位 Renderer 调用尚未实现的业务方法。

## 10. 测试策略

### 10.1 通用 Schema

测试覆盖：

- UUID、时间、安全整数、字符计数和严格对象；
- `IpcResponse<T>` 成功/失败分支严格互斥；
- 未知字段、非法原型、非有限数字和不可结构化克隆值被拒绝；
- 所有失败消息来自固定白名单，不包含输入值或底层异常。

### 10.2 ADF

测试覆盖：

- 最小合法 ADF 和包含嵌套 JSON 的完整合法 ADF；
- 错误根类型、错误版本、非数组 `content`；
- 8 MiB、100,000 节点和 128 层边界的接受与超限拒绝；
- 循环引用、自定义原型、访问器、`NaN`、无穷大、函数和 `BigInt`；
- 验证器以有界、非递归遍历处理深层恶意输入，不能因调用栈溢出崩溃。

### 10.3 业务合约

每个请求、响应和事件至少验证合法最小样例、合法完整样例及关键非法边界。额外证明：

- 所有列表都使用游标分页；
- 所有会替换当前正文的请求都携带预期内容版本；
- 批量操作最多接收 500 个目标且不表达部分成功；
- 密码只存在于指定 Profile 请求 Schema；
- 响应和事件不含密码、密钥、真实路径、数据库 Row ID 或 Electron 对象；
- 附件与导出启动正确区分 `cancelled` 和 `operationId`；
- 长任务成功结果与任务类型匹配，取消幂等且终态不可逆。

### 10.4 注册表与 Preload

测试证明：

- Channel 全局唯一、命名合法且请求与事件不冲突；
- 当前注册表没有同步、Outbox、冲突和远端附件接口；
- Preload 只调用注册表中的固定 Channel；
- 非法请求不会调用 `ipcRenderer.invoke()`；
- 非法 Main 响应被替换为 `INVALID_IPC_RESPONSE`；
- 主动事件丢弃 Electron 事件对象并校验业务载荷；
- 取消订阅会对同一包装监听器调用 `removeListener()`；
- 不再暴露 `window.electron.ipcRenderer`、任意 Channel 或 `ipc-example`。

## 11. 验证与完成标准

实施期间按完整功能模块编写实现和对应单元测试，只运行当前模块相关测试。所有模块完成后只执行一次必要的最终验证，包括 Shared/Preload 相关单元测试、应用 TypeScript 检查、依赖边界检查、实际受影响文件的 lint，以及必要的构建检查。

完成标准：

- 首版全部离线业务动作拥有固定、Schema 驱动的 IPC 合约；
- DTO、请求、响应、错误和事件均可序列化并通过运行时验证；
- Renderer 只能通过 `window.notera` 调用显式业务方法；
- Main 主动通知使用 `webContents.send()`，Renderer 通过 Preload 的类型化 `on()` 包装接收；
- `IpcResponse<T>` 严格使用 `ret/data/error` 形式；
- 树与所有无界列表采用不透明游标分页；
- 附件和导出不跨 IPC 传递真实路径或大文件字节；
- 自动保存使用内容版本前置条件；
- 长任务支持进度、完成、状态恢复、显式取消和锁定时自动取消；
- `src/shared` 没有项目内依赖，Preload 不依赖其他桌面实现；
- 不包含任何当前阶段排除的同步能力。
