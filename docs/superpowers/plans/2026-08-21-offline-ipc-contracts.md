# Notera 离线 IPC 合约实施计划

> **供代理执行：** 必须使用 `superpowers:executing-plans` 按任务实施，并用复选框（`- [ ]`）跟踪进度。遵守仓库 `AGENTS.md`：不派遣额外审核代理；每个任务作为完整、可独立测试的功能模块一次实现、测试并提交。

**目标：** 建立首版完整离线 IPC Schema、类型化业务 API、固定 Channel 注册表和安全 Preload 白名单桥，替换 Electron 样板的通用 IPC 暴露。

**架构：** `src/shared` 以 Zod Schema 作为跨进程 DTO 的唯一事实来源，并保持零项目内依赖；请求使用固定 `invoke/handle` Channel，主动通知使用固定 `send/on` Event。Preload 显式组装 `window.notera`，在 Renderer 与 Main 两侧的后续适配入口复用同一注册表和校验器，但本计划不实现真实业务 Handler。

**技术栈：** TypeScript 5.8、Zod 4、Electron IPC、Jest 29、ts-jest、Dependency Cruiser、ESLint、Webpack。

---

## 实施约束

- 设计依据：`docs/superpowers/specs/2026-08-21-offline-ipc-contracts-design.md`。
- 不修改用户现有未跟踪内容：`docs/old/`、`docs/笔记功能.md`。
- 当前阶段不实现同步协议、同步引擎、云端 API、账户/订阅、同步 Outbox、同步冲突、远端附件状态或同步占位 Channel。
- 每个任务中的测试和实现是一项完整工作，不拆成“失败测试、实现、成功测试”等微步骤。
- 实施时只运行当前任务列出的单元测试；所有任务完成后再运行一次最终相关测试全集、类型检查、依赖检查、lint 和 build。
- Zod 是 Preload/Main 运行时需要的依赖，必须放入根 `dependencies`，不能只放入 `devDependencies`。
- 所有 Schema 使用严格对象，拒绝未知字段；错误消息来自固定白名单，禁止拼接请求内容或底层异常。

## 文件结构与职责

```text
src/shared/
  ipc/
    common.ts                         # UUID、时间、受限字符串、纯 JSON、IpcResponse
    errors.ts                         # 穷举 IPC 错误码与固定安全消息
    pagination.ts                     # 不透明游标请求与页面响应
    adf.ts                            # 有界、非递归 ADF/JSON 验证
    contract.ts                       # 请求/事件描述符与解析辅助函数
    registry.ts                       # 唯一请求和事件注册表
    api.ts                            # window.notera 的类型定义
    contracts/
      profile.ts                      # Profile 与会话生命周期
      content-tree.ts                 # 目录/笔记混合树
      note.ts                         # 当前笔记、乐观并发保存、最近使用
      tag.ts                          # 标签 CRUD 与笔记关联
      favorite.ts                     # 收藏列表与排序
      batch.ts                        # 原子批量移动/标签/复制/回收站
      history.ts                      # 永久历史、比较、恢复、复制
      trash.ts                        # 回收站查询、恢复与永久清理
      search.ts                       # 本地搜索与安全高亮
      attachment.ts                   # 附件摘要、导入、预览与另存为
      export.ts                       # 单篇笔记 Markdown/PDF 导出
      operation.ts                    # 长任务状态、取消与主动事件
    __tests__/
      common.test.ts
      adf.test.ts
      profile-content-contracts.test.ts
      organization-contracts.test.ts
      file-operation-contracts.test.ts
      registry.test.ts
  index.ts                            # Shared 有意公开的唯一入口
src/main/
  preload.ts                          # 显式 window.notera 白名单实现
  main.ts                             # 仅移除 ipc-example 样板 Handler
src/renderer/
  preload.d.ts                        # Window.notera 全局类型
  index.tsx                           # 仅移除 ipc-example ping
src/__tests__/
  preload.test.ts                     # 模拟 Electron 的 Preload 边界测试
```

## 任务 1：通用 IPC 运行时、错误包络与有界 ADF

**目标：** 提供后续所有业务合约复用的安全基础类型、稳定错误、游标分页、请求/事件描述符，以及不会因恶意深层输入导致调用栈溢出的 ADF 验证器。

**涉及文件：**

- 修改：`package.json`
- 修改：`package-lock.json`
- 修改：`src/shared/index.ts`
- 新增：`src/shared/ipc/common.ts`
- 新增：`src/shared/ipc/errors.ts`
- 新增：`src/shared/ipc/pagination.ts`
- 新增：`src/shared/ipc/adf.ts`
- 新增：`src/shared/ipc/contract.ts`
- 新增：`src/shared/ipc/__tests__/common.test.ts`
- 新增：`src/shared/ipc/__tests__/adf.test.ts`

### 功能逻辑与关键接口

- [ ] 安装精确版本的 Zod 4，并在上述文件中一次完成实现与单元测试。

依赖命令：

```powershell
npm install zod@4.1.5 --save-exact
```

`errors.ts` 定义以下穷举错误目录及固定英文消息：

```ts
export const IPC_ERROR_CODES = [
  'INVALID_IPC_REQUEST',
  'INVALID_IPC_RESPONSE',
  'IPC_OPERATION_FAILED',
  'INVALID_CURSOR',
  'PROFILE_LOCKED',
  'OPERATION_NOT_FOUND',
  'WRONG_PASSWORD',
  'VAULT_META_INVALID',
  'CRYPTO_UNAVAILABLE',
  'DB_CORRUPT',
  'DB_SCHEMA_TOO_NEW',
  'MIGRATION_FAILED',
  'ENTITY_NOT_FOUND',
  'INVALID_ENTITY_STATE',
  'INVALID_NAME',
  'FOLDER_CYCLE',
  'ROOT_FOLDER_IMMUTABLE',
  'PARENT_FOLDER_INVALID',
  'DUPLICATE_TARGET_ID',
  'CONTENT_VERSION_CONFLICT',
  'CONTENT_VERSION_OVERFLOW',
  'VERSION_NOTE_MISMATCH',
  'TRASH_ENTRY_EXPIRED',
  'TRASH_TARGET_REQUIRED',
  'ATTACHMENT_TOO_LARGE',
  'ATTACHMENT_STILL_REFERENCED',
  'BLOB_MISSING',
  'BLOB_CORRUPT',
  'SAVE_FAILED',
  'DISK_FULL',
  'ATTACHMENT_IMPORT_FAILED',
  'ATTACHMENT_SAVE_FAILED',
  'EXPORT_FAILED',
] as const;

export type IpcErrorCode = (typeof IPC_ERROR_CODES)[number];

export interface IpcError {
  readonly code: IpcErrorCode;
  readonly message: string;
}
```

