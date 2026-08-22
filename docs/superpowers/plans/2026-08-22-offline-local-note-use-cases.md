# Notera 离线本地笔记用例实施计划

> **执行要求：** 使用 `superpowers:executing-plans` 在当前会话按功能模块顺序实施。遵守仓库 `AGENTS.md`：不使用子代理或重复审核；每个模块把测试与实现一起完成并提交；所有模块完成后只执行一次必要的最终验证。

**目标：** 在 `@notera/application` 中提供由 `ProfileManager.localNotes` 暴露的完整离线目录、笔记、关系、历史、回收站、批量和搜索用例，并更新内容树排序与历史命名所需的 Domain、Storage 和 Shared 合约。

**架构：** `LocalNotesService` 是不持有 Session 或数据库的薄 Facade，每次调用经当前 `ProfileSession.run()` 进入功能模块。功能模块使用窄接口组合 Domain 规则和同步 SQLCipher 事务；Application DTO 与 Shared IPC 结构一致但不反向依赖 `src/shared`。内容树采用 Folder 优先的可选自动排序，用户历史版本名称通过不可变 v1/v2 之后的 Schema v3 持久化。

**技术栈：** TypeScript 5.8、Node.js、Electron 42、Zod 4、SQLCipher/SQLite、Jest 29、ts-jest。

---

## 范围与实施顺序

本计划包含七个完整纵向模块，必须按顺序实施：

1. Local Notes Facade 与自动排序内容树；
2. 笔记创建、详情、保存、移动、复制与最近使用；
3. 标签与收藏；
4. 可命名历史版本与 Schema v3；
5. 删除组回收站；
6. 原子批量操作；
7. 搜索、Session 集成与公共 API 收口。

测试与实现属于同一个模块任务，不拆成“失败测试、实现、成功测试”等微步骤。实施期间只运行本模块列出的测试；模块通过后提交一次。第七个模块完成代码后执行一次最终验证，再提交该完整模块。

本计划不实现附件引用编排、Electron Main/Preload handler、Renderer、编辑器、导出或任何同步能力。复制相关用例向 Domain 传入空附件引用集合，下一阶段再在同一事务边界扩展；不创建附件或同步占位实现。

## 实施后的文件职责

```text
packages/application/src/
  manager.ts                         # 创建稳定 localNotes Facade 并提供当前 Session
  session.ts                         # 现有 Session 操作门，不增加业务方法
  errors.ts                          # 稳定 Application 错误码与安全消息
  types.ts                           # ProfileManager 增加 localNotes
  index.ts                           # 导出 LocalNotesService 与公共 DTO
  local-notes/
    service.ts                       # Facade、Session 获取、时钟与 ID 依赖
    types.ts                         # 与 IPC 同构的 Application DTO
    folders.ts                       # 目录和排序内容树
    notes.ts                         # 笔记核心用例
    tags.ts                          # 标签用例
    favorites.ts                     # 收藏用例
    history.ts                       # 永久历史用例
    trash.ts                         # 删除组回收站用例
    batch.ts                         # 原子批量用例
    search.ts                        # 搜索范围和结果映射
    mapping.ts                       # Domain/Storage 到 DTO 的纯映射
    errors.ts                        # 按读写上下文映射 Domain/Storage 错误
  __tests__/
    local-notes-folders.test.ts
    local-notes-notes.test.ts
    local-notes-relations.test.ts
    local-notes-history.test.ts
    local-notes-trash.test.ts
    local-notes-batch.test.ts
    local-notes-search-session.test.ts

packages/domain/src/
  models/history.ts                  # USER versionName 与保护版本不变量
  operations/history.ts              # 创建、重命名、恢复历史计划
  values.ts                          # VersionName 规范化
  __tests__/history-trash.test.ts    # 历史名称及原有保护/回收规则

packages/storage-sqlcipher/src/
  cursor.ts                          # 数字或文本 Keyset Cursor
  types.ts                           # 内容排序、历史命名、删除组窄接口
  index.ts                           # 导出新增公共 Storage 类型
  schema/v3.ts                       # v2 → v3 version_name 迁移
  migrations/registry.ts             # 注册连续 v3
  serialization/rows.ts             # version_name 严格水合
  repositories/folders.ts            # Folder 优先的动态安全排序
  repositories/history.ts            # 名称读写与保护版本拒绝
  repositories/trash.ts              # 顶层删除组分页和整组读取/提交
  integrity.ts                        # 历史名称不变量检查
  __tests__/transactions-folders.test.ts
  __tests__/migrations.test.ts
  __tests__/schema.test.ts
  __tests__/organization-history.test.ts
  __tests__/trash-plans.test.ts

src/shared/ipc/
  contracts/content-tree.ts          # 自动排序请求；移除手动重排和 sortOrder
  contracts/history.ts               # versionName、保护原因和 history.rename
  registry.ts                         # 删除 reorderEntry、注册 history.rename
  __tests__/profile-content-contracts.test.ts
  __tests__/organization-contracts.test.ts
  __tests__/registry.test.ts
```

---

## 功能模块 1：Local Notes Facade 与自动排序内容树

**目标与功能逻辑**

建立稳定的 `ProfileManager.localNotes`，完成目录查询、创建、重命名和移动的纵向路径，并把内容树从手动 `sortOrder` 改为 Folder 优先的自动排序。Service 不保存 Session；每次方法调用重新获取当前 Session。锁定返回 `PROFILE_LOCKED`，Profile 切换后同一 Service 自动使用新 Session。

