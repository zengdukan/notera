# Notera 总体架构设计

- 状态：已确认
- 日期：2026-08-21
- 首发平台：Windows Desktop
- 桌面技术：Electron + React + Atlassian Editor
- 设计范围：产品总体架构与后续子项目边界

## 1. 产品定义

Notera 是一款面向个人用户的 Windows 本地优先加密笔记软件。用户无需注册或联网即可创建本地 Profile 并使用全部本地笔记功能；每个 Profile 可在用户订阅官方云服务后，独立绑定一个云账户并启用端到端加密多设备同步。

Notera 使用“无限层级目录 + 笔记”组织内容。笔记正文使用 Atlassian Document Format（ADF），编辑器直接集成 `D:\programs\atlassian-editor`。笔记支持图片和普通附件，单个附件最大 100 MB。

同一台设备可以存在多个完全隔离的 Profile，但同一时刻只允许解锁一个 Profile。每个本地 Profile 独立拥有 Local Profile ID、SQLCipher 数据库、Database Key、附件密文、搜索索引和设备同步状态；连接同一 Vault 的各设备 Profile 沿用相同 Vault ID 和 Vault Key，用户使用同一主密码解锁，但各设备不共享本地 Database Key 或数据库文件。

### 1.1 首版功能

1. 创建、重命名、移动和删除无限层级目录。
2. 创建、编辑、移动、复制和删除笔记。
3. 使用 trigram 搜索笔记标题和当前默认版本的正文。
4. 为笔记添加、移除标签，以及加入或移出收藏。
5. 自动保存当前稿；由用户手动创建永久历史版本。
6. 恢复、复制或比较历史版本；高风险操作前创建系统保护版本。
7. 回收站保留 30 天，支持恢复和立即永久删除。
8. 批量移动、加标签、复制和移入回收站。
9. 插入、预览、下载和删除图片或普通附件。
10. 支持多个本地 Profile 的创建、锁定、切换和从设备移除。
11. 用户订阅后启用官方云端到端加密同步。
12. 单篇笔记导出为 Markdown 或 PDF，并导出当前版本引用的附件。

### 1.2 明确不做

首版不提供：

- macOS、Linux、移动端或 React Native 支持；
- 多人共享、团队空间、评论或实时协作；
- 自建同步服务器；
- 主密码提示、主密码重置、恢复密钥、安全问题或客服恢复；
- 整个 Profile 的备份与恢复；
- 任意格式的数据导入；
- 整库、目录或多篇笔记的明文导出；
- CRDT、实时共同编辑或自动合并冲突；
- OCR、附件正文索引、语义搜索和服务端全文搜索；
- 附件内容去重；
- 将 Standard Notes 代码直接复制到产品中。

### 1.3 核心名词

**Vault（加密库）**：一组笔记数据共同构成的加密与同步边界。一个 Vault 拥有稳定的 Vault ID 和 Vault Key，其数据包括目录、笔记、标签、收藏、历史、回收站、冲突和附件。启用同步后，同一个 Vault 的端到端加密副本可以分布在官方云端和多台设备上。Vault 是逻辑数据与安全边界，不是某个文件、数据库或进程；`vault.db` 只是它在一台设备上的本地数据表示，Main 中的当前 `ProfileSession` 负责操作已解锁 Vault。

**Profile（本地配置档）**：某台设备上访问一个 Vault 的本地入口与运行环境。一个 Profile 包含本机 Local Profile ID、`vault.meta`、SQLCipher 数据库、附件密文、本机 Database Key、设备身份、同步游标和本地设置。Profile 是设备本地概念，不在设备之间复制；新设备访问已有 Vault 时会创建一个新的本地 Profile。

两者关系为：

```text
一个 Vault
├─ 设备 A 的本地 Profile
├─ 设备 B 的本地 Profile
└─ 官方云端的加密副本（启用同步后）
```

一个 Profile 只访问一个 Vault；一个 Vault 可以由多台设备上的多个 Profile 访问。创建离线 Profile 时同时创建一个新 Vault。删除本地 Profile 只删除该设备的本地副本，不自动删除云端 Vault 或其他设备的数据；注销云账户才删除云端 Vault，其他设备已存在的本地 Profile 默认转为离线可用。

## 2. 参考代码与依赖原则

`D:\programs\standardnote\app` 只用于研究端到端加密、客户端分层和同步思路。Notera 自主实现，不复制 Standard Notes 的 AGPL-3.0 代码。

`D:\programs\atlassian-editor` 作为现成编辑器模块直接集成。其 ADF 数据模型和 Media API 是 Notera 编辑器适配边界；开发用 `.media-data` 和固定 Token 服务不得进入生产环境。当前直接使用的 `@atlaskit/*` 包声明为 Apache-2.0，发布前仍须锁定实际版本、生成 SBOM 并逐项复核许可证。