`common.ts` 导出并测试：

```ts
export type IpcResponse<T> =
  | { readonly ret: true; readonly data: T }
  | { readonly ret: false; readonly error: IpcError };

export const emptyObjectSchema: z.ZodType<Readonly<Record<string, never>>>;
export const uuidSchema: z.ZodString;
export const timestampSchema: z.ZodNumber;
export const contentVersionSchema: z.ZodNumber;
export const sortOrderSchema: z.ZodNumber;
export function limitedUnicodeString(maxCodePoints: number): z.ZodString;
export function createIpcResponseSchema<T extends z.ZodType>(
  dataSchema: T,
  allowedErrors: readonly IpcErrorCode[],
): z.ZodType<IpcResponse<z.output<T>>>;
export function ipcFailure(code: IpcErrorCode): IpcResponse<never>;
```

`limitedUnicodeString` 使用 `Array.from(value).length` 计算 Unicode code point，避免把代理对算成两个字符。UUID 只接受规范 UUID 字符串；时间、内容版本与排序值只接受规定范围内的安全整数。`createIpcResponseSchema` 创建严格判别联合，成功分支只能有 `ret/data`，失败分支只能有 `ret/error`，且错误码必须属于该请求描述符声明的集合。

`pagination.ts` 导出：

```ts
export const cursorPageRequestSchema = z.strictObject({
  cursor: z.string().min(1).max(4096).optional(),
  limit: z.number().int().min(1).max(100),
});

export function cursorPageSchema<T extends z.ZodType>(
  itemSchema: T,
): z.ZodType<{
  readonly items: readonly z.output<T>[];
  readonly nextCursor?: string;
}>;
```

`adf.ts` 使用显式栈遍历输入，不使用递归函数。先通过 `Object.getOwnPropertyDescriptors()` 检查普通对象和访问器，遍历时累计节点数、深度并拒绝循环引用、共享祖先循环、函数、`BigInt`、`undefined`、`NaN` 与无穷大；确认安全后再序列化计算 UTF-8 大小。固定导出：

```ts
export const MAX_ADF_BYTES = 8 * 1024 * 1024;
export const MAX_ADF_NODES = 100_000;
export const MAX_ADF_DEPTH = 128;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | { readonly [key: string]: JsonValue }
  | readonly JsonValue[];

export interface AdfDocument {
  readonly type: 'doc';
  readonly version: 1;
  readonly content?: readonly JsonValue[];
  readonly [key: string]: JsonValue | undefined;
}

export const adfDocumentSchema: z.ZodType<AdfDocument>;
```

`contract.ts` 定义完整描述符，不导入 Electron：

```ts
export interface RequestContract<
  Key extends string,
  Request extends z.ZodType,
  Data extends z.ZodType,
> {
  readonly key: Key;
  readonly channel: `notera:${string}`;
  readonly request: Request;
  readonly data: Data;
  readonly response: z.ZodType<IpcResponse<z.output<Data>>>;
  readonly errors: readonly IpcErrorCode[];
}

export interface EventContract<
  Key extends string,
  Payload extends z.ZodType,
> {
  readonly key: Key;
  readonly channel: `notera:${string}`;
  readonly payload: Payload;
}

export function defineRequestContract<
  const Key extends string,
  Request extends z.ZodType,
  Data extends z.ZodType,
>(input: {
  readonly key: Key;
  readonly channel: `notera:${string}`;
  readonly request: Request;
  readonly data: Data;
  readonly errors: readonly IpcErrorCode[];
}): RequestContract<Key, Request, Data>;

export function defineEventContract<
  const Key extends string,
  Payload extends z.ZodType,
>(input: {
  readonly key: Key;
  readonly channel: `notera:${string}`;
  readonly payload: Payload;
}): EventContract<Key, Payload>;

export function parseRequest<C extends RequestContract<string, z.ZodType, z.ZodType>>(
  contract: C,
  value: unknown,
): IpcResponse<z.output<C['request']>>;

export function parseResponse<C extends RequestContract<string, z.ZodType, z.ZodType>>(
  contract: C,
  value: unknown,
): IpcResponse<z.output<C['data']>>;

export function parseEvent<E extends EventContract<string, z.ZodType>>(
  contract: E,
  value: unknown,
): IpcResponse<z.output<E['payload']>>;
```

解析失败不返回 Zod issue、字段值或底层异常：请求失败固定映射 `INVALID_IPC_REQUEST`，响应失败固定映射 `INVALID_IPC_RESPONSE`。事件解析失败只返回固定错误对象，供 Preload 丢弃载荷。

### 单元测试

`common.test.ts` 明确覆盖：

- 成功和失败响应分支互斥，未知字段被拒绝；
- 一个请求未声明的合法全局错误码仍被其响应 Schema 拒绝；
- UUID、非负 Unix 毫秒、内容版本、排序值的接受与边界拒绝；
- Profile 名 100、目录名 255、标签名 100、标题 1,000、搜索词 500 个 code point 的边界；
- emoji 代理对只计算一个 code point；
- 分页 1 和 100 通过，0、101、小数、空游标、超长游标失败；
- 固定错误消息不包含送入校验器的敏感字符串。

`adf.test.ts` 明确覆盖：

- `{ type: 'doc', version: 1 }` 和带嵌套 `content` 的合法 ADF；
- 错误根类型、错误版本、非数组 `content`；
- 8 MiB、100,000 节点、128 层在边界内通过，各自超限失败；
- 循环对象、自定义原型、getter、函数、`BigInt`、`undefined`、`NaN`、无穷大失败；
- 129 层恶意输入返回校验失败而不是 `RangeError`。