`contentTree.listChildren` 接受可选 `sort`，缺省为 `CREATED_AT DESC`。Storage 只允许三个固定字段和两个固定方向，不把调用方字符串拼接进 SQL。查询顺序固定为 `entity_kind ASC`（Folder 在 Note 前）、所选字段与方向、`entity_id ASC`。标题使用 `COLLATE NOCASE`。Cursor 指纹包含父目录、字段和方向；数字字段继续使用 `sortOrder` Cursor 值，标题字段使用新增的受长度限制文本 Cursor 值。

删除 `contentTree.reorderEntry`、Registry 条目和对应测试；Folder/Note IPC 摘要移除 `sortOrder`。Domain/数据库内部旧字段保留但内容树不读取它。

**关键接口**

```ts
export type ContentSort = Readonly<{
  field: 'CREATED_AT' | 'UPDATED_AT' | 'TITLE';
  direction: 'ASC' | 'DESC';
}>;

export interface LocalNotesService {
  listChildren(input: {
    parentFolderId: FolderId;
    cursor?: string;
    limit: number;
    sort?: ContentSort;
  }): Promise<Page<TreeEntrySummary>>;
  createFolder(input: { parentFolderId: FolderId; name: string }): Promise<FolderSummary>;
  renameFolder(input: { folderId: FolderId; name: string }): Promise<FolderSummary>;
  moveFolder(input: { folderId: FolderId; targetParentId: FolderId }): Promise<FolderSummary>;
}

export interface LocalNotesDependencies {
  readonly getSession: () => ProfileSession | undefined;
  readonly now: () => Timestamp;
  readonly randomId: () => string;
}
```

Cursor 类型扩展为显式联合，避免破坏已有数字 Cursor：

```ts
export type KeysetCursor =
  | Readonly<{ sortOrder: number; lastId: string; secondary?: string }>
  | Readonly<{ sortText: string; lastId: string; secondary?: string }>;
```

`folders.ts` 在创建/重命名/移动时调用 `createRegularFolder`、`renameFolder`、`moveFolder`，使用 `database.transaction()` 提交。`mapping.ts` 通过对每个 Folder 执行 `listContent(folder.id, { limit: 1 }, DEFAULT_SORT)` 得到 `hasChildren`，回收站内容由 Storage 查询排除。

**涉及文件**

- 新建：`packages/application/src/local-notes/service.ts`
- 新建：`packages/application/src/local-notes/types.ts`
- 新建：`packages/application/src/local-notes/folders.ts`
- 新建：`packages/application/src/local-notes/mapping.ts`
- 新建：`packages/application/src/local-notes/errors.ts`
- 新建测试：`packages/application/src/__tests__/local-notes-folders.test.ts`
- 修改：`packages/application/src/manager.ts`
- 修改：`packages/application/src/types.ts`
- 修改：`packages/application/src/errors.ts`
- 修改：`packages/application/src/index.ts`
- 修改：`packages/storage-sqlcipher/src/cursor.ts`
- 修改：`packages/storage-sqlcipher/src/types.ts`
- 修改：`packages/storage-sqlcipher/src/index.ts`
- 修改：`packages/storage-sqlcipher/src/repositories/folders.ts`
- 修改测试：`packages/storage-sqlcipher/src/__tests__/transactions-folders.test.ts`
- 修改：`src/shared/ipc/contracts/content-tree.ts`
- 修改：`src/shared/ipc/registry.ts`
- 修改测试：`src/shared/ipc/__tests__/profile-content-contracts.test.ts`
- 修改测试：`src/shared/ipc/__tests__/registry.test.ts`

**单元测试与断言**

- Shared 接受缺省排序、三字段双方向，拒绝未知字段、未知方向和额外属性；摘要拒绝 `sortOrder`；Registry 不再含 `contentTree.reorderEntry`。
- Storage 对 Folder/Note 混合数据验证 Folder 始终优先；每组分别覆盖 `CREATED_AT`、`UPDATED_AT`、`TITLE` 的 ASC/DESC；相同值按 ID；标题大小写使用 `NOCASE`；Cursor 不能跨父目录、字段或方向复用。
- Application 验证默认 `CREATED_AT DESC`、显式排序透传、`hasChildren`、根目录保护、目录环、锁定拒绝、切换后使用新 Session，以及 Domain/Storage 错误到安全 ApplicationError 的映射。

测试中的关键期望必须包含：

```ts
expect(result.items.map(({ kind, id }) => [kind, id])).toEqual([
  ['folder', newestFolderId],
  ['folder', olderFolderId],
  ['note', newestNoteId],
  ['note', olderNoteId],
]);
expect(() => parseCursorFromOtherSort(cursor)).toThrowCode('INVALID_CURSOR');
```

**精确测试命令**

```powershell
npm test -- --runInBand --runTestsByPath packages/application/src/__tests__/local-notes-folders.test.ts packages/storage-sqlcipher/src/__tests__/transactions-folders.test.ts src/shared/ipc/__tests__/profile-content-contracts.test.ts src/shared/ipc/__tests__/registry.test.ts
```

预期：4 个测试文件全部通过，0 个失败；不运行其他模块测试、全量 lint、typecheck 或 build。

**完成后的提交**

```powershell
git add -- packages/application/src/local-notes packages/application/src/manager.ts packages/application/src/types.ts packages/application/src/errors.ts packages/application/src/index.ts packages/application/src/__tests__/local-notes-folders.test.ts packages/storage-sqlcipher/src/cursor.ts packages/storage-sqlcipher/src/types.ts packages/storage-sqlcipher/src/index.ts packages/storage-sqlcipher/src/repositories/folders.ts packages/storage-sqlcipher/src/__tests__/transactions-folders.test.ts src/shared/ipc/contracts/content-tree.ts src/shared/ipc/registry.ts src/shared/ipc/__tests__/profile-content-contracts.test.ts src/shared/ipc/__tests__/registry.test.ts
git commit -m "feat(application): expose sorted local content tree"
```

