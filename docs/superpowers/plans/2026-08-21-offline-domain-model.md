# Notera 离线领域模型实施计划

> **执行约束：** 遵守仓库根目录 `AGENTS.md`。按完整功能模块实施，一模块一提交；测试先表达行为再实现，但不把红、绿、重构拆成独立计划步骤，不启用逐任务审核。

**目标：** 在 `packages/domain` 中实现当前离线阶段完整的不可变领域模型、状态转换规则和单元测试，为后续 SQLCipher、附件与应用编排提供稳定的纯 TypeScript API。

**架构：** 领域包按“基础值 → 实体模型 → 内容操作 → 历史与回收站 → 附件引用”自底向上实现。所有复杂操作接收调用方提供的 ID、时间和快照，先完整校验再返回不可变变更计划；包内不生成随机数、不读取时间、不访问数据库、文件系统、Node、Electron 或其他项目包。

**技术栈：** TypeScript 5、Jest 29、ts-jest、不可变普通对象、品牌类型

**规格：** `docs/superpowers/specs/2026-08-21-domain-model-design.md`

---

## 公共文件布局

```text
packages/domain/src/
  errors.ts
  ids.ts
  values.ts
  adf.ts
  models/
    vault.ts
    folder.ts
    note.ts
    tag.ts
    favorite.ts
    history.ts
    trash.ts
    attachment.ts
  operations/
    folders.ts
    notes.ts
    relations.ts
    copy.ts
    history.ts
    trash.ts
    attachments.ts
  __tests__/
    primitives.test.ts
    entities.test.ts
    content-operations.test.ts
    history-trash.test.ts
    attachments.test.ts
  index.ts
```

`src/index.ts` 是唯一公开入口。测试可以导入公开入口验证真实使用方式；只有测试构造辅助函数允许直接放在测试文件中，不增加生产测试工具。

## 功能模块 1：领域错误、ID、值对象与 ADF

**涉及文件：**

- 新增：`packages/domain/src/errors.ts`
- 新增：`packages/domain/src/ids.ts`
- 新增：`packages/domain/src/values.ts`
- 新增：`packages/domain/src/adf.ts`
- 新增：`packages/domain/src/__tests__/primitives.test.ts`
- 修改：`packages/domain/src/index.ts`
- 修改：`packages/domain/tsconfig.json`

**功能逻辑：**

- `errors.ts` 定义 `DomainErrorCode`、`DomainError` 和内部断言辅助函数。`DomainError` 只暴露稳定 `code` 与不含用户内容的固定消息。
- `ids.ts` 使用唯一品牌类型定义规格中的九种 ID，并为每种 ID 导出命名解析函数，例如 `asVaultId`、`asFolderId`、`asNoteId`。只接受小写规范 UUID；错误输入统一抛出 `INVALID_ID`，消息不回显输入。
- `values.ts` 定义并验证 `Timestamp`、`SortOrder`、`ContentVersion`、`FolderName`、`TagName` 和 `AttachmentByteLength`。导出 `nextContentVersion` 与安全的时间加法函数；非安全整数、负数和溢出使用对应错误码。
- 目录名与标签名返回去除首尾空白后的不可变值；不增加未确认的长度上限。Note 标题继续使用普通字符串并允许为空。
- `adf.ts` 定义只读 `JsonValue`、`JsonObject` 和 `AdfDocument`，导出 `asAdfDocument`。验证 `doc`、版本 1、可选数组 `content`，递归拒绝 `undefined`、函数、类实例、循环引用与非有限数值。
- `tsconfig.json` 排除 `src/__tests__`，让包级类型检查只检查生产 API；测试仍由根 Jest/ts-jest 编译。
- `index.ts` 只重导出公共类型和函数，不导出内部断言辅助函数。

**单元测试：**

- 有效 UUID 被品牌化；大写、缺段、空值和非字符串得到 `INVALID_ID`，错误消息不含原值。
- 时间、排序、内容版本和附件大小覆盖 0、正常值、负数、非整数、`MAX_SAFE_INTEGER` 与溢出。
- 目录名/标签名正确去除空白并拒绝全空白。
- ADF 接受最小文档和嵌套 JSON，拒绝错误根类型、错误版本、非法 `content`、非有限数值和循环引用。
- 运行：`npm run test:unit -- --runInBand packages/domain/src/__tests__/primitives.test.ts`
- 预期：该测试文件全部通过。

**提交：** `feat(domain): add validated primitives`

## 功能模块 2：Vault 与离线实体模型

**涉及文件：**

- 新增：`packages/domain/src/models/vault.ts`
- 新增：`packages/domain/src/models/folder.ts`
- 新增：`packages/domain/src/models/note.ts`
- 新增：`packages/domain/src/models/tag.ts`
- 新增：`packages/domain/src/models/favorite.ts`
- 新增：`packages/domain/src/models/history.ts`
- 新增：`packages/domain/src/models/trash.ts`
- 新增：`packages/domain/src/models/attachment.ts`
- 新增：`packages/domain/src/__tests__/entities.test.ts`
- 修改：`packages/domain/src/index.ts`