### 精确测试命令

```powershell
npm run test:unit -- src/shared/ipc/__tests__/common.test.ts src/shared/ipc/__tests__/adf.test.ts --runInBand
```

预期：两个测试文件全部通过，0 个失败；不运行其他包测试。

### 完成后提交

```powershell
git add package.json package-lock.json src/shared/index.ts src/shared/ipc/common.ts src/shared/ipc/errors.ts src/shared/ipc/pagination.ts src/shared/ipc/adf.ts src/shared/ipc/contract.ts src/shared/ipc/__tests__/common.test.ts src/shared/ipc/__tests__/adf.test.ts
git commit -m "feat(ipc): establish validated contract runtime"
```

## 任务 2：Profile、内容树与笔记工作区合约

**目标：** 定义 Profile 生命周期、目录与笔记混合树、当前笔记读取/保存/移动/复制/回收站和最近使用的完整业务用例合约，落实密码单向边界、树懒加载和内容版本并发控制。

**涉及文件：**

- 新增：`src/shared/ipc/contracts/profile.ts`
- 新增：`src/shared/ipc/contracts/content-tree.ts`
- 新增：`src/shared/ipc/contracts/note.ts`
- 新增：`src/shared/ipc/__tests__/profile-content-contracts.test.ts`
- 修改：`src/shared/index.ts`

### 功能逻辑与关键接口

- [ ] 在同一功能任务中定义三个合约模块、全部 DTO、错误白名单与单元测试。

共用安全 DTO：

```ts
export const profileSummarySchema = z.strictObject({
  localProfileId: uuidSchema,
  displayName: limitedUnicodeString(100),
  lastUsedAt: timestampSchema,
  isCurrent: z.boolean(),
});

export const sessionStateSchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('LOCKED') }),
  z.strictObject({
    state: z.literal('UNLOCKED'),
    localProfileId: uuidSchema,
    displayName: limitedUnicodeString(100),
    rootFolderId: uuidSchema,
  }),
]);

export const entryRefSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('folder'), id: uuidSchema }),
  z.strictObject({ kind: z.literal('note'), id: uuidSchema }),
]);
```

`profile.ts` 必须定义以下固定请求：

| Key | 请求数据 | 成功数据 |
| --- | --- | --- |
| `profile.list` | `cursor/limit` | `CursorPage<ProfileSummary>` |
| `profile.getSessionState` | 严格空对象 | `SessionState` |
| `profile.create` | `displayName/password` | `UNLOCKED` 会话摘要 |
| `profile.unlock` | `localProfileId/password` | `UNLOCKED` 会话摘要 |
| `profile.lock` | 严格空对象 | 严格空对象 |
| `profile.switch` | `localProfileId/password` | `UNLOCKED` 会话摘要 |
| `profile.rename` | `displayName` | 更新后的 Profile 摘要 |
| `profile.changePassword` | `oldPassword/newPassword` | 严格空对象 |
| `profile.removeFromDevice` | `localProfileId` | `{ status: 'removed' } | { status: 'cancelled' }` |

密码 Schema 接受非空字符串但不 `trim`，最大 1,024 个 code point。除上述四类请求外，任何 DTO、成功响应、失败响应或事件类型都不能出现 `password`、`oldPassword`、`newPassword`、Salt、KDF 或密钥字段。

`content-tree.ts` 定义 `folder | note` 摘要判别联合。Folder 摘要包含 ID、名称、父 ID、排序值、更新时间和 `hasChildren`；Note 摘要包含 ID、标题、父目录 ID、排序值、内容版本和更新时间，不包含 ADF。固定请求：

```text
contentTree.listChildren   parentFolderId + cursor/limit → CursorPage<TreeEntrySummary>
contentTree.createFolder   parentFolderId + name          → FolderSummary
contentTree.renameFolder   folderId + name                → FolderSummary
contentTree.moveFolder     folderId + targetParentId      → FolderSummary
contentTree.reorderEntry   parentFolderId + entry + beforeEntry? → {}
contentTree.trashFolder    folderId                        → { trashEntryId }
```

`note.ts` 定义 Tag 摘要、Note 详情与固定请求：

```text
note.create       folderId + optional title               → NoteDetail
note.get          noteId                                  → NoteDetail
note.saveDraft    noteId + expectedContentVersion + title + document → SaveDraftResult
note.move         noteId + targetFolderId                 → NoteSummary
note.copy         noteId + targetFolderId                 → NoteSummary
note.trash        noteId                                  → { trashEntryId }
note.listRecent   cursor/limit                            → CursorPage<NoteSummary>
```

`NoteDetail` 只包含 Note ID、Folder ID、标题、ADF、内容版本、排序值、创建/更新时间和标签摘要。`SaveDraftResult` 包含 Note ID、新 `contentVersion` 和 `savedAt`。`note.saveDraft` 与未来所有正文替换入口共享 `contentVersionSchema`，并允许返回 `CONTENT_VERSION_CONFLICT`；其他修改命令按业务范围声明 `PROFILE_LOCKED`、`ENTITY_NOT_FOUND`、`INVALID_NAME`、`FOLDER_CYCLE`、`PARENT_FOLDER_INVALID`、`SAVE_FAILED`、`DISK_FULL` 等有限错误集合。

### 单元测试

`profile-content-contracts.test.ts` 明确覆盖：

- 九个 Profile Channel、六个 Content Tree Channel、七个 Note Channel 的名称和严格请求/响应；
- Profile 创建结果为 `UNLOCKED` 并含 Root Folder ID；错误密码只允许安全错误响应；
- 密码只出现在四种请求中，任何响应 Schema 都拒绝密码、密钥、Vault ID 和真实路径字段；
- `listChildren` 必须包含父目录和游标页，树节点判别联合不能混合字段；
- Tree/Note 摘要拒绝数据库 Row ID、完整 ADF 和未知字段；
- `saveDraft` 缺少 `expectedContentVersion`、ADF 超限或版本为 0 时失败；成功结果要求递增后的合法版本和时间；
- 目录循环、父目录非法、内容版本冲突只能出现在声明允许这些错误的响应中；
- 最近使用采用游标分页；所有名称、标题和密码长度边界生效。