---

## 功能模块 2：笔记核心用例

**目标与功能逻辑**

完成 Note IPC 对应的创建、详情、草稿保存、移动、复制、回收入口和最近使用查询，其中回收入口只生成单 Note `TrashPlan`；删除组的列表、恢复与清理由模块 5 完成。

新建 Note 使用空 ADF、可选标题、当前 Vault/Folder、新 UUID、`contentVersion = 1` 和当前时间。详情组合 Note 与当前标签。草稿保存先读取当前 Note，用 `updateNoteContent()` 生成下一版本，再用 `replaceContent(note, expectedContentVersion)` 原子更新 Note 与 FTS。移动使用 `moveNote()` 并保留不再参与业务排序的内部 `sortOrder` 值。复制读取当前标签并构造 NoteTag，调用 `copyNote()` 时传入空附件引用，最后由 `contentPlans.insertNoteCopy()` 原子写入新 Note 与标签。

所有公开输入在进入 Domain 前规范化 ID、标题、ADF、分页和内容版本；直接调用 Application 时也不能依赖 IPC 已校验。

**关键接口**

```ts
interface LocalNotesService {
  createNote(input: { folderId: FolderId; title?: string }): Promise<NoteDetail>;
  getNote(noteId: NoteId): Promise<NoteDetail>;
  saveDraft(input: {
    noteId: NoteId;
    expectedContentVersion: ContentVersion;
    title: string;
    document: AdfDocument;
  }): Promise<{ noteId: NoteId; contentVersion: ContentVersion; savedAt: Timestamp }>;
  moveNote(input: { noteId: NoteId; targetFolderId: FolderId }): Promise<NoteSummary>;
  copyNote(input: { noteId: NoteId; targetFolderId: FolderId }): Promise<NoteSummary>;
  trashNote(noteId: NoteId): Promise<{ trashEntryId: TrashEntryId }>;
  listRecent(input: PageRequest): Promise<Page<NoteSummary>>;
}
```

空 ADF 固定为：

```ts
const EMPTY_DOCUMENT = asAdfDocument({ version: 1, type: 'doc', content: [] });
```

**涉及文件**

- 新建：`packages/application/src/local-notes/notes.ts`
- 新建测试：`packages/application/src/__tests__/local-notes-notes.test.ts`
- 修改：`packages/application/src/local-notes/service.ts`
- 修改：`packages/application/src/local-notes/types.ts`
- 修改：`packages/application/src/local-notes/mapping.ts`
- 修改：`packages/application/src/local-notes/errors.ts`
- 修改：`packages/application/src/errors.ts`
- 修改：`packages/application/src/index.ts`

**单元测试与断言**

- 新建 Note 默认空标题/空 ADF，显式标题保留，缺失或回收站 Folder 返回稳定错误。
- `getNote` 返回标签且不泄露 Vault、Row ID 或内部排序字段。
- `saveDraft` 成功递增一次版本并返回注入时钟；旧 expected version 返回 `CONTENT_VERSION_CONFLICT`；最大版本返回 `CONTENT_VERSION_OVERFLOW`；失败不改变 Note 或 FTS。
- 移动拒绝缺失/无效目标并更新修改时间。
- 复制生成新 ID、版本 1、复制当前标签且附件引用集合为空；复制任一步失败整体回滚。
- 单 Note 回收返回顶层 TrashEntry ID；最近使用分页按修改时间降序。

关键事务测试形状：

```ts
await expect(service.saveDraft({
  noteId,
  expectedContentVersion: asContentVersion(1),
  title: 'second',
  document,
})).resolves.toMatchObject({ noteId, contentVersion: 2, savedAt: now });
await expect(staleSave).rejects.toMatchObject({ code: 'CONTENT_VERSION_CONFLICT' });
```

**精确测试命令**

```powershell
npm test -- --runInBand --runTestsByPath packages/application/src/__tests__/local-notes-notes.test.ts
```

预期：该测试文件全部通过，0 个失败。

**完成后的提交**

```powershell
git add -- packages/application/src/local-notes packages/application/src/errors.ts packages/application/src/index.ts packages/application/src/__tests__/local-notes-notes.test.ts
git commit -m "feat(application): orchestrate local notes"
```

---

## 功能模块 3：标签与收藏

**目标与功能逻辑**

完成标签 CRUD、NoteTag 幂等关系、收藏列表/增删/重排。标签名称使用 `asTagName()` 并在 Application 限制 100 个 Unicode 字符。删除标签由 Storage 在同一事务删除标签和全部关系。添加关系先读取有效 Note 与 Tag，再使用 `addNoteTag()`；移除缺失关系成功返回空结果。

收藏列表分页读取 Favorite，再为每个 Favorite 获取当前有效 Note 并映射带 `favoriteSortOrder` 的摘要。添加收藏使用列表末尾之后的安全整数排序值；达到安全整数边界时先在同一事务把全部 Favorite 密集重排为 `0..n-1`。`favorite.reorder` 只重排 Favorite，不改变 Note 时间。回收站 Note 不得新增收藏，也不出现在列表中。

**关键接口**