## 3. 用户体验与信息架构

主界面采用 Notion 式两栏布局：

- 左侧栏包含 Profile 切换、全局搜索、新建笔记、收藏、最近使用、目录与笔记混合树、标签、冲突、回收站和同步状态。
- 右侧主内容区显示面包屑、标题、标签和 Atlassian Editor。
- 历史、附件和同步详情通过按需抽屉展示，不永久压缩编辑区。
- 搜索结果、目录管理和批量操作使用右侧独立视图，不增加永久中间栏。

笔记属于且仅属于一个目录；标签与笔记是多对多关系；收藏是智能视图，不复制笔记。删除非空目录时，整个子树进入回收站并保留原层级。

正文停止输入约 1 秒后自动保存当前稿。普通自动保存不创建用户历史；用户点击“保存版本”时创建永久历史。恢复旧版本、解决同步冲突或执行数据迁移前，系统自动创建永久保护版本。

## 4. 总体架构

Notera 采用“SQLCipher 领域数据库 + 数据库外加密 Blob + 独立 E2EE 同步信封”架构。

```text
Renderer：React + Atlassian Editor
        │ 类型化、经过校验的 IPC
Preload：最小白名单与 schema 校验
        │
Main：窗口、Profile 索引、系统生命周期、当前 ProfileSession
      └─ 密钥、SQLCipher、附件、搜索、同步
        │
官方同步服务：不透明 Item 信封和加密附件块
```

### 4.1 Electron 进程边界

- Renderer 启用 `contextIsolation` 和沙箱，不启用 Node。Renderer 不能直接接触数据库、主密码、密钥或附件真实路径。
- Preload 只暴露业务动作级 IPC，例如 `note.save`、`search.query` 和 `attachment.open`。所有输入输出都必须通过共享 schema 校验。
- Main 负责窗口、系统锁屏与休眠事件、应用生命周期、非敏感 Profile 索引，以及当前已解锁 Profile 的全部本地业务能力。
- Main 同一时刻最多创建一个 `ProfileSession`。该会话持有当前 Profile 的 Database Key、Vault Key、SQLCipher 连接、全文索引、Blob Store 和同步队列。
- 切换 Profile 时，Main 先调用 `ProfileSession.close()`：停止同步、关闭数据库及附件句柄并清除密钥和服务引用，再要求目标 Profile 的主密码。Main 进程在锁定与切换期间保持运行。
- 系统锁屏、休眠、应用退出或配置的无操作超时会立即触发同一套 `ProfileSession.close()` 流程并锁定当前 Profile。

### 4.2 模块结构

```text
src/
  main/                 # Electron Main、Preload 与 IPC 入口
  renderer/             # React、Atlassian Editor 与编辑器适配
  shared/               # IPC schema 和共享 DTO
  __tests__/             # 集成测试与测试辅助代码

packages/
  crypto/               # 密钥派生、包装、加密和解密
  domain/               # 领域模型、值对象和领域规则
  storage-sqlcipher/    # SQLCipher、Repository、事务、迁移和 FTS
  attachments/          # 数据库外加密 Blob、分块、暂存和文件句柄
  application/          # ProfileSession、业务用例和同步编排
```

`src/main` 是桌面应用的组合根，创建 `ProfileSession` 并装配 `application`、`crypto`、`storage-sqlcipher` 和 `attachments`；`src/renderer` 只能通过 `src/shared` 定义并由 Preload 暴露的业务 IPC 调用 Main，不得导入 Node 专用实现。同步协议与同步引擎归入 `packages/application/sync`，编辑器适配归入 `src/renderer/editor`，IPC 合约归入 `src/shared`，通用测试辅助代码归入 `src/__tests__/helpers`。

模块划分用于限制依赖方向和安全边界，不为移动端创建额外抽象。当前仓库不包含同步服务端实现；服务端实现语言在同步子项目启动前决定，并必须遵循版本化协议和兼容测试。

## 5. Profile 与本地文件布局

```text
app-data/
  profile-index.json
  profiles/
    <local-profile-id>/
      vault.meta
      vault.db
      blobs/
      staging/
```

`local-profile-id` 是每台设备独立生成的随机 UUID，只用于本机目录和界面索引。创建离线 Profile 时同时生成账户级随机 `vault-id`，用于标识新 Vault 的加密域；其他设备连接该 Vault 时各自生成 Local Profile ID，但沿用相同 Vault ID。`profile-index.json` 只保存本机 Profile 顺序、Local Profile ID、最后使用时间及最近一次验证过的显示名称缓存，不保存 Vault ID、邮箱、Token、笔记或附件信息。真实 Profile 名称保存在 SQLCipher 中；名称缓存只用于锁定界面，不同步到服务器。

