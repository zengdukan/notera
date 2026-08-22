# Notera 离线 Profile 生命周期设计

- 状态：已确认
- 日期：2026-08-22
- 所属阶段：`packages/application` 的 Profile 生命周期基础
- 前置模块：`packages/domain`、`packages/crypto`、`packages/storage-sqlcipher`、`packages/attachments`

## 1. 目标

本阶段实现离线桌面版本的 Profile 生命周期基础，作为后续本地笔记用例、附件业务编排和 Electron Main 装配的统一入口。

系统必须满足以下目标：

- 管理本机 Profile 索引、列表和显示名称缓存；
- 创建、解锁、锁定、切换、重命名和修改主密码；
- 从设备永久移除 Profile，不进入系统回收站；
- 同一时刻最多持有一个已解锁 `ProfileSession`；
- 锁定后关闭 SQLCipher 和附件资源，并清零 Session 持有的 Database Key 与 Vault Key；
- 创建、改密和删除在进程崩溃后能够确定性恢复，不留下不可解锁的中间状态；
- 只向 Electron Main 暴露业务级 Profile API，不泄露密钥、数据库、附件 Store 或真实路径。

## 2. 非目标

本阶段不实现：

- 目录、笔记、标签、收藏、历史、回收站、批量操作或搜索用例；
- 附件导入引用事务、Media Gateway、导出或附件垃圾回收编排；
- Electron Main、Preload、IPC handler、窗口、确认对话框或 Renderer；
- 系统锁屏、休眠和无操作超时监听；这些事件在 Main 装配阶段调用本阶段的 `lockProfile()`；
- 同步协议、同步引擎、云端 API、同步 Outbox、冲突、远端附件状态或 `application/sync`；
- Profile 备份、恢复密钥、主密码提示、主密码重置或客服恢复；
- Profile 数据导入、跨设备 Profile 目录复制或移动端专用抽象。

## 3. 架构与依赖边界

`@notera/application` 对外提供一个 `ProfileManager`。它是 Profile 生命周期的唯一编排者，Electron Main 后续只能调用其业务 API。

```text
未来 Electron Main
        │ 仅调用公开业务 API
        ▼
ProfileManager
├── 调用 ProfileCatalog
├── 调用 VaultMetaStore
├── 调用 Crypto / SQLCipher / Attachments 工厂
└── 创建并独占 ProfileSession
                    ├── 持有 Database Key / Vault Key
                    ├── 持有 VaultDatabase
                    └── 持有 AttachmentStore
```

依赖与调用规则如下：

- `ProfileManager` 是四个组件中唯一保存当前 `ProfileSession` 引用的对象；
- `ProfileCatalog` 和 `VaultMetaStore` 互不依赖，只管理各自文件，不打开数据库、不接触密钥和附件；
- `ProfileSession` 不读取 Catalog 或 `vault.meta`，也不反向调用 `ProfileManager`；
- `ProfileCatalog`、`VaultMetaStore` 和 `ProfileSession` 之间禁止直接互调，跨组件协调一律由 `ProfileManager` 完成；
- Electron Main 不直接操作 Catalog、Meta、数据库、附件 Store 或 Session 内部密钥；
- 内部只为 ID 与时间来源、原子文件操作、数据库工厂和附件 Store 工厂保留测试接缝，不建立通用依赖容器。

主要运行时调用链为：

| 操作 | 调用链 |
| --- | --- |
| 列出 Profile | `ProfileManager → ProfileCatalog` |
| 创建 Profile | `ProfileManager → Crypto → VaultMetaStore → SQLCipher/Attachments → ProfileSession → ProfileCatalog` |
| 解锁 Profile | `ProfileManager → ProfileCatalog → VaultMetaStore → Crypto → SQLCipher/Attachments → ProfileSession` |
| 锁定 Profile | `ProfileManager → ProfileSession.close()` |
| 切换 Profile | `ProfileManager → 当前 ProfileSession.close() → 目标 Profile 解锁链` |
| 重命名 | `ProfileManager → ProfileSession/VaultDatabase → ProfileCatalog` |
| 修改主密码 | `ProfileManager → Crypto → VaultMetaStore → ProfileSession/VaultDatabase` |
| 从设备移除 | `ProfileManager → 必要时 ProfileSession.close() → 隔离并删除 Profile 文件 → ProfileCatalog` |

## 4. 本地文件布局与路径安全

本阶段使用以下布局：

