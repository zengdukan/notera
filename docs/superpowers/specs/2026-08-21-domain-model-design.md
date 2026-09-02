# Notera 离线领域模型设计

- 状态：已确认设计，待书面审核
- 日期：2026-08-21
- 所属模块：`packages/domain`
- 上位设计：`docs/superpowers/specs/2026-08-21-notera-overall-architecture-design.md`

## 1. 目标与边界

本规格定义当前离线阶段完整的纯领域层，包括类型化 ID、值对象、目录、笔记、标签、收藏、永久历史、回收站、附件元数据与引用，以及这些对象的状态转换规则。

`domain` 只回答以下问题：

- 一个领域对象是否合法；
- 一次状态转换是否允许；
- 合法操作会产生哪些不可变的新状态；
- 哪些对象必须在同一个上层事务中一起变更。

`domain` 不生成 UUID、不读取系统时间、不访问数据库或文件系统，不依赖 Electron、Node、Atlaskit、SQLCipher、密码学库或其他项目内包。调用方必须显式传入新 ID、当前时间和操作所需的完整领域快照。

本阶段不定义 Repository、Crypto、Attachment Store 等端口，也不实现同步 Revision、Device ID、冲突、Tombstone、Outbox、远端附件状态或下载状态。

## 2. 建模方式

领域模型采用不可变普通 TypeScript 数据和纯函数：

- 实体和值对象使用 `Readonly` 类型；
- 创建、移动、复制、回收、恢复和版本操作返回新对象或明确的变更计划；
- 不在实体上保存服务、连接、回调或延迟加载器；
- 预期业务失败抛出包含稳定错误码的 `DomainError`；
- 错误消息不得包含标题、正文、ADF、目录名、标签名、附件名或其他用户内容。

不采用可变领域类，避免数据库记录、IPC DTO 与类实例之间产生额外生命周期和序列化转换。事务原子性不由领域函数模拟，而由 `application` 编排并由 `storage-sqlcipher` 保证。

## 3. 基础类型

### 3.1 类型化 ID

领域层定义以下品牌字符串类型：

- `VaultId`
- `LocalProfileId`
- `FolderId`
- `NoteId`
- `TagId`
- `NoteVersionId`
- `AttachmentId`
- `BlobId`
- `TrashEntryId`

所有 ID 使用规范 UUID 字符串表示。领域层只提供解析和校验函数，不提供随机生成函数。空值、非 UUID、非规范格式统一返回 `INVALID_ID`。

当前阶段不定义 `RevisionId`、`DeviceId` 或任何同步对象 ID。

### 3.2 时间与排序

领域时间使用非负安全整数的 Unix 毫秒时间戳，不使用可变 `Date` 对象。调用方负责取得当前时间；领域函数只比较、相加和校验。

排序值使用非负安全整数。批量重排由调用方提供最终排序值，领域层验证重复对象与非法数值，不决定 UI 的拖拽算法。

### 3.3 名称与标题

- 普通目录名和标签名去除首尾空白后必须非空；
- 根目录不使用用户可见名称；
- 笔记标题允许为空，由界面决定如何显示“无标题”；
- 本阶段不引入未经产品确认的名称长度上限；
- 错误对象只返回 `INVALID_NAME`，不回显原值。

### 3.4 ADF 文档

领域层定义只读 JSON 值类型和最小 `AdfDocument` 类型，不依赖 Atlaskit。文档必须满足：

- 根节点是对象；
- `type` 为 `doc`；
- `version` 为 `1`；
- `content` 缺省或为只读数组；
- 整棵树只能包含 JSON 可表示的值，不接受函数、类实例、`undefined`、循环引用或非有限数值。

完整 Atlassian schema 校验属于 Renderer 编辑器适配和 IPC 输入校验；领域层只保证可持久化的基础 ADF 结构。

## 4. Vault 与隐藏根目录

每个 Vault 创建时必须同时创建一个隐藏根目录。Vault 领域身份至少包含 `VaultId` 与 `rootFolderId`。