`vault.meta` 是打开 SQLCipher 前必需的最小引导记录，包含：

- Local Profile ID 和 Vault ID；
- 文件格式和加密协议版本；
- 本机 Argon2id 参数及随机盐；
- 被包裹的本机 Database Key；
- 被包裹的 Vault Key。

`vault.meta` 不包含主密码、密码提示、邮箱、Token 或业务数据。KDF 参数、Local Profile ID、Vault ID 和协议版本作为密钥包的 AEAD AAD；篡改只能导致认证失败，不能静默降低安全强度。数据库打开后会校验数据库内保存的协议版本及 `vault.meta` 摘要。

## 6. 本地数据模型

`vault.db` 使用 SQLCipher。核心表包括：

- `folders`：目录 ID、父目录、名称、排序和删除状态；
- `notes`：本地整数 Row ID、同步 Note ID、当前标题、ADF、目录、当前 Revision 和时间戳；
- `note_versions`：用户版本和系统保护版本的完整压缩 ADF 快照；
- `tags`、`note_tags`：标签及多对多关系；
- `favorites`：收藏笔记及排序；
- `attachments`：附件元数据、File Key、Manifest、本地状态和远端状态；
- `attachment_chunks`：密文块长度、哈希和传输状态；
- `attachment_references`：当前笔记、历史、冲突和回收站引用；
- `conflicts`：两个完整冲突分支及处理状态；
- `trash_entries`：删除对象、原位置和到期时间；
- `notes_fts`：当前默认版本的规范化标题和 ADF 提取正文；
- `sync_outbox`、`sync_state`：待同步任务、重试状态、设备信息和游标。

所有移动、批量标签和删除操作必须在单个 SQLCipher 事务中完成。保存笔记时，同一事务更新当前 ADF、规范化搜索文本、FTS 索引和同步 Outbox。

用户历史与同步 Revision 是两个概念：用户历史仅由“保存版本”和系统保护点产生并永久保留；同步 Revision 用于设备并发与幂等传输，可在所有设备确认后按协议压缩，不显示为用户历史。已解决的冲突分支转存为系统保护历史，避免数据丢失。

### 6.1 数据库结构升级

`vault.db` 使用单行 `schema_metadata` 表保存连续递增的整数 `schema_version`；该版本不写入 `vault.meta`。缺失该表或版本值非法的非空数据库按 `DB_CORRUPT` 处理，不能猜测为 v0。`vault.meta` 中的文件格式和加密协议版本只用于解包密钥并打开数据库，数据库结构版本只有在成功打开 SQLCipher 后才可信。应用构建内固定 `CURRENT_SCHEMA_VERSION`，已发布的迁移一经发布不得修改、重排或复用版本号。

`packages/storage-sqlcipher` 维护按目标版本命名并注册的独立迁移，例如 `v002.ts` 表示从 v1 升到 v2。注册表必须从首个公开数据库版本连续排列到当前版本；重复版本、缺失版本或乱序在构建与测试阶段直接失败。迁移只处理数据库 DDL、必要的数据回填及其约束校验，不承担同步协议迁移，也不触发 FTS 重建。

Profile 解锁后的数据库启动顺序为：

1. 解包 Database Key，打开 SQLCipher 并读取 `schema_version`；
2. 若数据库版本高于 `CURRENT_SCHEMA_VERSION`，立即关闭连接并返回 `DB_SCHEMA_TOO_NEW`，旧版应用不得降级打开；
3. 若数据库版本较低，按版本顺序逐个执行迁移；业务 Repository、同步引擎和 Renderer 数据接口在全部迁移完成前不可用；
4. 每个目标版本使用一个独立 SQLCipher 事务，DDL、数据回填和校验成功后，最后在同一事务中更新 `schema_version`；
5. 当前版本迁移失败时回滚该事务、停止启动并返回 `MIGRATION_FAILED`。此前已经成功提交的版本保持有效，下次解锁从最后成功版本继续，不创建或切换到空数据库；
6. 全部迁移成功后重新读取并确认 `schema_version`，再开放业务服务。

迁移必须可从其声明的前一版本确定性执行，不能依赖网络、同步完成状态、Renderer 或当前应用会话。纯 Schema 或内部字段回填不创建笔记历史；如果将来的迁移确实改写用户可见的标题或正文，必须在同一事务中为受影响笔记创建系统保护版本，并按普通保存规则维护同步 Outbox。

Notera 不提供向下迁移。旧版应用遇到更高版本数据库时只提示安装能够识别该数据库的新版应用，不尝试猜测兼容性、删除未知列或恢复旧结构。数据库升级不额外创建整个 Profile 的迁移副本，其故障原子性由逐版本事务保证。