```ts
interface LocalNotesService {
  listTags(input: PageRequest): Promise<Page<TagSummary>>;
  createTag(name: string): Promise<TagSummary>;
  renameTag(input: { tagId: TagId; name: string }): Promise<TagSummary>;
  deleteTag(tagId: TagId): Promise<void>;
  addTagToNote(input: { noteId: NoteId; tagId: TagId }): Promise<void>;
  removeTagFromNote(input: { noteId: NoteId; tagId: TagId }): Promise<void>;
  listFavorites(input: PageRequest): Promise<Page<FavoriteNoteSummary>>;
  addFavorite(noteId: NoteId): Promise<void>;
  removeFavorite(noteId: NoteId): Promise<void>;
  reorderFavorite(input: { noteId: NoteId; beforeNoteId?: NoteId }): Promise<void>;
}
```

收藏重排算法固定为“移除目标—插入 before 前或末尾—按数组索引重建 sortOrder”，并在一个事务调用 `replaceSortOrders()`；`beforeNoteId` 与 `noteId` 相同时为幂等 no-op。

**涉及文件**

- 新建：`packages/application/src/local-notes/tags.ts`
- 新建：`packages/application/src/local-notes/favorites.ts`
- 新建测试：`packages/application/src/__tests__/local-notes-relations.test.ts`
- 修改：`packages/application/src/local-notes/service.ts`
- 修改：`packages/application/src/local-notes/types.ts`
- 修改：`packages/application/src/local-notes/mapping.ts`
- 修改：`packages/application/src/local-notes/errors.ts`
- 修改：`packages/application/src/index.ts`

**单元测试与断言**

- 标签创建/重命名 trim、空白/过长拒绝、重复名称回滚、删除清除关系。
- NoteTag 重复添加与重复移除幂等；缺失 Note/Tag、跨 Vault、回收站 Note 拒绝。
- 收藏重复添加/移除幂等；列表排除回收站 Note；Cursor 保持 Storage 语义。
- 收藏重排覆盖移到首位、末尾、自身 before、缺失 before、整数边界密集化，并证明 Note `updatedAt` 不变。

```ts
expect(afterReorder.items.map(({ id }) => id)).toEqual([third, first, second]);
expect(database.notes.get(first)?.updatedAt).toBe(originalUpdatedAt);
```

**精确测试命令**

```powershell
npm test -- --runInBand --runTestsByPath packages/application/src/__tests__/local-notes-relations.test.ts
```

预期：该测试文件全部通过，0 个失败。

**完成后的提交**

```powershell
git add -- packages/application/src/local-notes packages/application/src/index.ts packages/application/src/__tests__/local-notes-relations.test.ts
git commit -m "feat(application): manage local note relations"
```

---

## 功能模块 4：可命名历史版本与 Schema v3

**目标与功能逻辑**

把用户版本名称作为独立可变元数据加入 Domain、SQLCipher、Application 和 IPC，同时保持标题/ADF/哈希快照不可变。用户版本 `versionName` 为 `string | null`；非空值 trim 后为 1–100 个 Unicode 字符。保护版本必须为 `versionName: null`，并继续携带 `BEFORE_HISTORY_RESTORE` 或 `BEFORE_MIGRATION`。

新增 v3 生产迁移，只给 `note_versions` 添加可空 `version_name`，CHECK 约束仅允许 `USER` 版本设置非空 trim 后名称。注册表升到 3，v1/v2 文件不修改。History Repository 的 `rename()` 只更新 `version_name`，WHERE 同时限制 Vault、Version、Note 和 `kind = 'USER'`；更新 0 行映射为明确业务错误，不修改 ADF 哈希列。

Application 完成历史列表、详情、用户版本创建、名称修改/清空、左右快照比较、带保护版本的乐观恢复和历史复制。`history.copy` 不复制当前标签。Shared 新增 `history.rename` 并注册；摘要携带 `versionName` 和可空保护原因。

**关键 Domain 与 Storage 接口**

```ts
export interface UserNoteVersion extends NoteVersionBase {
  readonly kind: 'USER';
  readonly protectionReason: null;
  readonly versionName: VersionName | null;
}

export interface ProtectionNoteVersion extends NoteVersionBase {
  readonly kind: 'SYSTEM_PROTECTION';
  readonly protectionReason: SystemProtectionReason;
  readonly versionName: null;
}

export function renameUserVersion(
  version: NoteVersion,
  versionName: VersionName | null,
): UserNoteVersion;

export interface HistoryWriter extends HistoryReader {
  insert(version: NoteVersion): void;
  rename(noteId: NoteId, versionId: NoteVersionId, versionName: VersionName | null): NoteVersion;
  restore(...): void;
}
```

v3 迁移核心 SQL：

```sql
ALTER TABLE note_versions
ADD COLUMN version_name TEXT
CHECK(
  version_name IS NULL
  OR (
    kind = 'USER'
    AND length(trim(version_name)) BETWEEN 1 AND 100
    AND version_name = trim(version_name)
  )
);
```

**关键 Application 接口**

```ts
interface LocalNotesService {
  listHistory(input: PageRequest & { noteId: NoteId }): Promise<Page<HistorySummary>>;
  getHistory(input: { noteId: NoteId; versionId: NoteVersionId }): Promise<HistorySnapshot>;
  createPermanentVersion(input: { noteId: NoteId; versionName?: string }): Promise<HistorySummary>;
  renameHistoryVersion(input: {
    noteId: NoteId;
    versionId: NoteVersionId;
    versionName: string | null;
  }): Promise<HistorySummary>;
  compareHistory(input: { noteId: NoteId; left: VersionRef; right: VersionRef }): Promise<HistoryComparison>;
  restoreHistory(input: {
    noteId: NoteId;
    versionId: NoteVersionId;
    expectedContentVersion: ContentVersion;
  }): Promise<HistoryRestoreResult>;
  copyHistory(input: {
    noteId: NoteId;
    versionId: NoteVersionId;
    targetFolderId: FolderId;
  }): Promise<NoteSummary>;
}
```