### 精确测试命令

```powershell
npm run test:unit -- src/shared/ipc/__tests__/profile-content-contracts.test.ts --runInBand
```

预期：该测试文件全部通过，0 个失败。

### 完成后提交

```powershell
git add src/shared/index.ts src/shared/ipc/contracts/profile.ts src/shared/ipc/contracts/content-tree.ts src/shared/ipc/contracts/note.ts src/shared/ipc/__tests__/profile-content-contracts.test.ts
git commit -m "feat(ipc): define profile and content contracts"
```

## 任务 3：标签、收藏、批量、历史、回收站与搜索合约

**目标：** 定义本地内容组织、原子批量动作、永久历史、回收站和多语言搜索的业务合约，保证所有无界结果游标化、所有批量操作整体成功或整体失败、所有正文恢复都有版本前置条件。

**涉及文件：**

- 新增：`src/shared/ipc/contracts/tag.ts`
- 新增：`src/shared/ipc/contracts/favorite.ts`
- 新增：`src/shared/ipc/contracts/batch.ts`
- 新增：`src/shared/ipc/contracts/history.ts`
- 新增：`src/shared/ipc/contracts/trash.ts`
- 新增：`src/shared/ipc/contracts/search.ts`
- 新增：`src/shared/ipc/__tests__/organization-contracts.test.ts`
- 修改：`src/shared/index.ts`

### 功能逻辑与关键接口

- [ ] 在同一功能任务中定义六个合约模块、稳定 DTO、错误白名单与单元测试。

固定请求目录：

| 模块 | 请求 |
| --- | --- |
| Tag | `tag.list`、`tag.create`、`tag.rename`、`tag.delete`、`tag.addToNote`、`tag.removeFromNote` |
| Favorite | `favorite.list`、`favorite.add`、`favorite.remove`、`favorite.reorder` |
| Batch | `batch.move`、`batch.addTags`、`batch.removeTags`、`batch.copy`、`batch.trash` |
| History | `history.list`、`history.get`、`history.createPermanent`、`history.compare`、`history.restore`、`history.copy` |
| Trash | `trash.list`、`trash.restore`、`trash.deletePermanent`、`trash.purgeExpired` |
| Search | `search.query` |

Tag 请求和 DTO：

```ts
export const tagSummarySchema = z.strictObject({
  id: uuidSchema,
  name: limitedUnicodeString(100),
  updatedAt: timestampSchema,
});
```

`tag.list` 使用游标分页；创建/重命名返回 Tag 摘要；删除返回空对象；添加/移除关系接收 `noteId/tagId` 并幂等返回空对象。Favorite 列表返回带 `favoriteSortOrder` 的 Note 摘要；添加、移除幂等，重排接收 `noteId` 和可选 `beforeNoteId`，不接受 Renderer 直接写内部排序值。

Batch 输入使用 `entryRefSchema`，目标数组 `.min(1).max(500)` 且通过 refinement 拒绝重复 ID。`batch.move` 和 `batch.copy` 另带 `targetFolderId`；标签动作接收 1–500 个 Note ID 和 1–100 个 Tag ID；`batch.trash` 返回创建的 Trash Entry ID 数组。成功响应只表示整批提交完成，不定义逐项结果或部分成功。

History DTO：

```ts
export const versionKindSchema = z.enum(['USER', 'SYSTEM_PROTECTION']);
export const versionRefSchema = z.discriminatedUnion('source', [
  z.strictObject({ source: z.literal('CURRENT') }),
  z.strictObject({ source: z.literal('VERSION'), versionId: uuidSchema }),
]);
```

历史摘要包含 Version ID、Note ID、版本类型、创建时间和安全显示标题；历史快照包含标题与 ADF。`history.restore` 接收 `noteId/versionId/expectedContentVersion`，成功返回新的内容版本和保护 Version ID；`history.copy` 接收目标目录并返回新 Note 摘要；Renderer 不能在创建永久版本时传入版本类型，系统保护来源不能伪造。

Trash 列表返回 `folder | note` 判别条目，包含 Trash Entry ID、对象 ID、安全显示名称、删除/到期时间和原父目录是否仍可恢复。`trash.restore` 接收 Trash Entry ID 与可选 `targetFolderId`；原父目录无效且未显式提供目标时允许返回 `TRASH_TARGET_REQUIRED`。永久删除和过期清理返回删除计数，不返回正文或附件路径。

Search 请求固定为：

```ts
export const searchRequestSchema = cursorPageRequestSchema.extend({
  query: limitedUnicodeString(500).min(1),
}).strict();

export const highlightRangeSchema = z.strictObject({
  field: z.enum(['title', 'excerpt']),
  start: z.number().int().min(0),
  end: z.number().int().min(1),
});
```

搜索结果包含 Note ID、标题、最多 2,000 个 code point 的摘要、更新时间和高亮区间。结果 Schema refinement 验证区间按 code point 计数，满足 `start < end`、落在对应字符串范围内、按 field/start 排序且不重叠。请求不接受 SQL、FTS 模式、通配符或搜索算法选择字段。

### 单元测试

`organization-contracts.test.ts` 明确覆盖：

- 六个模块全部固定 Channel 和请求/响应严格性；
- Tag/Favorite/History/Trash/Search 列表全部使用 `cursor/limit/nextCursor`；
- 标签关系与收藏添加/移除的成功响应不表达重复错误；
- Batch 接受 1 和 500 个目标，拒绝 0、501、重复 ID、未知 target kind 和部分结果字段；
- History 用户版本创建请求无法传 `SYSTEM_PROTECTION`，恢复缺少 `expectedContentVersion` 失败；
- History compare 接受 CURRENT/版本组合并拒绝混合判别字段；
- Trash folder/note 判别联合、到期时间和显式恢复目标；
- Search 拒绝空查询、501 code point、SQL/FTS 字段、越界/重叠/乱序高亮；
- 所有响应拒绝 Vault ID、Row ID、路径、同步状态和远端附件字段。

### 精确测试命令

```powershell
npm run test:unit -- src/shared/ipc/__tests__/organization-contracts.test.ts --runInBand
```

预期：该测试文件全部通过，0 个失败。