全新 Profile 直接使用当前 Schema 快照建库并把 `schema_version` 设为 `CURRENT_SCHEMA_VERSION`，不重放历史迁移。测试必须证明全新建库与从每个已发布历史版本逐级迁移得到的最终表、列、索引、触发器和约束一致。

数据库升级与搜索索引维护相互独立。普通 Schema 升级不得清空、重建或重新填充 `notes_fts`；第 7 节定义的首次同步建索引、完整性检查和损坏恢复不属于数据库升级流程。

## 7. 多语言搜索

搜索仅在当前已解锁 Profile 的本地 SQLCipher 中执行，索引永不上传。

ADF 先提取为纯文本，再对标题和正文执行 NFKC 规范化与 Unicode 大小写折叠；展示内容保持原样。`notes_fts` 使用默认的内容型 FTS5 表，不增加搜索影子表：

```sql
CREATE VIRTUAL TABLE notes_fts USING fts5(
    note_id UNINDEXED,
    source_revision UNINDEXED,
    title,
    body,
    tokenize = 'trigram'
);
```

`notes` 使用本地整数 `row_id` 作为 SQLCipher 主键，并使用 UUID `note_id` 作为同步身份；`notes_fts.rowid` 必须与 `notes.row_id` 一致。`source_revision` 记录生成当前索引内容时对应的笔记 Revision，用于检测索引漂移。

长度不少于 3 个字符的规范化查询使用 FTS5 trigram，并由应用编译为字面量查询，不能把用户输入直接解释为 FTS 操作符。长度为 1 或 2 个字符时，直接对 `notes_fts.title` 和 `notes_fts.body` 执行参数化 `LIKE '%...%'` 包含扫描；应用必须转义 `%`、`_` 和转义字符本身。结果通过 `note_id` 回查 `notes`，不能把规范化索引内容直接作为展示文本。

### 7.1 增量维护

所有会改变当前默认标题或正文的路径必须进入同一个 Note Repository 保存入口，包括本地自动保存、标题修改、恢复历史、选择冲突版本和应用云端 Revision。保存入口执行：

1. 从当前 ADF 提取纯文本，并规范化标题和正文；
2. 在同一个 SQLCipher 事务中更新 `notes`；
3. 使用稳定 `row_id` 删除 `notes_fts` 中的旧记录，再插入包含新 `source_revision` 的记录；
4. 更新同步 Outbox；
5. 任一步失败时回滚整个事务。

新建笔记时插入 FTS 记录。笔记移入回收站时删除 FTS 记录，恢复时重新生成；永久删除不再进行额外索引处理。保存用户历史不更新 FTS，只有历史被恢复为当前默认版本时才更新。非默认冲突分支不进入 FTS。目录、标签、收藏和附件变化不触发 FTS 更新。

禁止业务代码直接更新 `notes`；数据库访问层只向上暴露能同时维护正文、FTS 和 Outbox 的事务性接口。同步批量应用可以共用同一事务，但必须对批次内每篇发生变化的笔记执行相同索引更新。

### 7.2 完整性检查与重建

`notes` 是唯一权威数据，`notes_fts` 是可丢弃的派生数据。数据库元数据记录 FTS schema 版本、ADF 文本提取器版本和规范化规则版本。以下情况触发全量重建：

- 任一搜索相关版本发生变化；
- FTS5 `integrity-check` 失败；
- `notes.current_revision` 与对应 `notes_fts.source_revision` 不一致；
- FTS 记录数量与非回收站笔记数量不一致。

重建在 Main 的当前 `ProfileSession` 中执行：暂停搜索和笔记写事务，清空 `notes_fts`，遍历所有非回收站笔记，从 ADF 重新提取并插入标题、正文和 `source_revision`，最后校验记录数量、Revision 一致性和 FTS5 `integrity-check`。只有全部校验通过后才恢复搜索和写入；失败时原始 `notes` 不受影响，保持“搜索索引需要重建”状态并允许重试。

短查询采用输入防抖、取消旧请求、结果上限和分页，避免连续全表扫描。构建和启动检查必须确认 SQLCipher 所带 SQLite 启用 FTS5 trigram；缺失时构建或启动失败，不静默更换分词策略。

搜索范围只包括笔记标题和当前默认版本的正文，不索引目录、标签、附件名、历史版本、冲突分支或附件正文，也不做 OCR 或语义搜索。

## 8. 威胁模型与密钥体系

### 8.1 保护目标

系统保护同步服务器或对象存储被入侵、网络流量被观察、锁定状态下磁盘文件被复制，以及其他 Profile 尝试访问当前 Profile 的场景。

系统不承诺防护应用已解锁时的恶意程序、键盘记录器、屏幕录制、管理员或内核级攻击、用户主动导出的明文和极弱主密码。