目录使用可判别联合类型：

- `RootFolder`：`kind` 为 `ROOT`，`parentId` 为 `null`，没有用户可见名称；
- `RegularFolder`：`kind` 为 `REGULAR`，必须拥有 `parentId` 和合法目录名。

隐藏根目录不在普通目录列表中显示，并且不可重命名、移动、复制、删除或进入回收站。界面中的顶层目录和顶层笔记都以隐藏根目录为父目录，因此普通目录和笔记永远不使用 `null` 表示“顶层”。

## 5. 内容模型

### 5.1 目录

普通目录包含 ID、Vault ID、父目录 ID、名称、排序值、创建时间和更新时间。

目录移动必须满足：

- 源目录和目标父目录属于同一 Vault；
- 目标父目录存在且未在回收站中；
- 源目录不是根目录；
- 目标父目录不是源目录本身或其任一后代；
- 新排序值合法。

领域函数接收目录关系快照检查祖先链，不通过 Repository 查询。

### 5.2 笔记

笔记包含 ID、Vault ID、Folder ID、标题、ADF、当前本地 `contentVersion`、排序值、创建时间和更新时间。

笔记始终属于一个有效目录。修改标题或 ADF 时递增 `contentVersion`；移动目录、改变排序、标签、收藏或附件元数据不递增。

`contentVersion` 是从 1 开始的本地单调递增安全整数，用于保存并发判断和 FTS 漂移检测。它不是用户历史版本，也不是未来的同步 Revision。达到安全整数上限时返回 `CONTENT_VERSION_OVERFLOW`，不得回绕。

### 5.3 标签与收藏

标签包含 ID、Vault ID、名称、创建时间和更新时间。当前阶段不增加颜色等未确认属性。

`NoteTag` 表示 Note 与 Tag 的多对多关系；重复添加是幂等操作，批量输入先去重。Note 与 Tag 必须属于同一 Vault。

`Favorite` 表示 Note 的收藏关系及排序值。收藏是智能视图，不复制 Note；重复收藏或取消未收藏对象均按幂等操作处理。

## 6. 永久历史

`NoteVersion` 保存完整标题和 ADF 快照，并包含：

- Note Version ID 与 Note ID；
- Vault ID；
- 来源 `contentVersion`；
- 类型 `USER` 或 `SYSTEM_PROTECTION`；
- 创建时间；
- 系统保护原因。

当前离线阶段的系统保护原因包括历史恢复前保护和数据迁移前保护；同步冲突原因延期。

普通自动保存只更新当前 Note，不创建 `NoteVersion`。用户明确保存版本时创建 `USER` 快照，不改变当前 Note。

恢复历史必须在一个领域操作中返回：

1. 当前 Note 内容的 `SYSTEM_PROTECTION` 快照；
2. 使用目标历史标题和 ADF 的新 Note 状态；
3. 递增后的 `contentVersion` 和更新时间。

目标版本必须属于当前 Note 和 Vault，否则返回 `VERSION_NOTE_MISMATCH`。实际写入必须由上层在单个数据库事务中提交。

## 7. 复制与批量操作

### 7.1 笔记复制

复制笔记使用调用方提供的新 Note ID 和时间，复制当前标题、ADF、标签关系及附件引用，并把 `contentVersion` 初始化为 1。复制结果不包含源笔记的历史、收藏或回收站状态。

附件复制只新增对同一 Attachment/Blob 的引用，不复制二进制文件。

### 7.2 目录子树复制

目录复制递归复制选中目录、全部后代目录和当前笔记。调用方必须为每个新目录、Note 及必要关系提供无重复的新 ID 映射。

复制内容包括目录层级、当前笔记、标签关系和附件引用；不复制历史、收藏或回收站状态。整个复制计划必须在生成前完整校验，任一 ID 映射、父子关系或 Vault 关系非法时不返回部分结果。

### 7.3 批量操作

批量移动、加标签、复制和进入回收站先对输入 ID 去重，再验证全部对象。领域层返回完整变更计划；上层必须在单个 SQLCipher 事务中提交，不允许部分成功。