### 完成后提交

```powershell
git add src/shared/index.ts src/shared/ipc/contracts/tag.ts src/shared/ipc/contracts/favorite.ts src/shared/ipc/contracts/batch.ts src/shared/ipc/contracts/history.ts src/shared/ipc/contracts/trash.ts src/shared/ipc/contracts/search.ts src/shared/ipc/__tests__/organization-contracts.test.ts
git commit -m "feat(ipc): define organization and history contracts"
```

## 任务 4：附件、单篇导出与可取消长任务合约

**目标：** 定义不跨 IPC 传真实路径或大文件字节的附件/导出动作，以及可恢复、可取消、锁定即终止的长任务状态和 Main 主动事件。

**涉及文件：**

- 新增：`src/shared/ipc/contracts/attachment.ts`
- 新增：`src/shared/ipc/contracts/export.ts`
- 新增：`src/shared/ipc/contracts/operation.ts`
- 新增：`src/shared/ipc/__tests__/file-operation-contracts.test.ts`
- 修改：`src/shared/index.ts`

### 功能逻辑与关键接口

- [ ] 在同一功能任务中定义附件、导出、长任务请求和事件判别联合，并完成单元测试。

固定类型：

```ts
export const operationKindSchema = z.enum([
  'ATTACHMENT_IMPORT',
  'ATTACHMENT_SAVE_AS',
  'NOTE_EXPORT',
]);

export const operationStateSchema = z.enum([
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
]);

export const startOperationResultSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('cancelled') }),
  z.strictObject({ status: z.literal('started'), operationId: uuidSchema }),
]);
```

附件固定请求：

```text
attachment.listForNote     noteId + cursor/limit       → CursorPage<AttachmentSummary>
attachment.startImport     noteId                      → StartOperationResult
attachment.removeFromNote  noteId + attachmentId       → {}
attachment.getPreviewUrl   attachmentId                → { url, expiresAt }
attachment.startSaveAs     attachmentId                → StartOperationResult
```

Attachment 摘要字段固定为 ID、显示文件名、MIME、0–100 MiB 字节数、本地状态 `AVAILABLE | MISSING | CORRUPT`、`previewable` 和创建时间。预览 URL 只接受 `notera-media:` 协议，长度不超过 4,096，且必须有未来的 `expiresAt`；Schema 不解析、不导出 URL 内 Token。任何附件请求都拒绝 `path`、`bytes`、`fileKey`、`manifest`、`chunks`、`remoteState` 和传输状态字段。

导出固定请求：

```text
export.startNote  noteId + format('MARKDOWN' | 'PDF') → StartOperationResult
```

用户关闭 Main 系统选择器返回 `{ status: 'cancelled' }`，不是失败响应。导出成功报告只包含格式、附件数量、无法无损转换节点数和完成时间，不包含标题、正文、附件名或目标路径。

长任务固定请求和事件：

```text
operation.getStatus  operationId → OperationStatus
operation.cancel     operationId → OperationStatus
operation.progress   主动事件
operation.completed  主动事件
profile.locked       主动事件
```

`OperationStatus` 是以 `state` 判别的联合：RUNNING 包含任务类型、枚举阶段及 `number(0..1) | null` 进度；SUCCEEDED 包含与任务类型匹配的安全结果；FAILED 包含固定 `IpcError`；CANCELLED 不含错误。`operation.completed` 使用同一终态联合并附带 Operation ID。取消已终止任务返回原终态；Schema 不允许终态携带 RUNNING 进度。

成功结果按任务类型判别：附件导入只返回新 Attachment 摘要，附件另存为只返回完成时间，笔记导出只返回安全报告。`profile.locked` 原因穷举为：

```text
MANUAL | SWITCHED | SYSTEM_LOCK | SYSTEM_SUSPEND | IDLE_TIMEOUT | SESSION_CLOSED
```

事件描述符 Channel 固定为 `notera:operation:progress`、`notera:operation:completed` 和 `notera:profile:locked`。事件载荷不含 Electron Event、密码、密钥、路径、文件名、ADF 或底层异常。

### 单元测试

`file-operation-contracts.test.ts` 明确覆盖：

- 五个附件请求、一个导出请求、两个任务请求、三个主动事件；
- 用户取消与任务启动判别联合严格互斥；
- 0、恰好 100 MiB 附件通过，100 MiB + 1 失败；
- 预览 URL 只接受 `notera-media:`，并拒绝未知字段和过期时间；
- 所有文件相关请求/响应拒绝真实路径、大字节数组、File Key、Manifest、Chunk、远端/传输状态；
- RUNNING 允许确定/不确定进度，拒绝负数、超过 1、`NaN`；
- SUCCEEDED 结果必须与 Operation Kind 匹配；FAILED 只能带安全错误；CANCELLED 不带错误；
- `operation.cancel` 的已完成响应保持原终态；
- Profile 锁定原因穷举，事件拒绝 Profile ID、Vault ID 和密钥信息；
- 任务事件不包含标题、正文、附件名、路径或底层异常字段。

### 精确测试命令

```powershell
npm run test:unit -- src/shared/ipc/__tests__/file-operation-contracts.test.ts --runInBand
```

预期：该测试文件全部通过，0 个失败。

### 完成后提交

```powershell
git add src/shared/index.ts src/shared/ipc/contracts/attachment.ts src/shared/ipc/contracts/export.ts src/shared/ipc/contracts/operation.ts src/shared/ipc/__tests__/file-operation-contracts.test.ts
git commit -m "feat(ipc): define file operation contracts"
```

## 任务 5：唯一注册表、`window.notera` API 与 Preload 白名单桥

**目标：** 汇总全部离线合约，建立 Renderer 可见的显式业务 API，在 Preload 中落实请求/响应/事件校验，并彻底移除 `ipc-example` 与通用 `window.electron.ipcRenderer`。

**涉及文件：**

- 新增：`src/shared/ipc/registry.ts`
- 新增：`src/shared/ipc/api.ts`
- 新增：`src/shared/ipc/__tests__/registry.test.ts`
- 新增：`src/__tests__/preload.test.ts`
- 修改：`src/shared/index.ts`
- 修改：`src/main/preload.ts`
- 修改：`src/main/main.ts`
- 修改：`src/renderer/preload.d.ts`
- 修改：`src/renderer/index.tsx`