### 8.2 密钥层级

```text
主密码
├─ 本机 Argon2id → Password Wrapping Key
│                   ├─ 包裹本机 Database Key
│                   └─ 包裹 Vault Key
└─ 云账户 Argon2id → Account Root Key
                    ├─ HKDF 派生云端认证凭据
                    └─ HKDF 派生 Account Wrapping Key

Vault Key
├─ 包裹同步 Revision 的 Record Key
└─ 包裹附件的 File Key
```

- Database Key：每个本地 Profile 随机生成，只用于该设备上的 SQLCipher，永不上传。
- Vault Key：创建离线 Profile 时即随机生成，绑定云账户后作为多设备共享根密钥；服务器只保存被包裹的密钥包。
- Record Key：每个同步 Revision 随机生成，用于加密 Item 内容。
- File Key：每个附件随机生成，用于附件分块及缩略图子密钥派生。

密码学基线为 Argon2id、HKDF-SHA-256 和 XChaCha20-Poly1305。本机 Argon2id 基线为 64 MiB 内存、3 次迭代、并行度 1、64 字节输出；版本化参数可以提高但不得低于基线。所有随机数来自操作系统 CSPRNG。

主密码永不保存或上传。密码正确性通过 AEAD 密钥包认证判断，不保存独立密码哈希。创建或修改主密码时要求输入两次、显示强度提示，并要求用户确认“忘记主密码将永久失去数据访问权限”。

修改主密码只重新派生云端认证凭据并重新包裹 Database Key 和 Vault Key，不重新加密全部笔记和附件。修改后撤销其他云端会话；其他设备必须先用旧密码解锁本地 Profile，再输入新密码重新绑定。无法提供旧密码时，只能删除该设备本地 Profile 并从云端重新添加；未上传变更可能丢失。

## 9. 附件存储与 Media Gateway

附件二进制不写入 SQLite。SQLCipher 只保存元数据、密钥、Manifest、引用和状态；本地密文保存在：

```text
profiles/<profile-id>/blobs/<blob-id-prefix>/<blob-id>.blob
```

### 9.1 加密格式

- 单附件最大明文大小为 100 MB；
- 每个附件生成随机 Attachment ID、Blob ID 和 File Key；
- 采用 5 MiB 明文分块，与当前 Atlaskit Media 上传流程对齐；
- 每块独立使用 XChaCha20-Poly1305；
- Nonce 由 16 字节随机前缀和 64 位分块序号组成；
- AAD 绑定协议版本、Vault ID、Blob ID、分块序号和明文长度；
- Manifest 保存各密文块长度与 SHA-256；
- 缩略图是独立加密 Blob，使用从 File Key 通过独立域标签派生的子密钥。

### 9.2 附件写入流程

1. Media Gateway 创建稳定的 Attachment ID 和上传会话。
2. 数据流入 `staging`，检查大小并逐块加密，不把完整明文载入内存。
3. 图片缩略图只在内存中生成。
4. 完成 Manifest、`fsync` 和完整性验证。
5. 原子移动至最终 Blob 路径。
6. 在一个 SQLCipher 事务中提交附件元数据、笔记引用和同步 Outbox。
7. 崩溃恢复根据 staging 与数据库状态继续或清理，半完成文件不得作为可用附件展示。

ADF 只保存 Attachment ID 和适配器所需的 collection 标识，不保存真实路径或二进制。复制笔记时复用 Blob 并新增引用；重新导入相同文件创建新 Blob，首版不做内容去重。

### 9.3 Media Gateway

- 仅监听随机 `127.0.0.1` 端口；
- 每次 Profile 解锁生成临时 Token；
- 校验 Origin、Profile、collection 和 Attachment ID；
- 保持与 `D:\programs\atlassian-editor` Media API 兼容；
- 将 Range 请求映射到所需密文块，流式解密返回；
- 图片、音视频和 PDF 预览不创建明文临时文件；
- Profile 锁定后进程与 Token 同时失效。

### 9.4 状态与垃圾回收

本地状态为 `IMPORTING`、`REMOTE_ONLY`、`DOWNLOADING`、`READY`、`MISSING`、`CORRUPT` 和 `GC_PENDING`。远端状态为 `LOCAL_ONLY`、`QUEUED`、`UPLOADING`、`AVAILABLE`、`FAILED` 和 `DELETED`。

`attachment_references` 是真实引用来源。附件删除前必须重新计算当前笔记、永久历史、冲突和回收站中的引用。引用归零后先标记 `GC_PENDING`，确认没有预览、同步或导出任务占用，再删除 Blob 和 File Key。删除 File Key 提供加密擦除，但不承诺 SSD 的物理安全擦除。