```text
app-data/
  profile-index.json
  profile-index.json.bak
  profiles/
    .deleting/
    <local-profile-id>/
      .creating
      vault.meta
      vault.meta.next
      vault.db
      blobs/
      staging/
```

`.creating` 和 `vault.meta.next` 只在事务式操作期间存在。`.deleting/` 只包含已经完成逻辑删除、等待物理清理的规范隔离目录。

所有公开 API 只接受规范 Local Profile ID，不接受数据库、Meta、附件或 Profile 的任意路径。内部路径只从应用启动时注入的可信 `appDataRoot` 和经过 Domain 校验的 ID 推导。扫描只处理根目录直接子项，不跟随符号链接、目录链接或重解析点。递归删除前必须再次确认真实目标位于规范 `.deleting` 根目录内，且名称符合内部删除条目格式。

## 5. ProfileCatalog

`ProfileCatalog` 管理 `profile-index.json`。索引只保存：

- 格式版本；
- Local Profile ID；
- 最近一次验证过的显示名称缓存；
- 稳定排序值；
- 最后使用时间。

索引不保存 Vault ID、邮箱、Token、密码、密钥、笔记、附件信息或当前解锁状态。`isCurrent` 由 `ProfileManager` 根据运行时 Session 计算，不持久化。

索引使用固定键顺序和 UTF-8 编码写入临时文件，刷新文件内容后原子替换正式文件，并保留上一份有效文件为 `.bak`。读取时严格校验版本、字段集合、ID、名称、时间、排序、重复项和数量上限。正式索引损坏时优先恢复备份；两者都不可用时，从路径与内容互相匹配的严格有效 `vault.meta` 重建 Local Profile ID。无法读取真实名称时使用稳定的 `Profile <ID前8位>` 占位名称，首次成功解锁后以 SQLCipher 内的真实名称修复缓存。

启动对账还执行以下规则：

- Catalog 有条目但规范 Profile 目录缺失：移除失效索引条目；
- Profile 目录含 `.creating` 且 Catalog 已有条目：视为已发布，保留 Profile 并清除标记；
- Profile 目录含 `.creating` 且 Catalog 无条目：视为未发布创建残留，安全删除该目录；
- 不含 `.creating`、Meta 严格有效且 Catalog 无条目：恢复为占位名称条目；
- `.deleting` 内的规范删除条目：重试永久删除，并保证 Catalog 不再包含对应 ID；
- 未知、链接、结构异常或 ID 不匹配的条目不跟随、不删除，只产生不含名称和路径的受控诊断。

真实 Profile 名称始终以 SQLCipher 为权威，Catalog 只是锁定界面的缓存。

## 6. VaultMetaStore

`VaultMetaStore` 只管理版本化 `vault.meta`。Meta v1 包含：

- Meta 格式版本；
- Local Profile ID；
- Vault ID；
- 数据库文件格式版本；
- `@notera/crypto` 定义的 `PasswordKeyPackage`。

Meta 不保存根目录 ID、Profile 名称、密码、密码提示、邮箱、Token 或业务数据。根目录 ID 在 SQLCipher 成功打开并完成 Vault 元数据校验后从数据库取得。

Meta 使用固定字段集合、固定键顺序、UTF-8 和单个结尾换行确定性编码。`VaultMetaStore` 对最终写入或读取的原始字节计算 SHA-256；该 32 字节摘要由 SQLCipher `vault_metadata` 验证。解析拒绝未知字段、重复语义、非法 UUID、非规范 Base64、非法密钥信封、未知 Meta 版本和不兼容文件格式。Crypto 密钥包的算法和 KDF 版本继续由 `@notera/crypto` 校验。

普通写入先排他创建同目录临时文件，设置仅当前用户可读写的权限，刷新文件内容，再原子替换目标。修改主密码专用的 `vault.meta.next` 只能由受约束的改密流程创建、提升或删除，不作为普通解锁候选直接读取。

## 7. ProfileSession

`ProfileSession` 独占当前 Profile 的：

- Local Profile ID、Vault ID、根目录 ID 和真实显示名称；
- Database Key 与 Vault Key 的 Session 副本；
- 一个 `VaultDatabase`；
- 一个 `AttachmentStore`；
- 后续本地业务用例共享的关闭信号和活跃操作门。

Session 不公开密钥、底层对象或真实路径。后续 Application 内部用例通过受约束的内部接口登记操作；Electron Main 和包根公共入口无法取得这些能力。