### 功能逻辑与关键接口

- [ ] 在同一功能任务中完成注册表、显式 API、Preload 桥、样板清理和对应单元测试。

`registry.ts` 使用对象字面量汇总全部描述符并保留字面量 Key：

```ts
export const requestContracts = {
  'profile.list': profileList,
  'profile.getSessionState': profileGetSessionState,
  'profile.create': profileCreate,
  'profile.unlock': profileUnlock,
  'profile.lock': profileLock,
  'profile.switch': profileSwitch,
  'profile.rename': profileRename,
  'profile.changePassword': profileChangePassword,
  'profile.removeFromDevice': profileRemoveFromDevice,
  'contentTree.listChildren': contentTreeListChildren,
  'contentTree.createFolder': contentTreeCreateFolder,
  'contentTree.renameFolder': contentTreeRenameFolder,
  'contentTree.moveFolder': contentTreeMoveFolder,
  'contentTree.reorderEntry': contentTreeReorderEntry,
  'contentTree.trashFolder': contentTreeTrashFolder,
  'note.create': noteCreate,
  'note.get': noteGet,
  'note.saveDraft': noteSaveDraft,
  'note.move': noteMove,
  'note.copy': noteCopy,
  'note.trash': noteTrash,
  'note.listRecent': noteListRecent,
  'tag.list': tagList,
  'tag.create': tagCreate,
  'tag.rename': tagRename,
  'tag.delete': tagDelete,
  'tag.addToNote': tagAddToNote,
  'tag.removeFromNote': tagRemoveFromNote,
  'favorite.list': favoriteList,
  'favorite.add': favoriteAdd,
  'favorite.remove': favoriteRemove,
  'favorite.reorder': favoriteReorder,
  'batch.move': batchMove,
  'batch.addTags': batchAddTags,
  'batch.removeTags': batchRemoveTags,
  'batch.copy': batchCopy,
  'batch.trash': batchTrash,
  'history.list': historyList,
  'history.get': historyGet,
  'history.createPermanent': historyCreatePermanent,
  'history.compare': historyCompare,
  'history.restore': historyRestore,
  'history.copy': historyCopy,
  'trash.list': trashList,
  'trash.restore': trashRestore,
  'trash.deletePermanent': trashDeletePermanent,
  'trash.purgeExpired': trashPurgeExpired,
  'search.query': searchQuery,
  'attachment.listForNote': attachmentListForNote,
  'attachment.startImport': attachmentStartImport,
  'attachment.removeFromNote': attachmentRemoveFromNote,
  'attachment.getPreviewUrl': attachmentGetPreviewUrl,
  'attachment.startSaveAs': attachmentStartSaveAs,
  'export.startNote': exportStartNote,
  'operation.getStatus': operationGetStatus,
  'operation.cancel': operationCancel,
} as const;

export const eventContracts = {
  profileLocked,
  operationProgress,
  operationCompleted,
} as const;
```

实现时必须按上表逐项列出任务 2–4 的 56 个请求描述符，不通过目录扫描、动态 import 或字符串拼接生成。注册表加载时执行开发期不变量检查：Key 唯一、Channel 唯一、请求/事件 Channel 不冲突、Channel 匹配 `^notera:[a-z0-9-]+:[a-z0-9-]+$`。

`api.ts` 从各描述符的 `request`、`data` Schema 推导方法参数和 `Promise<IpcResponse<Data>>` 返回类型，公开：

```ts
export type InvokeMethod<C extends RequestContract<any, any, any>> = (
  input: z.input<C['request']>,
) => Promise<IpcResponse<z.output<C['data']>>>;

export type SubscribeMethod<E extends EventContract<any, any>> = (
  listener: (payload: z.output<E['payload']>) => void,
) => () => void;

export interface NoteraApi {
  readonly profile: {
    readonly list: InvokeMethod<typeof profileList>;
    readonly getSessionState: InvokeMethod<typeof profileGetSessionState>;
    readonly create: InvokeMethod<typeof profileCreate>;
    readonly unlock: InvokeMethod<typeof profileUnlock>;
    readonly lock: InvokeMethod<typeof profileLock>;
    readonly switch: InvokeMethod<typeof profileSwitch>;
    readonly rename: InvokeMethod<typeof profileRename>;
    readonly changePassword: InvokeMethod<typeof profileChangePassword>;
    readonly removeFromDevice: InvokeMethod<typeof profileRemoveFromDevice>;
  };
  readonly contentTree: {
    readonly listChildren: InvokeMethod<typeof contentTreeListChildren>;
    readonly createFolder: InvokeMethod<typeof contentTreeCreateFolder>;
    readonly renameFolder: InvokeMethod<typeof contentTreeRenameFolder>;
    readonly moveFolder: InvokeMethod<typeof contentTreeMoveFolder>;
    readonly reorderEntry: InvokeMethod<typeof contentTreeReorderEntry>;
    readonly trashFolder: InvokeMethod<typeof contentTreeTrashFolder>;
  };
  readonly note: {
    readonly create: InvokeMethod<typeof noteCreate>;
    readonly get: InvokeMethod<typeof noteGet>;
    readonly saveDraft: InvokeMethod<typeof noteSaveDraft>;
    readonly move: InvokeMethod<typeof noteMove>;
    readonly copy: InvokeMethod<typeof noteCopy>;
    readonly trash: InvokeMethod<typeof noteTrash>;
    readonly listRecent: InvokeMethod<typeof noteListRecent>;
  };
  readonly tag: {
    readonly list: InvokeMethod<typeof tagList>;
    readonly create: InvokeMethod<typeof tagCreate>;
    readonly rename: InvokeMethod<typeof tagRename>;
    readonly delete: InvokeMethod<typeof tagDelete>;
    readonly addToNote: InvokeMethod<typeof tagAddToNote>;
    readonly removeFromNote: InvokeMethod<typeof tagRemoveFromNote>;
  };
  readonly favorite: {
    readonly list: InvokeMethod<typeof favoriteList>;
    readonly add: InvokeMethod<typeof favoriteAdd>;
    readonly remove: InvokeMethod<typeof favoriteRemove>;
    readonly reorder: InvokeMethod<typeof favoriteReorder>;
  };
  readonly batch: {
    readonly move: InvokeMethod<typeof batchMove>;
    readonly addTags: InvokeMethod<typeof batchAddTags>;
    readonly removeTags: InvokeMethod<typeof batchRemoveTags>;
    readonly copy: InvokeMethod<typeof batchCopy>;
    readonly trash: InvokeMethod<typeof batchTrash>;
  };
  readonly history: {
    readonly list: InvokeMethod<typeof historyList>;
    readonly get: InvokeMethod<typeof historyGet>;
    readonly createPermanent: InvokeMethod<typeof historyCreatePermanent>;
    readonly compare: InvokeMethod<typeof historyCompare>;
    readonly restore: InvokeMethod<typeof historyRestore>;
    readonly copy: InvokeMethod<typeof historyCopy>;
  };
  readonly trash: {
    readonly list: InvokeMethod<typeof trashList>;
    readonly restore: InvokeMethod<typeof trashRestore>;
    readonly deletePermanent: InvokeMethod<typeof trashDeletePermanent>;
    readonly purgeExpired: InvokeMethod<typeof trashPurgeExpired>;
  };
  readonly search: { readonly query: InvokeMethod<typeof searchQuery> };
  readonly attachment: {
    readonly listForNote: InvokeMethod<typeof attachmentListForNote>;
    readonly startImport: InvokeMethod<typeof attachmentStartImport>;
    readonly removeFromNote: InvokeMethod<typeof attachmentRemoveFromNote>;
    readonly getPreviewUrl: InvokeMethod<typeof attachmentGetPreviewUrl>;
    readonly startSaveAs: InvokeMethod<typeof attachmentStartSaveAs>;
  };
  readonly export: { readonly startNote: InvokeMethod<typeof exportStartNote> };
  readonly operation: {
    readonly getStatus: InvokeMethod<typeof operationGetStatus>;
    readonly cancel: InvokeMethod<typeof operationCancel>;
  };
  readonly events: {
    readonly onProfileLocked: SubscribeMethod<typeof profileLocked>;
    readonly onOperationProgress: SubscribeMethod<typeof operationProgress>;
    readonly onOperationCompleted: SubscribeMethod<typeof operationCompleted>;
  };
}
```