**涉及文件**

- 修改：`packages/domain/src/values.ts`
- 修改：`packages/domain/src/models/history.ts`
- 修改：`packages/domain/src/operations/history.ts`
- 修改测试：`packages/domain/src/__tests__/history-trash.test.ts`
- 新建：`packages/storage-sqlcipher/src/schema/v3.ts`
- 修改：`packages/storage-sqlcipher/src/migrations/registry.ts`
- 修改：`packages/storage-sqlcipher/src/types.ts`
- 修改：`packages/storage-sqlcipher/src/serialization/rows.ts`
- 修改：`packages/storage-sqlcipher/src/repositories/history.ts`
- 修改：`packages/storage-sqlcipher/src/integrity.ts`
- 修改测试：`packages/storage-sqlcipher/src/__tests__/migrations.test.ts`
- 修改测试：`packages/storage-sqlcipher/src/__tests__/schema.test.ts`
- 修改测试：`packages/storage-sqlcipher/src/__tests__/organization-history.test.ts`
- 新建：`packages/application/src/local-notes/history.ts`
- 新建测试：`packages/application/src/__tests__/local-notes-history.test.ts`
- 修改：`packages/application/src/local-notes/service.ts`
- 修改：`packages/application/src/local-notes/types.ts`
- 修改：`packages/application/src/local-notes/mapping.ts`
- 修改：`packages/application/src/local-notes/errors.ts`
- 修改：`packages/application/src/errors.ts`
- 修改：`packages/application/src/index.ts`
- 修改：`src/shared/ipc/contracts/history.ts`
- 修改：`src/shared/ipc/registry.ts`
- 修改测试：`src/shared/ipc/__tests__/organization-contracts.test.ts`
- 修改测试：`src/shared/ipc/__tests__/registry.test.ts`

**单元测试与集成断言**

- Domain 接受 null/合法名称，拒绝空白、101 字符、保护版本命名和保护版本重命名；重命名后标题/ADF/时间/内容版本不变。
- Migration 验证 v2→v3、全新建库重放到 v3、失败回滚、注册表连续且 `CURRENT_SCHEMA_VERSION === 3`。
- Storage 验证名称往返、清空、保护版本拒绝、跨 Note 拒绝、ADF hash 不变、损坏名称被完整性检查发现。
- Shared 验证 create 可选名称、rename nullable 名称、保护原因判别和 Registry 新 channel。
- Application 验证两类历史均列出；保护版本永久可读；compare 的 CURRENT/VERSION 组合；restore 原子插入 `BEFORE_HISTORY_RESTORE` 并处理 stale version；copy 使用版本标题/ADF 且不复制当前标签。

```ts
expect(renamed).toMatchObject({ kind: 'USER', versionName: '提交前' });
expect(after.document).toEqual(before.document);
await expect(renameProtection).rejects.toMatchObject({ code: 'INVALID_ENTITY_STATE' });
```

**精确测试命令**

```powershell
npm test -- --runInBand --runTestsByPath packages/domain/src/__tests__/history-trash.test.ts packages/storage-sqlcipher/src/__tests__/migrations.test.ts packages/storage-sqlcipher/src/__tests__/schema.test.ts packages/storage-sqlcipher/src/__tests__/organization-history.test.ts packages/application/src/__tests__/local-notes-history.test.ts src/shared/ipc/__tests__/organization-contracts.test.ts src/shared/ipc/__tests__/registry.test.ts
```

预期：7 个测试文件全部通过，0 个失败。

**完成后的提交**

```powershell
git add -- packages/domain/src/values.ts packages/domain/src/models/history.ts packages/domain/src/operations/history.ts packages/domain/src/__tests__/history-trash.test.ts packages/storage-sqlcipher/src/schema/v3.ts packages/storage-sqlcipher/src/migrations/registry.ts packages/storage-sqlcipher/src/types.ts packages/storage-sqlcipher/src/serialization/rows.ts packages/storage-sqlcipher/src/repositories/history.ts packages/storage-sqlcipher/src/integrity.ts packages/storage-sqlcipher/src/__tests__/migrations.test.ts packages/storage-sqlcipher/src/__tests__/schema.test.ts packages/storage-sqlcipher/src/__tests__/organization-history.test.ts packages/application/src/local-notes packages/application/src/errors.ts packages/application/src/index.ts packages/application/src/__tests__/local-notes-history.test.ts src/shared/ipc/contracts/history.ts src/shared/ipc/registry.ts src/shared/ipc/__tests__/organization-contracts.test.ts src/shared/ipc/__tests__/registry.test.ts
git commit -m "feat(application): manage named note history"
```

---

## 功能模块 5：删除组回收站

**目标与功能逻辑**

把现有逐 Entry Storage 能力收口为“顶层删除组”用户语义。无需新增 group 列：顶层 Entry 定义为其 `original_parent_id` 不对应任何当前已回收 Folder；Folder 根 Entry 的组通过现有 Folder 层级递归收集全部被回收 Folder 和 Note Entry，单 Note 组只包含自身。由于活动对象不能位于已回收父目录下，该定义不会把两个合法独立删除操作合并。