## 10. 账户与端到端加密同步

同步默认关闭。每个本地 Profile 最多连接一个官方云账户及其对应的一个 Vault；同一个云账户和 Vault 可以由多台设备各自的本地 Profile 访问。账户使用邮箱与当前 Vault 的同一个主密码。每个 Profile 的本地 KDF 盐仅属于该设备；云账户 KDF 盐属于账户并供各设备沿用，两种用途使用独立盐和 HKDF 域标签。

客户端通过邮箱获取版本化账户 KDF 参数，并拒绝低于安全基线的参数。未知账户返回不可区分的伪参数以降低邮箱枚举风险。客户端派生云端认证凭据和 Account Wrapping Key；认证凭据只通过 TLS 发送，服务端保存其慢哈希验证值。Vault Key 经 Account Wrapping Key 加密后上传。短期 Access Token 和 Refresh Token 均不包含解密密钥，Refresh Token 只存入 SQLCipher。

服务端实现语言不在本设计中确定，但必须实现同一协议和兼容测试。服务端永远不能获得主密码、Account Root Key、Vault Key、Record Key 或 File Key。

### 10.1 不透明 Item 信封

同步信封包含 Vault ID、Item ID、Revision ID、Base Revision ID、Device ID、PUT/DELETE 操作、协议版本、密文和密文哈希。Revision ID 同时作为幂等键。

对象类型、标题、正文、目录、标签、文件名、MIME、历史和冲突内容全部在密文内。服务器可看到邮箱、随机 ID、密文大小、版本关系、操作类型、时间和附件块编号。

### 10.2 同步优先级

同步由持续优先级队列驱动：

1. P1：目录、笔记、标签、收藏、历史、冲突、回收站、附件元数据和缩略图元数据；
2. P2：用户当前查看或下载的附件，立即抢占后台任务；
3. P3：其余附件块后台上传或下载，最终使每台设备完整离线可用。

P3 失败、暂停或配额不足不得阻塞 P1。远端笔记先到而附件不可用时显示“附件同步中”或“等待首台设备上传”，不能判为损坏。

同步循环为：拉取游标后的远端变更，校验协议、哈希和 AEAD，在 SQLCipher 事务中应用并记录冲突，批量上传 P1 Outbox，再次拉取至最新游标，然后处理 P2 和 P3。任务只有收到服务器确认游标后才能从 Outbox 删除。

### 10.3 冲突

上传的 Base Revision 与当前 Head 不一致时，服务端保留两个完整版本。最后被服务器接受的 Revision 成为默认版本，不使用客户端时钟决定先后。

客户端持续提示用户处理，可选择另一版本为当前版本、复制为新笔记或手动合并。处理前自动创建系统保护版本；处理结果创建引用两个父版本的新 Revision。已解决分支保留为系统保护历史。

### 10.4 回收站与 Tombstone

移入回收站是可恢复的加密 Item 更新。同步 Profile 的 30 天期限以服务器接受删除的时间为准；纯离线 Profile 使用本机时间。到期清理只在 Profile 解锁期间运行。

永久删除产生 Item Tombstone；附件引用归零后产生 Blob Tombstone。Tombstone 防止长期离线设备重新上传旧数据。游标早于服务器删除检查点且仍有未上传变更的设备不得覆盖服务器状态；客户端先把该设备的现有数据库解除云账户绑定并保留为独立离线 Profile，再把云端 Vault 下载为一个新的本地 Profile，由用户逐篇查看并决定是否导出需要保留的本地内容。

### 10.5 订阅状态

订阅到期后，本地功能完整可用，但暂停上传和下载，Outbox 保留。云端密文永久保留直至用户主动注销账户；续费后从原游标恢复同步。新设备在订阅到期期间不能执行首次云端同步。

注销账户需要重新验证主密码并明确确认；服务端随后删除云端账户、密文附件和会话。本地 Profile 默认保留为离线 Profile，除非用户另行确认从设备移除。

## 11. 已有本地 Profile 首次订阅

已有本地数据首次上云时，本地 Profile 始终是权威来源，流程不迁移、不替换、不删除本地数据。

1. 当前 Profile 已解锁；客户端执行 SQLCipher 完整性和 Blob Manifest 检查，并显示对象数量与预计上传大小。
2. 用户完成邮箱验证和订阅，重新输入当前主密码。
3. 客户端派生云端凭据，使用 Account Wrapping Key 包裹当前已有 Vault Key，创建空云端 Vault 并注册当前 Device ID。
4. 若邮箱已绑定包含数据的云端 Vault，拒绝自动合并；该 Vault 必须作为另一个本地 Profile 添加。
5. 云端 Vault 进入 `BOOTSTRAPPING`。
6. 客户端用短事务为现有对象确认稳定 Item/Revision ID，记录本地变更序号并生成初始 Outbox。同步期间的新编辑排在对应基线 Revision 后上传。
7. P1 上传目录、笔记、标签、收藏、历史、冲突、回收站、Tombstone 及附件元数据。每批收到确认后才从 Outbox 删除。
8. P1 完成后云端 Vault 进入 `ACTIVE`，其他设备可以浏览和编辑；附件缺失时显示上传中。
9. P2/P3 上传现有密文附件块。用户请求可提升特定附件优先级。
10. 全部附件确认后再次拉取核对游标并进入常规同步。