上面注释中的模块方法不是实施占位：实现时按任务 2–4 已列出的固定请求目录全部逐项写出，不能添加通用 `invoke(channel)`、索引签名或任意字符串 Channel。

`src/main/preload.ts` 实现两个内部辅助函数：

```ts
function invoke<C extends RequestContract<any, any, any>>(
  contract: C,
  input: z.input<C['request']>,
): Promise<IpcResponse<z.output<C['data']>>>;

function subscribe<E extends EventContract<any, any>>(
  contract: E,
  listener: (payload: z.output<E['payload']>) => void,
): () => void;
```

`invoke` 先用共享请求 Schema 解析；失败时直接返回 `INVALID_IPC_REQUEST` 且绝不调用 `ipcRenderer.invoke()`。调用固定 Channel 后用响应 Schema 解析；IPC rejection 映射为 `IPC_OPERATION_FAILED`，非法响应映射为 `INVALID_IPC_RESPONSE`，不转发 rejection 文本。

`subscribe` 为每个监听器保存唯一包装函数，丢弃 `IpcRendererEvent`，只把合法业务载荷传给回调；非法载荷静默丢弃并且不得 `console.log` 原数据。返回函数以相同 Channel 和相同包装函数调用 `ipcRenderer.removeListener()`。

为避免各模块的 `list/create/move` 局部名称冲突，再定义只接受已注册描述符的绑定辅助函数；它只闭包捕获编译期描述符，不接受 Channel 字符串：

```ts
function bindRequest<C extends RequestContract<any, any, any>>(
  contract: C,
): InvokeMethod<C> {
  return (input) => invoke(contract, input);
}

function bindEvent<E extends EventContract<any, any>>(
  contract: E,
): SubscribeMethod<E> {
  return (listener) => subscribe(contract, listener);
}
```

Preload 显式创建以下结构并执行：

```ts
const noteraApi = {
  profile: {
    list: bindRequest(profileList),
    getSessionState: bindRequest(profileGetSessionState),
    create: bindRequest(profileCreate),
    unlock: bindRequest(profileUnlock),
    lock: bindRequest(profileLock),
    switch: bindRequest(profileSwitch),
    rename: bindRequest(profileRename),
    changePassword: bindRequest(profileChangePassword),
    removeFromDevice: bindRequest(profileRemoveFromDevice),
  },
  contentTree: {
    listChildren: bindRequest(contentTreeListChildren),
    createFolder: bindRequest(contentTreeCreateFolder),
    renameFolder: bindRequest(contentTreeRenameFolder),
    moveFolder: bindRequest(contentTreeMoveFolder),
    reorderEntry: bindRequest(contentTreeReorderEntry),
    trashFolder: bindRequest(contentTreeTrashFolder),
  },
  note: {
    create: bindRequest(noteCreate),
    get: bindRequest(noteGet),
    saveDraft: bindRequest(noteSaveDraft),
    move: bindRequest(noteMove),
    copy: bindRequest(noteCopy),
    trash: bindRequest(noteTrash),
    listRecent: bindRequest(noteListRecent),
  },
  tag: {
    list: bindRequest(tagList),
    create: bindRequest(tagCreate),
    rename: bindRequest(tagRename),
    delete: bindRequest(tagDelete),
    addToNote: bindRequest(tagAddToNote),
    removeFromNote: bindRequest(tagRemoveFromNote),
  },
  favorite: {
    list: bindRequest(favoriteList),
    add: bindRequest(favoriteAdd),
    remove: bindRequest(favoriteRemove),
    reorder: bindRequest(favoriteReorder),
  },
  batch: {
    move: bindRequest(batchMove),
    addTags: bindRequest(batchAddTags),
    removeTags: bindRequest(batchRemoveTags),
    copy: bindRequest(batchCopy),
    trash: bindRequest(batchTrash),
  },
  history: {
    list: bindRequest(historyList),
    get: bindRequest(historyGet),
    createPermanent: bindRequest(historyCreatePermanent),
    compare: bindRequest(historyCompare),
    restore: bindRequest(historyRestore),
    copy: bindRequest(historyCopy),
  },
  trash: {
    list: bindRequest(trashList),
    restore: bindRequest(trashRestore),
    deletePermanent: bindRequest(trashDeletePermanent),
    purgeExpired: bindRequest(trashPurgeExpired),
  },
  search: { query: bindRequest(searchQuery) },
  attachment: {
    listForNote: bindRequest(attachmentListForNote),
    startImport: bindRequest(attachmentStartImport),
    removeFromNote: bindRequest(attachmentRemoveFromNote),
    getPreviewUrl: bindRequest(attachmentGetPreviewUrl),
    startSaveAs: bindRequest(attachmentStartSaveAs),
  },
  export: { startNote: bindRequest(exportStartNote) },
  operation: {
    getStatus: bindRequest(operationGetStatus),
    cancel: bindRequest(operationCancel),
  },
  events: {
    onProfileLocked: bindEvent(profileLocked),
    onOperationProgress: bindEvent(operationProgress),
    onOperationCompleted: bindEvent(operationCompleted),
  },
} satisfies NoteraApi;

contextBridge.exposeInMainWorld('notera', noteraApi);
```

