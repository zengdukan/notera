# Notera 离线本地笔记用例设计

- 状态：已确认
- 日期：2026-08-22
- 实施层：`@notera/application`，以及为本设计所需的 Domain、Storage 和 Shared 合约调整
- 前置能力：离线 Domain、Crypto、IPC 合约、SQLCipher、加密 Blob Store、Profile 生命周期

## 1. 目标

在已解锁的 `ProfileSession` 上提供完整的本地笔记业务入口，包括目录、笔记、标签、收藏、历史、回收站、批量操作和搜索。公共入口保持集中，内部按功能模块隔离；所有写操作遵守领域规则和 SQLCipher 事务边界，返回结构与本阶段更新后的 `src/shared/ipc` 合约一致。

本设计完成后，后续 Electron Main 可以把 `LocalNotesService` 直接适配到业务 IPC，而不需要重新实现领域规则、事务编排或 DTO 组合。

## 2. 范围

### 2.1 包含

- `ProfileManager.localNotes` 与 `LocalNotesService` 公共接口；
- 目录创建、重命名、移动、回收和子内容分页；
- Folder 优先的自动排序，支持创建时间、修改时间和标题的升序或降序；
- 笔记创建、详情、乐观并发自动保存、移动、复制和最近使用；
- 标签和收藏关系；
- 可命名的用户历史版本、系统保护版本、比较、恢复和复制；
- 以删除子树为单位的回收站列表、恢复、永久删除和到期清理；
- 原子批量移动、复制、标签和回收；
- 全 Vault 与目录子树搜索；
- 所需的窄幅 Domain、Storage、Schema 和 Shared IPC 调整；
- 功能逻辑单元测试与必要的 Storage 集成测试。

### 2.2 不包含

- 附件导入、附件引用事务、Blob 失败补偿、预览、读取或垃圾回收；
- Electron Main、Preload、IPC handler 注册或应用生命周期调度；
- Renderer、Atlassian Editor、界面防抖或本地化文案；
- 导出；
- 同步协议、同步引擎、云端 API、同步 Outbox、同步冲突和远端附件状态；
- 为上述延期能力创建占位实现。

普通笔记复制、目录树复制和历史复制在本阶段只处理数据库正文及标签语义，不修改附件引用。附件引用协调由总体实施顺序中的下一项“Application：附件编排”补充。

## 3. 总体架构

### 3.1 公共入口

`ProfileManager` 新增只读属性：

```ts
readonly localNotes: LocalNotesService;
```

`LocalNotesService` 是稳定对象，但不持有 `ProfileSession`、`VaultDatabase`、Attachment Store 或任何密钥。每次调用都从 `ProfileManager` 获取当前 Session，并立即通过 `ProfileSession.run()` 执行。

因此：

- 未解锁时返回 `PROFILE_LOCKED`；
- Profile 切换后，同一个 Service 自动作用于新 Profile；
- 已登记到旧 Session 的操作在关闭完成前 settle；关闭期间的新操作被拒绝；
- Service 不跨调用缓存实体、Repository、分页 Cursor 或 Profile 数据。

### 3.2 内部模块

```text
packages/application/src/local-notes/
  service.ts       # Facade、当前 Session 获取与公共方法
  types.ts         # Application 输入输出 DTO
  folders.ts       # 目录与混合内容树
  notes.ts         # 笔记与最近使用
  tags.ts          # 标签关系
  favorites.ts     # 收藏关系与独立排序
  history.ts       # 永久历史与保护版本
  trash.ts         # 删除组、恢复与清理
  batch.ts         # 原子批量操作
  search.ts        # 搜索范围与结果映射
  mapping.ts       # Domain/Storage 到 Application DTO
  errors.ts        # Domain/Storage 错误映射
```

`service.ts` 只负责公共 Facade 和 Session 门，不集中实现各功能逻辑。每个功能模块只接收本次调用需要的窄接口、时钟和 ID 生成器。生产环境使用系统时钟和随机 UUID，测试注入确定值。

`packages/application/src/index.ts` 只导出 `LocalNotesService`、必要 DTO 与现有 Profile API，不公开内部模块、Repository 或 Session。

### 3.3 依赖方向与 DTO

Application 定义自己的输入输出 DTO，结构严格匹配 Shared IPC，但不导入 `src/shared`：

```text
src/main → src/shared + packages/application
packages/application → domain + storage-sqlcipher + crypto + attachments
```

Main 后续只做输入输出 schema 校验、方法调用和 Application 错误到 IPC 错误的适配。

## 4. 内容树与排序

### 4.1 取消手动排序