**功能逻辑：**

- `vault.ts` 定义 `VaultIdentity { id, rootFolderId }` 与创建函数。
- `folder.ts` 定义 `RootFolder`/`RegularFolder` 可判别联合类型。Root 的 `parentId` 固定为 `null` 且无用户名称；Regular 必须有父目录、名称、排序和时间。
- `note.ts` 定义始终带 `folderId` 的 Note；`createNote` 创建新对象时把 `contentVersion` 固定为 1，`rehydrateNote` 供后续存储层从可信记录恢复大于 1 的合法版本，两者都执行相同单实体不变量校验。
- `tag.ts` 定义 Tag 与 `NoteTag`；`favorite.ts` 定义 Favorite。关系对象包含 Vault ID，后续操作据此检查跨 Vault 错误。
- `history.ts` 定义 `NoteVersion`、`USER | SYSTEM_PROTECTION` 和离线保护原因 `BEFORE_HISTORY_RESTORE | BEFORE_MIGRATION`。
- `trash.ts` 使用可判别联合类型定义 Note 与 Folder 的 Trash Entry，并记录原父目录、删除时间、到期时间。
- `attachment.ts` 定义 Attachment、五种离线本地状态，以及当前 Note、Note Version、Trash Entry 三类 Attachment Reference。Attachment 不保存引用计数、File Key、Manifest 或远端状态。
- 所有创建函数复制并冻结顶层对象，复用模块 1 的值对象，不接受调用方绕过不变量构造公共实体。
- `index.ts` 重导出实体类型与创建函数，但不公开可变内部结构。

**单元测试：**

- Root Folder 没有名称和父目录；Regular Folder 必须具有合法父目录。
- Note 创建时拥有 Folder ID、ADF 和 `contentVersion = 1`，空标题合法。
- Tag、NoteTag、Favorite、NoteVersion、Trash Entry 和 Attachment 拒绝跨字段非法值。
- Attachment 接受恰好 100 MB，拒绝 100 MB + 1 byte，并且类型中不存在远端/下载状态。
- 错误消息不回显标题、名称或附件名。
- 运行：`npm run test:unit -- --runInBand packages/domain/src/__tests__/entities.test.ts`
- 预期：该测试文件全部通过。

**提交：** `feat(domain): define offline entities`

## 功能模块 3：目录、笔记、标签、收藏与复制操作

**涉及文件：**

- 新增：`packages/domain/src/operations/folders.ts`
- 新增：`packages/domain/src/operations/notes.ts`
- 新增：`packages/domain/src/operations/relations.ts`
- 新增：`packages/domain/src/operations/copy.ts`
- 新增：`packages/domain/src/__tests__/content-operations.test.ts`
- 修改：`packages/domain/src/index.ts`

**功能逻辑：**

- `folders.ts` 实现目录重命名、移动与排序。移动函数接收完整 Folder 快照，验证目标存在、同 Vault、未形成自身/后代循环，并拒绝修改 Root。
- `notes.ts` 实现标题/ADF 更新、目录移动和排序。标题或 ADF 更新必须递增 `contentVersion`；目录和排序变化不得递增。
- `relations.ts` 实现 NoteTag 和 Favorite 的幂等添加/删除、批量输入去重及跨 Vault校验。关系排序变化不修改 Note。
- `copy.ts` 定义 `NoteCopyPlan` 和 `FolderTreeCopyPlan`：
  - Note copy 使用新 Note ID，当前内容版本重置为 1，复制标签和当前 Note 的附件引用，不复制历史、收藏或回收站状态；
  - Folder tree copy 接收完整 Folder、Note、NoteTag、Attachment Reference 快照及 Folder/Note 新 ID 映射，递归复制后代目录和当前 Note；
  - Folder copy 复制标签与当前 Note 附件引用，不复制 Note Version、Favorite 或 Trash Entry；
  - 新 ID 缺失、重复、与旧 ID 相同或映射到错误对象时抛出 `DUPLICATE_TARGET_ID` 或 `INVALID_ID`；
  - 先校验完整快照与映射，再返回计划，不产生部分结果。
- 所有返回实体和计划均为只读数据；函数不修改输入数组和对象。

**单元测试：**

- Root 不能重命名或移动；目录不能移动到自身或后代；合法跨层移动保留其他字段。
- 更新标题/ADF 正确递增内容版本并覆盖溢出；移动、排序、标签和收藏不递增。
- 标签与收藏重复添加/删除幂等，批量输入去重且拒绝跨 Vault。
- Note copy 的包含/排除语义正确，Attachment ID/Blob 继续复用。
- Folder tree copy 保留层级、复制当前 Note 与关系，并拒绝不完整或重复 ID 映射。
- 输入快照在所有操作后保持未修改。
- 运行：`npm run test:unit -- --runInBand packages/domain/src/__tests__/content-operations.test.ts`
- 预期：该测试文件全部通过。