每个局部方法必须绑定对应描述符，不能根据属性名在运行时生成 Channel。`src/renderer/preload.d.ts` 把 `Window` 改为只声明 `notera: NoteraApi`。删除 `Channels`、`ElectronHandler`、`window.electron`、`ipc-example` Main Handler 和 Renderer 启动 ping；不新增真实业务 Handler，也不让 `App.tsx` 调用未实现 API。

### 单元测试

`registry.test.ts` 明确覆盖：

- 56 个请求和 3 个事件全部注册且无重复；
- 每个 Channel 满足命名正则，请求与事件不冲突；
- 所有列表请求包含游标分页，所有正文替换请求包含 `expectedContentVersion`；
- 注册表 Key、API 模块和业务方法一一对应；
- Channel、Key、DTO 字段中不存在 `sync`、`outbox`、`conflict`、`remoteState`；
- Shared 公开入口不导出 Electron 类型、通用 Channel 或旧 `ElectronHandler`。

`preload.test.ts` 使用 `jest.mock('electron')` 提供 `contextBridge.exposeInMainWorld`、`ipcRenderer.invoke/on/removeListener`，重新加载 Preload 后验证：

- 只以 `notera` 名称暴露一次 API；
- 所有显式模块/方法存在，不存在 `ipcRenderer`、`sendMessage`、`invoke(channel)` 或索引签名运行时入口；
- 合法请求调用正确固定 Channel 且只传解析后的 DTO；
- 非法请求返回 `INVALID_IPC_REQUEST` 并且 `ipcRenderer.invoke` 调用次数为 0；
- 合法成功/失败响应原样返回，未知字段或错误码映射 `INVALID_IPC_RESPONSE`；
- Electron invoke rejection 映射 `IPC_OPERATION_FAILED`，消息中不含原 rejection；
- 合法事件只把业务载荷传给监听器，非法事件不调用监听器；
- 取消订阅使用注册时同一包装函数调用 `removeListener`；
- `src/main/main.ts` 与 `src/renderer/index.tsx` 不再包含 `ipc-example` 行为。

### 精确测试命令

```powershell
npm run test:unit -- src/shared/ipc/__tests__/registry.test.ts src/__tests__/preload.test.ts --runInBand
```

预期：两个测试文件全部通过，0 个失败。

### 完成后提交

```powershell
git add src/shared/index.ts src/shared/ipc/registry.ts src/shared/ipc/api.ts src/shared/ipc/__tests__/registry.test.ts src/__tests__/preload.test.ts src/main/preload.ts src/main/main.ts src/renderer/preload.d.ts src/renderer/index.tsx
git commit -m "feat(ipc): expose validated preload api"
```

## 最终验证

五个功能模块全部完成并提交后，只运行以下一次最终验证：

```powershell
npm run test:unit -- src/shared/ipc/__tests__ src/__tests__/preload.test.ts --runInBand
npm run typecheck:app
npm run check:deps
npm run lint
npm run build
git diff --check
```

预期结果：

- Shared 与 Preload 相关测试全部通过，0 个失败；
- 应用 TypeScript 检查通过，Schema 推导类型与 `NoteraApi`/Preload 映射一致；
- Dependency Cruiser 显示 0 个违规，`src/shared` 不依赖项目内模块，Preload 只依赖 Electron 与 Shared；
- ESLint 通过；
- Main、Preload 和 Renderer 生产构建通过；
- `git diff --check` 无输出；
- 工作区只保留用户原有且未纳入本计划的未跟踪内容。

验证失败时只针对失败原因修复并复测受影响检查，不重复运行未受影响且已通过的检查。若修复涉及功能逻辑，纳入对应模块提交；若仅为最终统一 lint/格式适配，所有检查通过后创建一次收尾提交：

```powershell
git add package.json package-lock.json src/shared src/main/preload.ts src/main/main.ts src/renderer/preload.d.ts src/renderer/index.tsx src/__tests__/preload.test.ts
git commit -m "style(ipc): satisfy final checks"
```

## 完成标准

- 五个完整功能模块分别完成一次提交；
- 56 个离线业务请求和 3 个主动事件全部由 Zod Schema 驱动并进入唯一注册表；
- `IpcResponse<T>` 严格使用 `ret/data/error` 结构，错误码和消息有固定白名单；
- 所有无界列表使用不透明游标，树按父目录懒加载；
- 自动保存和历史恢复使用 `expectedContentVersion`；
- 文件选择由 Main 发起，IPC 不传真实路径或大文件字节；
- 长任务支持进度、完成、状态查询、幂等取消和 Profile 锁定终止语义；
- Renderer 只看到显式 `window.notera`，不再接触通用 Electron IPC；
- 不实现或导出同步、云端、冲突、Outbox 或远端附件能力；
- 相关单元测试与必要最终验证全部通过。