## 8. 回收站

`TrashEntry` 支持 Note 和 Folder，记录 Trash Entry ID、Vault ID、对象类型与 ID、删除时显示名、原父目录、删除时间和到期时间。删除时显示名是回收站展示和路径重建的稳定快照；底层对象因名称冲突使用内部占位名时，不得向界面暴露该内部名称。

到期时间固定为删除时间加 30 天。边界比较使用 `now >= expiresAt` 视为已到期。时间加法溢出返回领域错误。

### 8.1 删除分组与列表

每次删除操作形成独立删除组。单独删除 Note 或 Folder 时以自身 Trash Entry 为组根；同一次目录删除产生的目录与当前 Note 的 Trash Entry 共享该目录根条目，附件引用跟随对应 Note Trash Entry 的生命周期。批量删除中的每个独立目标分别形成删除组，删除时间相同不能作为合并分组的依据。

删除普通笔记时生成 Note 回收计划。删除普通目录时一次遍历活动子树并生成完整回收计划，保留原有父子层级和每个对象的原位置；根目录永远不能进入回收站。已经属于其他删除组的后代必须跳过，不能重复创建 Trash Entry，也不能因唯一约束导致整个目录删除返回 `SAVE_FAILED`。

回收站列表只展示每个删除组的根条目。因此先删除 `/today/top/数学`、再删除 `/today/top` 后，`数学` 和 `top` 必须同时显示并可独立操作；目录层级不能被误判为同一次删除。列表路径按当前可解析的原父目录链生成，格式与 Recent 一致；目录条目只显示父目录路径，不包含自身名称。

### 8.2 Windows 式直接恢复

恢复规则：

- 原父目录仍有效时恢复到原位置；
- 原父目录仍在回收站、但原目录链可解析时，从最近的活动祖先开始自动重建缺失路径，不要求用户选择目标目录；
- 自动重建路径与活动同名目录相遇时复用该目录。恢复 Folder 删除组时递归合并同名目录，并把该组的目录和 Note 恢复到合并后的活动目录；
- 路径重建或目录合并只处理当前删除组。其他时间单独删除的 Note 或 Folder 继续留在回收站，并将其恢复位置更新到重建或合并后的对应目录；
- 例如先删除 `/today/top/数学`、再删除 `/today/top`：恢复 `数学` 时自动新建 `/today/top` 且旧 `top` 组仍在回收站；随后恢复旧 `top` 时直接合并进现有 `/today/top`，不弹出目录选择器；
- 仅当原路径既不可用也无法重建时，调用方才需要提供有效的新目标目录；
- 不得静默恢复到根目录；
- Folder 不得恢复到自身或后代中；
- 已到期条目不能通过普通恢复流程恢复，返回 `TRASH_ENTRY_EXPIRED`。

路径重建、同名目录合并、Trash Entry 删除、Note 搜索索引恢复和附件引用恢复必须在同一个 SQLCipher 事务中提交，不允许出现部分恢复。

### 8.3 永久删除与到期清理

永久删除和到期清理严格以删除组为边界，不得吸收原目录物理子树中的其他删除组。删除父目录组时，独立 Note 或 Folder 继续保留在回收站，其底层对象和 `originalParentId` 回退到被删目录最近的有效父目录；例如永久删除旧 `top` 后，独立的 `数学` 回退到 `/today`，之后可直接恢复。

永久删除与到期清理只在领域层产生候选删除计划。数据库删除、附件引用复核、独立条目重定位和事务提交由上层负责。

## 9. 离线附件领域模型

`Attachment` 定义 Attachment ID、Blob ID、Vault ID、文件名、MIME、明文大小、本地状态、创建时间和更新时间。单附件明文大小不得超过 100 MB。

当前允许的本地状态：

- `IMPORTING`
- `READY`
- `MISSING`
- `CORRUPT`
- `GC_PENDING`

不定义 `REMOTE_ONLY`、`DOWNLOADING` 或任何上传、远端可用性状态。