`TrashReader.list()` 改为只分页顶层 Entry；新增 `listGroup(rootEntryId)` 返回完整组；新增 `listExpiredGroups(now)` 返回所有已到期顶层组的完整 Entry 集合。Cursor 按 `deletedAt, id` 稳定分页。Application 用根对象生成 `displayName`，并检查原父目录是否当前有效。

恢复时 Application 为根 Entry 调用 `resolveTrashRestoreTarget()`；组内后代使用原父目录。Storage 接受“目标目录当前有效”或“目标目录属于同一恢复组且会先恢复”，按根 Folder、后代 Folder、Note 的父级顺序更新，然后恢复 FTS 并删除全部 Entry。永久删除和到期清理复用现有严格完整集合校验，返回删除对象数。Blob GC 不在本模块执行。

**关键接口**

```ts
export interface TrashReader {
  get(id: TrashEntryId): TrashEntry | undefined;
  list(page: PageRequest): Page<TrashEntry>; // 仅顶层 Entry
  listGroup(rootEntryId: TrashEntryId): readonly TrashEntry[];
  listExpiredGroups(now: Timestamp): readonly TrashEntry[];
}

interface LocalNotesService {
  listTrash(input: PageRequest): Promise<Page<TrashItem>>;
  restoreTrash(input: { trashEntryId: TrashEntryId; targetFolderId?: FolderId }): Promise<void>;
  deleteTrashPermanent(trashEntryId: TrashEntryId): Promise<{ deletedCount: number }>;
  purgeExpiredTrash(): Promise<{ deletedCount: number }>;
}
```

`deletedCount` 统计实际删除的 Folder 与 Note 数量，不把 TrashEntry、关系或 FTS 行计入。

**涉及文件**

- 修改：`packages/storage-sqlcipher/src/types.ts`
- 修改：`packages/storage-sqlcipher/src/repositories/trash.ts`
- 修改测试：`packages/storage-sqlcipher/src/__tests__/trash-plans.test.ts`
- 新建：`packages/application/src/local-notes/trash.ts`
- 新建测试：`packages/application/src/__tests__/local-notes-trash.test.ts`
- 修改：`packages/application/src/local-notes/service.ts`
- 修改：`packages/application/src/local-notes/types.ts`
- 修改：`packages/application/src/local-notes/mapping.ts`
- 修改：`packages/application/src/local-notes/errors.ts`
- 修改：`packages/application/src/index.ts`

**单元测试与集成断言**

- 单 Note、单 Folder 子树和多个同时间删除组只列顶层 Entry，内部 Entry 不出现在分页。
- `listGroup` 对 Note 返回自身，对 Folder 返回完整且无重复的 Folder/Note Entry；未知或内部 Entry 不能伪装成根组。
- 原父目录有效时恢复原位；缺失/已回收时要求显式目标；后代恢复原层级与 FTS。
- 到期边界为 `now >= expiresAt`；清理完整组，不删除未到期组。
- 永久删除清除 Note、Folder、标签、收藏、历史、FTS 和数据库附件引用行，但不触碰 Blob 文件；错误集合整体回滚。

```ts
expect(page.items.map(({ trashEntryId }) => trashEntryId)).toEqual([rootEntryId]);
expect(database.trash.listGroup(rootEntryId)).toHaveLength(folderCount + noteCount);
expect(await service.deleteTrashPermanent(rootEntryId)).toEqual({ deletedCount: folderCount + noteCount });
```

**精确测试命令**

```powershell
npm test -- --runInBand --runTestsByPath packages/storage-sqlcipher/src/__tests__/trash-plans.test.ts packages/application/src/__tests__/local-notes-trash.test.ts
```

预期：2 个测试文件全部通过，0 个失败。

**完成后的提交**

```powershell
git add -- packages/storage-sqlcipher/src/types.ts packages/storage-sqlcipher/src/repositories/trash.ts packages/storage-sqlcipher/src/__tests__/trash-plans.test.ts packages/application/src/local-notes packages/application/src/index.ts packages/application/src/__tests__/local-notes-trash.test.ts
git commit -m "feat(application): orchestrate grouped trash"
```

---

## 功能模块 6：原子批量操作

**目标与功能逻辑**

实现批量移动、添加标签、移除标签、复制和回收。所有操作先规范化并验证完整输入：ID 唯一、对象存在、非回收站、同 Vault、目标目录有效。选择集合包含某个 Folder 及其任意后代 Folder/Note 时，在写事务开始前后都返回 `INVALID_ENTITY_STATE`，不静默去重。

批量移动基于完整 Folder 快照逐个调用 `moveFolder()` 做环校验，Note 使用 `moveNote()`；把最终 Folder/Note 计划一次传给 `contentPlans.applyBatchMove()`。批量关系构造完整 NoteTag add/remove 集合后调用 `applyBatchRelations()`。批量复制为每个选中顶层目标及其子树生成确定映射；Folder 用 `copyFolderTree()`，Note 用 `copyNote()`，标签从当前关系重建，附件引用传空；全部计划在同一 transaction 写入。批量回收组合各顶层目标生成的 TrashPlan，只返回与输入顶层目标同顺序的 Entry ID。

**关键接口**

```ts
interface LocalNotesService {
  batchMove(input: { targets: readonly EntryRef[]; targetFolderId: FolderId }): Promise<void>;
  batchAddTags(input: { noteIds: readonly NoteId[]; tagIds: readonly TagId[] }): Promise<void>;
  batchRemoveTags(input: { noteIds: readonly NoteId[]; tagIds: readonly TagId[] }): Promise<void>;
  batchCopy(input: { targets: readonly EntryRef[]; targetFolderId: FolderId }): Promise<void>;
  batchTrash(input: { targets: readonly EntryRef[] }): Promise<{ trashEntryIds: readonly TrashEntryId[] }>;
}
```