**提交：** `feat(domain): implement content operations`

## 功能模块 4：永久历史与回收站规则

**涉及文件：**

- 新增：`packages/domain/src/operations/history.ts`
- 新增：`packages/domain/src/operations/trash.ts`
- 新增：`packages/domain/src/__tests__/history-trash.test.ts`
- 修改：`packages/domain/src/index.ts`

**功能逻辑：**

- `history.ts` 实现 `createUserVersion`、`createProtectionVersion` 和 `restoreNoteVersion`。
- 创建用户版本只返回当前完整快照，不修改 Note。
- 恢复历史必须验证 Note、Version、Vault 一致，并一次返回当前 Note 的保护版本和恢复后的 Note；恢复后的 Note 使用目标标题/ADF、递增 `contentVersion`、更新传入时间。
- `trash.ts` 使用固定 `30 * 24 * 60 * 60 * 1000` 毫秒计算到期时间，并在时间加法溢出时失败。
- Note 回收返回单对象计划；Folder 回收接收 Folder/Note 快照和每个对象的 Trash Entry ID 映射，返回完整子树计划并保留原层级。
- Root 不得进入回收站。恢复时原父目录有效则使用原位置；否则必须提供明确且有效的新目标，不能静默使用 Root。
- `now >= expiresAt` 视为到期并抛出 `TRASH_ENTRY_EXPIRED`。
- 到期清理和永久删除只返回候选对象；不删除附件、不访问数据库。

**单元测试：**

- 用户历史与系统保护历史类型和原因正确，普通创建历史不修改 Note。
- 恢复前保护点保存恢复前内容，恢复后的 `contentVersion` 只递增一次。
- 错误 Note/Version/Vault 组合得到 `VERSION_NOTE_MISMATCH` 或 `VAULT_MISMATCH`。
- 回收站覆盖 30 天前、恰好到期、到期后和时间溢出。
- Folder 子树回收包含全部后代 Folder/Note，保留原父子关系并拒绝 Root。
- 恢复覆盖原父目录有效、已删除、仍在回收站和显式新目标四种情况。
- 运行：`npm run test:unit -- --runInBand packages/domain/src/__tests__/history-trash.test.ts`
- 预期：该测试文件全部通过。

**提交：** `feat(domain): implement history and trash rules`

## 功能模块 5：附件引用与 GC 资格

**涉及文件：**

- 新增：`packages/domain/src/operations/attachments.ts`
- 新增：`packages/domain/src/__tests__/attachments.test.ts`
- 修改：`packages/domain/src/index.ts`

**功能逻辑：**

- 实现按 Attachment ID 和 Vault ID 过滤的引用查询与计数，支持当前 Note、Note Version 和 Trash Entry 三种来源。
- 实现引用添加/删除的幂等操作，拒绝跨 Vault 引用；不得在 Attachment 上缓存引用计数。
- 实现复制当前 Note 引用：只替换引用所有者 Note ID，复用 Attachment ID/Blob，不复制历史或 Trash 引用。
- 实现 `markAttachmentGcPending`：只有实时引用数为零时返回状态为 `GC_PENDING` 的新 Attachment；仍被引用时抛出 `ATTACHMENT_STILL_REFERENCED`。
- 已处于 `GC_PENDING` 时重复标记保持幂等；任何函数都不删除 Blob、File Key 或 Manifest。

**单元测试：**

- 三种引用来源均被正确计数，不同 Attachment/Vault 不互相污染。
- 重复添加/删除引用幂等，跨 Vault 引用被拒绝。
- Note copy 只复制当前 Note 引用并复用同一 Attachment。
- 零引用可以进入 `GC_PENDING`，存在任一历史或回收站引用时被拒绝。
- 操作不修改输入 Attachment 或引用数组。
- 运行：`npm run test:unit -- --runInBand packages/domain/src/__tests__/attachments.test.ts`
- 预期：该测试文件全部通过。

**提交：** `feat(domain): implement attachment reference rules`

## 最终验证

全部五个功能模块提交后只运行一次：

```powershell
npm run test:unit -- --runInBand packages/domain
npm run typecheck --workspace @notera/domain
npm run check:deps
npm run lint
```

预期结果：

- 五个 domain 测试文件全部通过；
- `@notera/domain` 类型检查通过；
- domain 仍为零项目内依赖且无循环；
- ESLint 无错误；
- `git status --short` 只保留用户实施前已有的未跟踪文件，不出现测试或构建生成物。

## 完成标准

- 规格中的所有离线 ID、值对象、实体、状态转换、错误码和测试均有对应实现；
- 复杂操作全部先校验再返回完整不可变计划；
- Root、目录循环、内容版本、复制、历史保护、30 天回收和附件引用规则可独立单测；
- `packages/domain` 不导入 Node、Electron、数据库、文件系统或其他项目包；
- 不包含同步 Revision、冲突、Outbox、Tombstone 或远端附件占位代码。