Folder 与 Note 不支持用户手动排序。直接删除以下能力及其代码和测试，不保留兼容层：

- `contentTree.reorderEntry` IPC 合约；
- Application 对应方法；
- 内容树手动重排逻辑。

Folder 和 Note 的 IPC 摘要不再包含 `sortOrder`。Domain 与现有数据库中的 `sort_order` 暂时作为内部兼容字段保留，但不参与内容树业务排序。已发布的不可变 Schema 文件不修改，也不为删除一个无行为影响的内部列重建数据表。

收藏的 `favoriteSortOrder` 和 `favorite.reorder` 是独立语义，继续保留。

### 4.2 查询参数

`contentTree.listChildren` 请求新增可选排序对象：

```ts
sort?: {
  field: 'CREATED_AT' | 'UPDATED_AT' | 'TITLE';
  direction: 'ASC' | 'DESC';
}
```

未提供时默认：

```ts
{ field: 'CREATED_AT', direction: 'DESC' }
```

### 4.3 排序规则

排序只作用于指定父目录的有效直接子项：

1. Folder 始终排在 Note 前；
2. Folder 和 Note 各自在组内按所选字段和方向排序；
3. 排序字段相同时最终按实体 ID 升序，保证结果和分页稳定；
4. 标题首版使用 SQLite `NOCASE` 比较：ASCII 英文不区分大小写，其他 Unicode 字符保持确定性编码顺序；
5. Cursor 指纹包含父目录 ID、排序字段和方向，不能跨父目录或排序方式复用。

`listRecent` 固定按 Note 修改时间降序，不受内容树排序参数影响。

### 4.4 目录行为

- `listChildren` 使用 Storage 的混合分页查询，并把 Folder 和 Note 映射为对应摘要；
- Folder 的 `hasChildren` 只统计有效直接子内容，不统计回收站内容；
- 创建目录生成新 ID 和时间戳，名称经 Domain 规范化；
- 重命名更新名称和修改时间；
- 移动复用 Domain 的父目录存在、Vault 一致和目录环校验，并更新修改时间；
- 根目录不能重命名、移动或移入回收站；
- 创建、移动和复制不计算手动排序位置。

## 5. 笔记

- 新建笔记使用空 ADF、可选标题、`contentVersion = 1` 及当前时间；
- `get` 返回当前标题、ADF、创建时间及当前有效标签；
- `saveDraft` 使用 `expectedContentVersion` 乐观并发保护，成功后内容版本加一；
- 标题、ADF、规范化搜索文本和 FTS 在同一 Storage 事务更新；
- 普通自动保存不创建历史版本；
- 移动验证目标目录并更新 Note 修改时间；
- 普通复制创建新 ID、版本和时间戳，保留标题、ADF 与当前标签；
- `listRecent` 使用 Storage 稳定 Cursor 分页并映射 Note 摘要；
- 本阶段所有笔记操作均不读写附件引用。

## 6. 标签与收藏

### 6.1 标签

- 创建与重命名去除名称首尾空白并依赖 Storage 保证业务唯一；
- 删除标签及其全部 NoteTag 关系在同一事务完成；
- 添加和移除 NoteTag 都是幂等操作；
- 普通查询和关系变更不接受回收站 Note 作为有效目标；
- Note 详情返回稳定排序的当前标签。

### 6.2 收藏

- 添加与移除收藏为幂等操作；
- 收藏继续拥有独立的手动顺序；
- 收藏列表把 Favorite 与当前有效 Note 组合为带 `favoriteSortOrder` 的摘要；
- 已进入回收站的 Note 不出现在收藏列表中；
- 收藏重排只修改 Favorite 排序，不修改 Note 的创建时间或修改时间。

## 7. 历史版本

### 7.1 版本种类

用户版本和系统保护版本都属于不可变、永久保留的历史快照：

- `USER`：用户显式保存；
- `SYSTEM_PROTECTION`：高风险操作前由系统创建；
- 普通自动保存不创建历史版本。

两类版本都可列出、查看、比较、恢复和复制。历史列表同时展示两类版本，并通过稳定类型和保护原因让 Renderer 后续生成本地化标签。

### 7.2 用户版本名称

用户版本新增独立的可选 `versionName`，不复用快照中的 Note 标题：

- 最多 100 个 Unicode 字符；
- 非空字符串去除首尾空白，空名称无效；
- 创建用户版本时可以省略；
- 创建后可以重命名；传入 `null` 表示清空；
- 重命名只修改版本元数据，不修改快照标题、ADF、创建时间、来源内容版本或内容哈希；
- 系统保护版本不允许用户重命名。