`close()` 先原子标记关闭并拒绝新操作，再触发关闭信号、等待已登记操作退出、关闭 Attachment Store、关闭 SQLCipher，最后清零 Database Key 与 Vault Key。某一步失败不能阻止后续清理；Session 保存第一个稳定错误，在全部清理尝试结束后返回。重复关闭幂等成功，关闭后的 Session 永久不可恢复或重新开放。

## 8. ProfileManager 状态与公共 API

生命周期状态为：

```text
LOCKED → OPENING → UNLOCKED → CLOSING → LOCKED
任一非 CLOSED 状态 ── close() ──→ CLOSED
```

所有改变生命周期或持久化状态的调用经过单一串行队列，确保不会同时创建两个 Session。`close()` 会立即阻止新调用；若创建或解锁正在执行，流程在发布 Session 前检查关闭状态并清理已取得资源。锁定已经锁定的 Manager、重复关闭 Session 或 Manager 均幂等成功。

包根公共入口只导出：

- `createProfileManager({ appDataRoot })`；
- `ProfileManager` 接口；
- `ProfileSummary`、`SessionState` 和分页结果等不可变 DTO；
- `ApplicationError` 及稳定错误码。

`ProfileManager` 提供：

- `listProfiles()`；
- `getSessionState()`；
- `createProfile()`；
- `unlockProfile()`；
- `lockProfile()`；
- `switchProfile()`；
- `renameProfile()`；
- `changeProfilePassword()`；
- `removeProfileFromDevice()`；
- `close()`。

包根不导出可直接操作的 `ProfileSession`、`VaultDatabase`、`AttachmentStore`、Meta 编解码器、路径推导器或密钥类型实例。

## 9. 创建 Profile

创建流程为：

1. 独占 `ProfileManager` 生命周期状态，校验显示名称与密码；
2. 生成 Local Profile ID、Vault ID 和根目录 ID；
3. 排他创建规范 Profile 目录和 `.creating` 标记；
4. 调用 Crypto 生成 Database Key、Vault Key 和密码密钥包；
5. 原子写入 `vault.meta` 并计算原始字节摘要；
6. 使用新 Database Key、Vault 身份、真实名称和 Meta 摘要创建 SQLCipher 数据库；
7. 初始化 Attachment Store，使 `blobs/`、`staging/` 和启动恢复状态可用；
8. 构造 `ProfileSession`，但尚不向其他调用方发布；
9. 原子新增 Catalog 条目；这是 Profile 对用户可见的提交点；
10. 删除 `.creating` 标记并返回已解锁 Session 摘要。

提交点前任一步失败时，关闭已创建的 Attachment Store 和数据库、清零密钥、删除本次明确创建且仍带标记的 Profile 目录，并保证 Catalog 不出现该 Profile。Catalog 提交后，即使标记清理失败或进程崩溃，创建仍视为成功；启动对账保留已发布 Profile 并清除残留标记。

Profile 目录、数据库或 ID 已存在时绝不覆盖。失败清理不能删除调用前已经存在的目录或文件。

## 10. 解锁、锁定与切换

解锁调用链固定为：

```text
Catalog 定位
  → vault.meta 严格读取、ID/版本校验和摘要
  → Crypto 解包 Database Key 与 Vault Key
  → SQLCipher 打开、迁移和 Vault/Meta 验证
  → 恢复未完成的 Meta 摘要状态
  → Attachment Store 初始化与 staging 恢复
  → 从数据库读取根目录和真实 Profile 名称
  → 构造并发布 ProfileSession
```

任一环节失败均关闭已打开资源、清零全部调用方持有的密钥副本并保持 `LOCKED`。有效 Meta 上的 Crypto 认证失败映射为 `WRONG_PASSWORD`；Meta 结构或版本错误映射为 `VAULT_META_INVALID`；成功解包后数据库无法验证则按具体 Storage 错误映射，不伪装成密码错误。

解锁成功后，Catalog 的最后使用时间和名称缓存更新为尽力操作。缓存写入失败不重新锁定已经安全打开的 Profile；下一次 Catalog 写入或解锁继续修复。

锁定只通过 `ProfileSession.close()` 完成。切换必须先完整关闭当前 Session，再执行目标 Profile 的解锁链；目标解锁失败时保持全局锁定，不恢复旧 Session。这样任一时刻都不会同时持有两个 Profile 的密钥或数据库连接。

## 11. 重命名