`AttachmentReference` 使用可判别联合类型表达引用来源：

- 当前 Note；
- 永久 Note Version；
- Trash Entry。

同步冲突引用延期。引用集合是唯一权威来源，领域层实时计算引用数，不在 Attachment 中保存可漂移的 `referenceCount`。

Attachment 只有在引用数为零时才能进入 `GC_PENDING`；仍有引用时返回 `ATTACHMENT_STILL_REFERENCED`。文件删除、File Key 销毁、Manifest 与加密块处理属于 `attachments` 包，不属于本规格。

## 10. 领域操作输出

简单操作返回单个新实体；涉及多对象的操作返回命名明确的不可变计划，例如：

- 目录移动结果；
- Note 复制计划；
- 目录子树复制计划；
- 历史恢复计划；
- 回收与恢复计划；
- 附件 GC 资格结果。

计划只包含待新增、待更新、待删除对象和关系，不包含 SQL、Repository、事务对象或副作用回调。所有复杂操作必须先完成全量校验，再构造计划。

## 11. 错误模型

所有预期领域失败使用 `DomainError`，至少包含稳定 `code`。首批错误码包括：

- `INVALID_ID`
- `INVALID_TIMESTAMP`
- `INVALID_SORT_ORDER`
- `INVALID_NAME`
- `INVALID_ADF_DOCUMENT`
- `ROOT_FOLDER_IMMUTABLE`
- `FOLDER_CYCLE`
- `PARENT_FOLDER_INVALID`
- `VAULT_MISMATCH`
- `CONTENT_VERSION_OVERFLOW`
- `VERSION_NOTE_MISMATCH`
- `TRASH_ENTRY_EXPIRED`
- `ATTACHMENT_TOO_LARGE`
- `ATTACHMENT_STILL_REFERENCED`
- `DUPLICATE_TARGET_ID`

错误消息只描述规则，不包含用户数据。上层负责把领域错误映射为应用错误和 IPC 响应。

## 12. 测试策略

`packages/domain` 使用真实不可变数据进行单元测试，不使用数据库、文件系统、Electron 或服务 Mock。重点覆盖：

- UUID、时间戳、排序值、名称和 ADF 基础校验；
- 隐藏根目录不变量；
- 目录移动、自身/后代循环和跨 Vault 拒绝；
- Note 标题/ADF 更新与 `contentVersion` 递增、溢出；
- 标签、收藏和批量输入幂等去重；
- Note 与目录子树复制的包含/排除语义；
- 用户历史、系统保护历史和恢复前保护点；
- 回收站 30 天前、恰好到期和到期后的边界；
- 同一次目录删除的内容共享删除组，不同删除操作即使时间相同也保持独立；
- 已单独删除后代时删除父目录不会重复入站或返回 `SAVE_FAILED`；
- 原父目录有效时直接恢复，原父目录仍在回收站时自动重建完整路径；
- 恢复旧父目录时与已重建的同名活动路径直接合并，不要求用户选择目录；
- 父目录恢复、合并、永久删除和到期清理均不连带处理独立删除组；
- 独立条目在父目录合并后更新到合并路径，在父目录永久删除后回退到最近有效父目录；
- 附件 100 MB 边界、引用来源、引用计数和 `GC_PENDING` 条件；
- 错误码稳定且错误消息不回显测试中的敏感值。

实施期间按功能模块运行对应 domain 单元测试。全部完成后只统一运行一次 domain 测试全集、domain 类型检查、项目依赖边界和 Lint。

## 13. 验收标准

- `domain` 没有项目内依赖、Node、Electron、数据库或文件系统引用；
- 所有模型均为不可变普通数据；
- 所有复杂操作在返回计划前完成全量校验；
- 隐藏根目录保证 Note 永远具有 Folder ID；
- 当前内容版本、用户历史和未来同步 Revision 三者概念分离；
- 目录子树、历史恢复、回收站与附件引用规则都有单元测试；
- 不存在同步、冲突、Outbox、Tombstone 或远端附件占位实现。