Shared IPC 调整如下：

- `history.createPermanent` 请求增加可选 `versionName`；
- 历史摘要增加可空 `versionName` 与可判别的保护原因；
- 新增 `history.rename`，输入 Note ID、Version ID 和新名称或 `null`，返回更新后的历史摘要。

### 7.3 历史操作

- `createPermanent` 把当前 Note 保存为 `USER` 版本；
- `get`、`list` 和 `compare` 验证 Version 属于指定 Note；
- `compare` 返回左右完整快照，不在 Application 计算文本差异；
- `restore` 先为当前内容创建 `BEFORE_HISTORY_RESTORE` 保护版本，再恢复目标快照；
- 保护版本、当前 Note、FTS 和内容版本递增在同一事务提交；
- `restore` 使用 `expectedContentVersion` 防止覆盖并发自动保存；
- `history.copy` 用所选历史版本的标题和 ADF 创建新 Note，不复制源 Note 的当前标签；
- 本阶段不协调历史附件引用。

## 8. 回收站

### 8.1 删除组

回收目录时，为该目录子树中的全部 Folder 和 Note 一次性生成 TrashEntry，并使用同一个删除时间和 30 天到期时间。用户选中的顶层 Note 或 Folder 是删除组入口；内部子项 Entry 不作为独立入口暴露。

回收站列表只返回删除组的顶层入口：

- `displayName` 从仍保留的 Folder 或 Note 实体读取；
- `originalParentAvailable` 根据当前有效目录状态计算；
- 内部子项不平铺展示；
- Cursor 只沿顶层入口分页。

### 8.2 恢复和删除

- 恢复顶层入口时恢复整个删除组；
- 顶层对象的原父目录仍有效时优先恢复原位置；
- 原父目录不可用时必须提供显式目标；
- 删除组内部对象恢复原有层级；
- 永久删除以完整删除组为单位原子清理数据库业务数据，并返回实际删除对象数；
- `purgeExpiredTrash()` 一次清理所有到期的完整删除组，不留下半个子树；
- Application 只提供显式清理用例，后续 Main 负责在解锁后和定时任务中调用；
- 本阶段不执行 Blob 引用归零或文件 GC。

## 9. 批量操作

- IPC 上限保持现有约束；
- 输入 ID 必须唯一，全部目标必须存在、有效且属于当前 Vault；
- 同时选择祖先 Folder 及其任意后代时，整个操作返回 `INVALID_ENTITY_STATE`；
- 批量移动先对完整目标集执行目录环校验，再统一提交；
- 批量复制为全部新 Folder 和 Note 预生成唯一 ID，保留目录层级和 Note 标签；
- 批量回收为内部全部对象生成 Entry，但只返回与用户顶层选择一一对应的 `trashEntryIds`；
- 批量添加或移除标签对 Note 与 Tag 的完整组合执行幂等变更；
- 移动、复制、标签和回收均使用单个 SQLCipher 事务，全有或全无。

## 10. 搜索

- 未提供 Folder ID 时搜索整个 Vault；
- 提供 Folder ID 时搜索该目录及任意深度后代；
- Application 复用 Storage 的规范化、trigram、短查询回退、相关度、摘录、高亮和分页能力；
- Application 不记录搜索词、不缓存结果，也不负责 Renderer 防抖；
- Cursor 与规范化查询及目录范围绑定，跨查询或跨范围使用返回 `INVALID_CURSOR`；
- 输出标题、摘录、修改时间和有序高亮范围，匹配 Shared IPC。

## 11. 错误处理

Local Notes 公共边界统一把 DomainError 和 StorageError 映射为不含敏感内容的 ApplicationError。

可直接保留的稳定业务码包括：

- `PROFILE_LOCKED`、`ENTITY_NOT_FOUND`、`INVALID_NAME`；
- `ROOT_FOLDER_IMMUTABLE`、`FOLDER_CYCLE`、`PARENT_FOLDER_INVALID`；
- `CONTENT_VERSION_CONFLICT`、`CONTENT_VERSION_OVERFLOW`；
- `VERSION_NOTE_MISMATCH`；
- `TRASH_ENTRY_EXPIRED`、`TRASH_TARGET_REQUIRED`；
- `DUPLICATE_TARGET_ID`、`INVALID_ENTITY_STATE`、`INVALID_CURSOR`；
- `DISK_FULL`。

无法进一步分类的写入错误映射为 `SAVE_FAILED`；未知读取错误映射为 `OPERATION_FAILED`，由后续 Main 映射为 `IPC_OPERATION_FAILED`。数据库关闭竞态由 Session 门收敛为 `PROFILE_LOCKED`。