重命名只允许当前已解锁 Profile 执行。`ProfileManager` 校验名称后，在 SQLCipher 事务中修改真实名称。数据库提交是重命名的权威提交点，随后更新 Catalog 缓存和 Session 摘要。

数据库提交后 Catalog 更新失败不能回滚真实名称，也不把已经成功的业务操作报告为失败；当前 Session 返回新名称，下次解锁再从数据库修复缓存。数据库提交前失败则名称保持不变。

## 12. 主密码修改与 Schema v2

主密码修改会改变 `vault.meta` 原始字节及其摘要，但 SQLCipher 内同时保存该摘要。文件系统和数据库不能共享单个原子事务，因此本阶段发布正式 Schema v2。

Schema v2 只新增：

```sql
ALTER TABLE vault_metadata
ADD COLUMN pending_vault_meta_digest BLOB
CHECK(
  pending_vault_meta_digest IS NULL
  OR length(pending_vault_meta_digest) = 32
);
```

不可变 v1 基线不修改。v2 迁移按既有迁移框架注册、执行和验证；既有行的 pending 值为 `NULL`。

Storage Profile Metadata 接口增加受约束能力：

- 读取当前摘要和可选 pending 摘要；
- 在事务中登记一个新的 pending 摘要；
- 仅当期望值匹配时，把 pending 提升为当前摘要并清空 pending；
- 仅当期望值匹配时取消尚未提交的 pending。

打开数据库时，调用方提供的 Meta 摘要可以匹配当前摘要或非空 pending 摘要；其他值仍返回受控损坏错误。Vault ID、文件格式和根目录校验保持不变。

修改流程为：

1. 当前 Profile 必须已解锁；用旧密码对正式 `vault.meta` 重新认证；
2. 调用 Crypto 生成只改变盐和包装信封的新密钥包，Database Key 与 Vault Key 本身不变；
3. 确定性编码新 Meta，排他写入并刷新 `vault.meta.next`；
4. 在 SQLCipher 事务中登记新摘要为 pending；
5. 原子替换正式 `vault.meta`；这是主密码修改的提交点；
6. 在 SQLCipher 事务中把 pending 提升为当前摘要；
7. 清理临时状态。

若在步骤 5 前失败或崩溃，正式 Meta 仍是旧内容，旧密码有效；下次解锁使用当前摘要并取消 pending、删除 `vault.meta.next`。若在步骤 5 后失败或崩溃，正式 Meta 已是新内容，新密码有效；其摘要匹配 pending，解锁后完成提升。解锁只读取正式 `vault.meta`，绝不尝试用 `vault.meta.next` 接受尚未提交的新密码。

步骤 5 后的数据库收口或临时清理失败不撤销已提交的新密码；当前 Session 使用的两把明文 Key 没有变化，可以继续工作。后续生命周期操作在开始前先完成摘要状态收口。

## 13. 从设备永久移除

确认对话框属于未来 Electron Main。Application 的删除入口只接收已经确认的命令。

若目标是当前 Profile，先完整关闭 Session。随后：

1. 校验 Catalog 条目、规范 ID、目标真实目录和链接状态；
2. 把 Profile 目录原子移动到 `.deleting/<local-profile-id>.<32位随机小写十六进制>`；目录移动是逻辑删除提交点；
3. 从 Catalog 移除条目；
4. 对经过真实路径复核的隔离目录执行永久递归删除；
5. 刷新 `.deleting` 父目录并返回成功。

逻辑删除提交点后，该 Profile 不能再解锁。Catalog 或物理删除失败返回稳定错误，启动恢复继续移除失效 Catalog 条目并重试物理删除；不会把隔离目录恢复为可用 Profile。只有名称、层级、类型和真实路径全部符合内部格式的隔离目录可被删除。操作不使用系统回收站，也不承诺 SSD 的物理安全擦除。

## 14. 错误与隐私边界

Application 使用稳定 `ApplicationError`，覆盖：

- `PROFILE_LOCKED`、`ENTITY_NOT_FOUND`、`INVALID_NAME`；
- `WRONG_PASSWORD`、`VAULT_META_INVALID`、`CRYPTO_UNAVAILABLE`；
- `DB_CORRUPT`、`DB_SCHEMA_TOO_NEW`、`MIGRATION_FAILED`；
- `DISK_FULL`、`SAVE_FAILED`、`REMOVE_FAILED`；
- `APPLICATION_CLOSED`、`OPERATION_FAILED`。