祖先覆盖检查使用完整 Folder 父链，不按输入顺序决定结果：

```ts
function assertNoCoveredTargets(
  targets: readonly EntryRef[],
  folders: readonly Folder[],
  notes: readonly Note[],
): void;
```

任何目标是另一个已选 Folder 的后代时抛 `ApplicationError('INVALID_ENTITY_STATE')`。

**涉及文件**

- 新建：`packages/application/src/local-notes/batch.ts`
- 新建测试：`packages/application/src/__tests__/local-notes-batch.test.ts`
- 修改：`packages/application/src/local-notes/service.ts`
- 修改：`packages/application/src/local-notes/types.ts`
- 修改：`packages/application/src/local-notes/errors.ts`
- 修改：`packages/application/src/index.ts`

**单元测试与断言**

- 每种批量操作拒绝空、重复、缺失、跨 Vault、回收站和超过 IPC 上限的直接 Application 输入。
- 父 Folder + 子 Folder、父 Folder + 深层 Note、两个嵌套 Folder 都整体拒绝；兄弟目标允许。
- 批量移动任一环或无效父目录导致全体不变。
- 批量标签覆盖 Note×Tag 笛卡尔积且幂等，任一无效对象导致无部分关系。
- 批量复制保持层级、内容和标签，生成的所有 ID 唯一，不复制附件引用。
- 批量回收返回输入顶层目标对应 Entry ID，内部 Entry 不返回；任一失败不创建 Entry。

```ts
await expect(service.batchMove({
  targets: [folderRef(parent), noteRef(descendant)],
  targetFolderId,
})).rejects.toMatchObject({ code: 'INVALID_ENTITY_STATE' });
expect(snapshotDatabase()).toEqual(before);
```

**精确测试命令**

```powershell
npm test -- --runInBand --runTestsByPath packages/application/src/__tests__/local-notes-batch.test.ts
```

预期：该测试文件全部通过，0 个失败。

**完成后的提交**

```powershell
git add -- packages/application/src/local-notes packages/application/src/index.ts packages/application/src/__tests__/local-notes-batch.test.ts
git commit -m "feat(application): execute atomic note batches"
```

---

## 功能模块 7：搜索、Session 集成与公共 API 收口

**目标与功能逻辑**

完成 `search.query` Application 用例，并验证整个 LocalNotesService 的 Session、安全错误和包公开面。无 Folder ID 时使用 `{ kind: 'VAULT' }`；有 Folder ID 时先验证有效目录，再使用 `{ kind: 'FOLDER_SUBTREE', folderId }`。Application 只映射 Storage SearchHit，不记录、缓存或再次规范化搜索词，也不实现防抖。

集中完成 `local-notes/errors.ts` 的最终映射表：稳定 Domain 业务码原样映射；Storage `CONTENT_VERSION_CONFLICT`、`ENTITY_NOT_FOUND`、`INVALID_CURSOR`、`DISK_FULL` 精确映射；无法分类的写失败为 `SAVE_FAILED`，读失败为 `OPERATION_FAILED`；数据库关闭竞态为 `PROFILE_LOCKED`。公开 `ApplicationError` 消息不拼接下层 message。

补充真实 `ProfileManager` 集成测试，证明 `localNotes` 对象引用稳定、锁定拒绝、切换后不缓存旧 Vault、关闭等待已登记操作，以及包根只导出安全 Service/DTO，不导出内部 Session、Repository 或模块函数。

**关键接口**

```ts
interface LocalNotesService {
  search(input: {
    query: string;
    folderId?: FolderId;
    cursor?: string;
    limit: number;
  }): Promise<Page<SearchResult>>;
}

async function runRead<Result>(operation: LocalRead<Result>): Promise<Result>;
async function runWrite<Result>(operation: LocalWrite<Result>): Promise<Result>;
```

`runRead` 与 `runWrite` 共用 Session 获取和 Domain 映射，只在未知 Storage 错误 fallback 上不同；任何错误日志字段只能包含稳定错误码和非敏感计数。

**涉及文件**

- 新建：`packages/application/src/local-notes/search.ts`
- 新建测试：`packages/application/src/__tests__/local-notes-search-session.test.ts`
- 修改：`packages/application/src/local-notes/service.ts`
- 修改：`packages/application/src/local-notes/types.ts`
- 修改：`packages/application/src/local-notes/mapping.ts`
- 修改：`packages/application/src/local-notes/errors.ts`
- 修改：`packages/application/src/errors.ts`
- 修改：`packages/application/src/index.ts`
- 按最终类型错误只修改前六个模块已经涉及的 Local Notes、Domain、Storage 或 Shared 文件，不扩大功能范围。

**单元测试、集成测试与断言**

- Vault/Folder subtree 查询参数正确；缺失/回收站 Folder 拒绝；结果和高亮保持 Storage 顺序；Cursor 错用精确映射。
- 搜索词不出现在错误 message、模拟日志或快照。
- 读写 fallback 不混淆；所有 IPC 声明的本地笔记业务错误均可由 Application 表示，`IPC_OPERATION_FAILED` 仍只属于 Main/Shared。
- `manager.localNotes` 引用在锁定/解锁/切换中保持同一对象；旧调用在关闭前 settle，新调用锁定失败；新 Profile 查询不返回旧 Profile ID。
- `@notera/application` 包根导出 `LocalNotesService` 与 DTO，且不导出 `ProfileSession`、`VaultDatabase` 或内部 feature 函数。