中断时本地继续可用，云端保持 `BOOTSTRAPPING` 或附件同步中状态；恢复后根据 Outbox、游标和分块状态继续，不自动回滚或删除部分云端密文。

## 12. 新设备首次同步

用户选择“添加已有同步 Profile”，输入邮箱和主密码：

1. 获取并验证账户 KDF 参数，派生认证凭据和 Account Wrapping Key。
2. 认证后获取被包裹的 Vault Key、协议版本和起始游标，并在本机解包 Vault Key。
3. 生成新的 Device ID、本机 Database Key 和本机 KDF 盐，创建 SQLCipher schema 和 `vault.meta`。
4. Refresh Token 写入 SQLCipher；现有离线 Profile 不参与自动合并。
5. P1 下载并验证全部 Item 信封，在事务中写入当前数据、永久历史、冲突、回收站、Tombstone、附件元数据和引用。
6. 新设备从 ADF 本地重建 trigram FTS，搜索索引不从云端下载。
7. P1 完成前显示初始化进度且不允许编辑；完成后开放浏览、搜索和编辑。
8. 用户打开未落地附件时将任务提升为 P2，按块续传、校验并流式解密预览。
9. 无用户请求时，P3 按当前笔记、收藏与最近使用、其他笔记的顺序下载剩余附件。
10. 全部完成后设备达到完整离线状态。

应用退出、断网或崩溃后保留游标与已验证块。所有 Item 和附件块请求幂等。附件仍在另一设备上传时返回 `REMOTE_PENDING`，不视为丢失。

## 13. 单篇笔记明文导出

首版不提供备份、恢复或数据导入，只支持已解锁 Profile 中当前单篇笔记的明文导出。导出不要求重新输入主密码。

支持格式：

- Markdown + 同名附件目录；
- PDF + 同名附件目录。

只导出当前默认版本及其实际引用的原始附件，不包含历史、冲突分支或回收站内容。Markdown 和 PDF 中的附件引用使用相对路径。PDF 保留正文样式、表格、数学公式、Mermaid 和图片；普通附件在 PDF 中列出文件名、类型和大小，原文件写入同名附件目录。

PDF 通过只读、沙箱化的 ADF 渲染视图生成，禁止加载远程资源，等待字体和本地图片完成后再输出。数学公式与 Mermaid 使用本地渲染结果；无法无损转换的节点显示明确占位并写入导出报告，不能静默丢失。

文件名必须按 Windows 规则合法化并处理冲突。明文直接流式写入用户选择的位置，不使用系统临时目录。导出前提示目标文件不再受 Notera 加密保护。导出期间 Profile 被锁定时立即中止并清理未完成输出。

## 14. 错误处理与隐私日志

基本原则是本地编辑不因云端故障停止，错误不能静默丢数据或覆盖最后一个可读版本。

- `WRONG_PASSWORD`：不打开 SQLCipher，不区分认证或密钥解包失败，界面限速重试。
- `VAULT_META_INVALID`：停止解锁；已同步 Profile 可删除本机副本后重新添加，纯离线 Profile 无恢复路径。
- `DB_CORRUPT`：停止写入并进入只读诊断；同步 Profile 可确认云端完整后重新下载，纯离线 Profile 无恢复路径。
- `SAVE_FAILED`：编辑器保留内存 ADF 并显示持续“未保存”；切换、锁定或退出前明确警告，并允许导出当前内存内容。
- `DISK_FULL`：回滚事务，暂停附件下载和后台维护，不删除已有数据。
- `BLOB_MISSING` / `BLOB_CORRUPT`：笔记继续可读；云端存在时重新下载，否则标记不可用。
- `SYNC_AUTH_EXPIRED`：暂停当前 Profile 同步并要求登录，不影响本地编辑。
- `SUBSCRIPTION_EXPIRED`：暂停上传和下载，保留本地功能和 Outbox。
- `PROTOCOL_TOO_OLD`：停止同步并要求升级，不静默降级。
- `REMOTE_QUOTA_FULL`：分别提示 Item 和 Blob 配额，Blob 问题不得阻塞笔记 Item。
- `CONFLICT`：保留两个完整版本，显示默认版本并持续提示处理。
- `DB_SCHEMA_TOO_NEW`：关闭数据库并要求升级应用；禁止旧版应用降级打开或修改数据库。
- `MIGRATION_FAILED`：回滚当前版本迁移并保留最后成功的 schema，禁止用空数据库继续启动。