实现可以在计划阶段细化不改变语义的内部错误码，但公共错误必须能确定性映射到 `src/shared` 现有 Profile IPC 合约。未知底层错误统一收口，不能把原始消息拼接进公共错误。

错误、日志、Catalog、DTO 和测试快照不得包含密码、Database Key、Vault Key、包装密钥、完整 Meta、数据库真实路径、Profile 目录、底层 SQL 或用户业务内容。允许记录操作类型、稳定错误码、Schema/格式版本和不含用户数据的计数。

## 15. 测试策略

测试按完整、可独立验证的功能边界组织。

### 15.1 ProfileCatalog 与 VaultMetaStore

- 确定性编码、摘要、严格解析和原子替换；
- 正式索引、备份、损坏索引和 Meta 重建；
- 创建标记、删除隔离目录、缺失目录和未索引有效 Profile 的启动对账；
- 非规范 ID、未知字段、过高版本、截断、尾随数据、重复条目和 ID/路径不匹配；
- 未知文件、目录、符号链接和重解析点不被跟随或删除。

### 15.2 SQLCipher Schema v2

- 从真实 v1 夹具迁移到 v2，新列为 `NULL`，v1 基线哈希保持不变；
- pending 摘要长度约束、准备、完成、取消、期望值竞争和事务回滚；
- 当前摘要或 pending 摘要可打开，其他摘要拒绝；
- 新建数据库通过连续迁移重放得到 v2，不维护第二份当前建库 SQL；
- v2 迁移失败遵循既有逐版本回滚和断点续迁规则。

### 15.3 ProfileSession

- 资源只归一个 Session 所有；
- 活跃操作登记、关闭中拒绝新操作、等待已有操作退出；
- Attachment Store、数据库和密钥的固定关闭顺序；
- 每个关闭边界失败后仍继续后续清理并清零密钥；
- 重复关闭幂等，关闭后所有内部能力失效。

### 15.4 ProfileManager 生命周期

- 列表、创建、锁定、解锁、切换、重命名、改密和永久移除；
- 同一时刻最多发布一个 Session，并发生竞争时保持确定状态；
- 错误密码、被篡改 Meta、错误 ID、损坏数据库、磁盘满和未知 I/O 的稳定映射；
- 创建提交点前后的每个失败边界及启动恢复；
- 主密码修改在 pending 登记、Meta 替换和摘要提升各边界崩溃后的旧/新密码行为；
- 删除在目录隔离、Catalog 更新和物理删除各边界崩溃后的恢复；
- 返回值、公共导出和错误不泄露内部对象、密钥、路径或底层消息。

测试优先使用临时目录和可控的内部工厂接缝验证 Application 编排；Crypto、Storage 和 Attachments 各自已经覆盖的底层算法不在 Application 测试中重复穷举。跨包关键路径仍至少覆盖一次真实创建、锁定和重新解锁。

## 16. 实施与验证约束

后续实施计划必须遵守仓库 `AGENTS.md`：

- 使用中文编写，并按可独立测试的完整功能模块划分；
- 测试与实现属于同一功能任务，每个模块完成后只提交一次；
- 实施过程中只运行当前模块相关单元测试；
- 不进行逐任务代码审核、规格审核、额外审核代理或重复全量检查；
- 所有模块完成后只执行一次相关测试全集，并按实际影响运行必要的 typecheck、依赖检查和 lint；
- 当前阶段不把任何同步能力纳入计划或实现。

## 17. 完成标准

- ProfileManager、ProfileCatalog、VaultMetaStore 和 ProfileSession 的依赖方向符合本设计；
- 离线状态可创建、列出、解锁、锁定、切换、重命名、改密和永久移除多个本地 Profile；
- 全局同一时刻最多一个 Profile 解锁，切换失败后保持锁定；
- 锁定后数据库、附件资源和 Session 密钥不可再访问；
- Catalog 损坏、创建中断和删除中断均可安全恢复，不跟随或删除异常路径；
- 主密码修改从任意持久化边界崩溃后都由旧状态或新状态继续，不产生两种密码都无法解锁的中间状态；
- Schema v2 通过正式迁移增加 pending Meta 摘要，v1 基线保持不可变；
- 从设备移除不进入系统回收站，逻辑删除后不能重新解锁；
- 公共 API 和错误不泄露密码、密钥、底层资源、真实路径或用户业务数据；
- 不包含本地笔记用例、附件业务编排、Electron IPC/UI 或同步实现与占位结构；
- 相关单元测试和必要最终验证全部通过。