错误对象和日志不得包含标题、正文、标签、搜索词、ADF、Version Name、数据库路径或完整输入。

## 12. 并发与事务

- 每个调用通过 `ProfileSession.run()` 登记；
- Session 关闭拒绝新调用，并等待已登记操作 settle；
- 数据库事务回调保持同步，不返回 Promise；
- 草稿保存和历史恢复使用乐观内容版本；
- 其他写操作在事务内读取或重新验证关键实体后提交；
- ID 和时间可在事务前生成，失败时未使用的值不产生持久状态；
- Service 不缓存业务对象，Profile 切换后不会读取旧 Profile 状态。

## 13. Storage 与 Schema 调整

1. 混合内容查询接受排序字段和方向，执行 Folder 优先、组内字段排序和 ID 兜底；
2. 内容 Cursor 指纹加入父目录、字段和方向；
3. 为回收站增加顶层删除组分页、整组读取、恢复和删除所需的窄接口；
4. 新增 Schema v3，在 `note_versions` 增加可空 `version_name`；
5. v3 是从 v2 到 v3 的独立生产迁移，已发布的 v1/v2 文件保持不可变；
6. History Reader/Writer 增加用户版本名称读取和重命名；
7. 完整性检查验证用户版本名称和保护版本不可命名的不变量；
8. `CURRENT_SCHEMA_VERSION` 升为 3，新建与打开数据库继续通过同一迁移链到达当前版本。

## 14. 测试策略

每个功能模块把实现和相关测试放在同一个实施任务中。模块测试使用窄接口、确定时钟和确定 ID；需要验证真实 SQL、Cursor 或迁移时才使用 SQLCipher 集成测试。

### 14.1 Application 单元测试

- Service：锁定拒绝、Profile 切换、旧引用安全和关闭等待；
- 内容树：Folder 优先、三字段、双方向、默认 `CREATED_AT DESC`、标题比较、ID 兜底、Cursor 隔离和 `hasChildren`；
- 笔记：创建、详情、自动保存、版本冲突、移动、复制和最近使用；
- 标签与收藏：幂等关系、失效目标、回收站排除和收藏独立排序；
- 历史：用户版本创建与命名、重命名与清空、保护版本拒绝重命名、比较、保护性恢复和无标签复制；
- 回收站：整组回收、顶层分页、原位置与指定位置恢复、到期清理和永久删除；
- 批量：重复 ID、祖先/后代拒绝、环检测、全有或全无及返回顶层 Entry ID；
- 搜索：Vault/目录范围、结果映射、分页和 Cursor 错用；
- 错误：每个稳定 Domain/Storage 错误到 ApplicationError 的精确映射。

### 14.2 Storage 与 Shared 测试

- v2 到 v3、全新数据库到 v3、迁移回滚和不可变注册表；
- `version_name` 往返、清空、保护版本拒绝和完整性扫描；
- 内容排序 SQL、Folder 优先、全部方向、并列 ID 和 Cursor 指纹；
- 回收站顶层删除组读取及整组事务；
- Shared 合约删除 `reorderEntry`、移除内容摘要 `sortOrder`、增加内容排序参数和历史命名接口。

### 14.3 验证纪律

- 实施过程中只运行当前功能模块相关单元测试；
- 每完成一个完整、可独立测试的功能模块提交一次；
- 不为测试、实现或验证分别提交；
- 所有模块完成后只运行一次相关测试全集，并按实际改动运行必要的 typecheck、lint 和依赖检查；
- 验证失败时只修复和复测对应失败，不重复未受影响且已通过的检查。

## 15. 完成标准

- `ProfileManager.localNotes` 是本地笔记能力的唯一 Application 公共入口；
- 锁定和 Profile 切换不能泄漏或误用旧 Session；
- 内容树无手动排序，默认 Folder 优先且组内 `CREATED_AT DESC`，并支持三字段双方向稳定分页；
- 目录、笔记、标签、收藏、历史、回收站、批量和搜索覆盖现有及本设计调整后的 Shared 合约；
- 用户历史版本可命名、重命名和清空，保护版本永久可见但不可重命名；
- 高风险历史恢复前原子创建保护版本；
- 回收站以完整删除组展示、恢复、永久删除和到期清理；
- 祖先与后代重复选择被整体拒绝，所有批量操作原子；
- 所有错误稳定、无敏感内容，相关测试通过；
- 未实现或占位任何附件编排、Electron、Renderer、导出或同步能力。