```ts
const service = manager.localNotes;
await manager.lockProfile();
expect(manager.localNotes).toBe(service);
await expect(service.search({ query: 'secret', limit: 20 })).rejects.toMatchObject({ code: 'PROFILE_LOCKED' });
```

**本模块相关测试命令**

```powershell
npm test -- --runInBand --runTestsByPath packages/application/src/__tests__/local-notes-search-session.test.ts packages/storage-sqlcipher/src/__tests__/search.test.ts src/shared/ipc/__tests__/organization-contracts.test.ts
```

预期：3 个测试文件全部通过，0 个失败。

### 最终验证（本模块代码完成后只执行一次）

先运行本次改动相关测试全集：

```powershell
npm test -- --runInBand --runTestsByPath packages/domain/src/__tests__/history-trash.test.ts packages/application/src/__tests__/local-notes-folders.test.ts packages/application/src/__tests__/local-notes-notes.test.ts packages/application/src/__tests__/local-notes-relations.test.ts packages/application/src/__tests__/local-notes-history.test.ts packages/application/src/__tests__/local-notes-trash.test.ts packages/application/src/__tests__/local-notes-batch.test.ts packages/application/src/__tests__/local-notes-search-session.test.ts packages/storage-sqlcipher/src/__tests__/transactions-folders.test.ts packages/storage-sqlcipher/src/__tests__/migrations.test.ts packages/storage-sqlcipher/src/__tests__/schema.test.ts packages/storage-sqlcipher/src/__tests__/organization-history.test.ts packages/storage-sqlcipher/src/__tests__/trash-plans.test.ts packages/storage-sqlcipher/src/__tests__/search.test.ts src/shared/ipc/__tests__/profile-content-contracts.test.ts src/shared/ipc/__tests__/organization-contracts.test.ts src/shared/ipc/__tests__/registry.test.ts
```

再按本次实际改动运行必要静态检查：

```powershell
npm run typecheck --workspace=@notera/domain
npm run typecheck --workspace=@notera/storage-sqlcipher
npm run typecheck --workspace=@notera/application
npm run typecheck:app
npx eslint --ext .ts packages/domain/src/values.ts packages/domain/src/models/history.ts packages/domain/src/operations/history.ts packages/storage-sqlcipher/src/cursor.ts packages/storage-sqlcipher/src/types.ts packages/storage-sqlcipher/src/index.ts packages/storage-sqlcipher/src/schema/v3.ts packages/storage-sqlcipher/src/migrations/registry.ts packages/storage-sqlcipher/src/serialization/rows.ts packages/storage-sqlcipher/src/repositories/folders.ts packages/storage-sqlcipher/src/repositories/history.ts packages/storage-sqlcipher/src/repositories/trash.ts packages/storage-sqlcipher/src/integrity.ts packages/application/src/manager.ts packages/application/src/types.ts packages/application/src/errors.ts packages/application/src/index.ts packages/application/src/local-notes packages/application/src/__tests__/local-notes-folders.test.ts packages/application/src/__tests__/local-notes-notes.test.ts packages/application/src/__tests__/local-notes-relations.test.ts packages/application/src/__tests__/local-notes-history.test.ts packages/application/src/__tests__/local-notes-trash.test.ts packages/application/src/__tests__/local-notes-batch.test.ts packages/application/src/__tests__/local-notes-search-session.test.ts src/shared/ipc/contracts/content-tree.ts src/shared/ipc/contracts/history.ts src/shared/ipc/registry.ts src/shared/ipc/__tests__/profile-content-contracts.test.ts src/shared/ipc/__tests__/organization-contracts.test.ts src/shared/ipc/__tests__/registry.test.ts
npm run check:deps
git diff --check
```

预期：相关测试全集 0 失败；四项 typecheck 通过；目标 lint 0 error；依赖检查通过；`git diff --check` 无输出。本次不改变 Electron 打包入口或原生依赖，不运行 build 和 SQLCipher 二进制探测。某项失败时只修复对应原因并复测该失败项，未受影响且已通过的检查不重复运行。

**完成后的提交**

最终验证通过后提交本模块全部代码、测试及验证中针对本模块发现的修复：

```powershell
git add -- packages/application/src/local-notes packages/application/src/errors.ts packages/application/src/index.ts packages/application/src/__tests__/local-notes-search-session.test.ts
git commit -m "feat(application): complete local note service"
```

若最终验证发现前六个模块的缺陷，只暂存实际修复文件并一并纳入这次集成收口提交；不得创建单独的“测试修复”或“最终验证”提交。

---

## 完成标准

- `ProfileManager.localNotes` 是 Application 本地笔记的唯一公共入口，且不持有 Session 或数据库；
- 内容树无手动排序，默认 Folder 优先、组内 `CREATED_AT DESC`，支持三字段双方向稳定分页；
- 目录、笔记、标签、收藏、历史、回收站、批量和搜索覆盖调整后的 Shared 合约；
- 用户历史版本可命名、重命名和清空，保护版本永久可见但不可重命名；
- v3 迁移连续、可回滚且不修改 v1/v2；
- 回收站按完整删除组列表、恢复、永久删除和到期清理；
- 祖先与后代重复选择整体拒绝，所有批量操作原子；
- 锁定、切换和关闭不能泄漏旧 Profile 数据；
- 所有相关测试和必要静态检查通过；
- 每个完整模块只有一次对应提交；
- 没有实现或占位附件编排、Electron/Preload、Renderer、导出或同步能力。