日志采用字段白名单，只允许错误码、随机 ID、协议版本、耗时、重试次数和非敏感计数。禁止记录主密码、密钥、Token、邮箱、标题、正文、目录、标签、附件名、MIME、明文路径、搜索词、ADF、导出路径、Media Token 或完整 IPC 参数。

生产环境关闭 SQL、IPC 和网络正文日志。崩溃报告发送前经过相同字段过滤，并允许用户关闭诊断上报。

## 15. 测试与安全发布门槛

### 15.1 自动化测试

- 领域模型：目录循环、移动/复制、批量事务、收藏、永久历史、回收站和附件引用；
- 搜索：当前标题与正文的中日英及混合文本 trigram、1–2 字符回退、事务性增量维护、通配符转义、分页、完整性检查和索引重建；
- 加密：已知答案、篡改、AAD 替换、Nonce 唯一性、密钥域隔离、错误密码和密码修改；
- SQLCipher：全新 Schema 与逐级迁移等价、每个历史版本升级、迁移顺序与缺口检查、单版本事务回滚、中途异常退出后续迁、磁盘满、高版本拒绝打开、损坏检测和 Profile 隔离；
- 附件：100 MB 边界、5 MiB 分块、断点续传、Range、分块损坏、staging 恢复和 GC；
- 同步模拟：两台及三台设备、乱序、重复、断网、首次订阅、新设备首次同步、冲突、Tombstone、订阅到期和协议升级；
- 导出：ADF 到 Markdown/PDF、图片、普通附件、公式、Mermaid、非法文件名和中途锁定；
- Electron E2E：Profile、目录、笔记、搜索、历史、回收站、批量操作、附件、自动锁定和同步状态。

### 15.2 安全门槛

- Renderer 沙箱、CSP、导航限制和 IPC schema 测试；
- Media Gateway Token、Origin、路径穿越、Range、并发和锁定后失效测试；
- KDF 降级、重放、密文替换、恶意服务器、超大响应和配额攻击测试；
- 日志、崩溃报告和临时目录敏感信息扫描；
- 生成 SBOM，复核 Atlaskit、SQLCipher、密码学库和原生依赖许可证；
- 正式版发布前完成威胁模型评审；
- E2EE 协议与关键实现未经独立安全审计时，只能标记为测试版本，不能宣称已经通过安全审计。

同步服务端无论采用何种语言，都必须通过同一协议兼容测试套件。

## 16. 实施子项目

1. **基础与 Vault 安全**：仓库分层、进程边界、IPC、Profile、SQLCipher、KDF 和密钥生命周期。
2. **本地笔记核心**：目录、笔记、Atlaskit Editor、标签、收藏、历史、回收站、批量操作和 trigram 搜索。
3. **加密附件与单篇导出**：Blob Store、Media Gateway、传输状态、垃圾回收、Markdown/PDF 导出。
4. **E2EE 同步系统**：协议、Outbox、账户绑定、首次订阅、新设备首次同步、附件优先级、冲突和 Tombstone；服务端技术在此子项目启动前确定。
5. **集成加固与 Windows 发布**：故障注入、性能、迁移、安装包、安全评审和审计整改。

每个子项目单独编写详细规格、实施计划和验收证据，不把全部范围放入一次实现。

## 17. 总体验收标准

- 无账户、无网络时可以创建 Profile 并使用全部本地笔记功能；
- 同一时刻只解锁一个 Profile，锁定后 SQLCipher 和附件密文不可读；
- Profile 之间的数据库、密钥、附件和同步会话完全隔离；
- 主密码没有提示、重置或恢复旁路；
- 中日英混合搜索及 1–2 字符查询符合既定 trigram 与回退规则；
- 在订阅有效且同步可用时，笔记和附件元数据始终优先于附件块；所有附件最终完整落地，用户请求可以抢占队列；
- 首次订阅和新设备首次同步可中断、恢复且不重复创建数据；
- 多设备冲突不会丢失任一完整版本，服务器最新接受版本为默认；
- 回收站 30 天内可恢复，永久删除后离线设备不能复活数据；
- 所有批量操作具有事务性，失败不产生半移动或半删除状态；
- 单篇 Markdown/PDF 导出包含当前版本引用的附件，不泄漏历史和冲突内容；
- 订阅到期不影响本地编辑，续费后从原游标继续同步；
- Windows 发布构建通过功能、迁移、故障注入、端到端和安全门槛测试。
