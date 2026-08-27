# Notera Renderer 与编辑器集成设计

- 状态：已确认
- 日期：2026-08-27
- 首发平台：Windows Desktop
- 技术范围：Electron Renderer、Preload/Main 配套契约、Atlaskit Editor/Renderer、生产 Media Adapter
- 上位设计：`docs/superpowers/specs/2026-08-21-notera-overall-architecture-design.md`

## 1. 目标与设计优先级

本项目交付一个完整、可离线使用的 Notera Renderer 产品，而不是只把 Atlaskit Editor 嵌入一个演示页面。用户在不注册、不联网的情况下，可以完成本地 Profile 创建与解锁、目录和笔记组织、编辑与预览、搜索、收藏、历史、回收站、导出、设置和锁定等完整流程。

本规格是 Renderer 产品范围和交互的直接依据。若上位总体架构中的早期界面描述与本规格冲突，以本规格为准；领域模型、安全边界和离线存储原则仍由上位设计约束。

设计优先级如下：

1. 不静默丢失用户内容，不让未保存草稿伪装成已保存内容。
2. Profile 锁定后立即清除 Renderer 中的敏感内容和会话能力。
3. 完全采用 Atlassian Design System（ADS），不引入其他 UI 组件库。
4. Main 和加密数据库是持久化数据的唯一事实来源，Renderer 只保存查询缓存和当前内存草稿。
5. 当前产品采用单窗口、单 Profile、纯本地单写入者模型，不引入同步相关状态或冲突模型。

## 2. 范围

### 2.1 本次包含

- Profile 列表、创建、解锁、锁定、重命名、修改主密码和从设备移除；
- 可调整宽度、可折叠的左侧导航；
- 无限层级目录与笔记混合树；
- 笔记创建、编辑、预览、保存、重命名、移动、复制、收藏和回收站操作；
- 自定义响应式 Atlaskit 编辑工具栏；
- 全局搜索及目录范围选择；
- 收藏、最近使用、历史版本、回收站、设置和导出 Modal；
- 中英文、主题和自动锁定；
- Atlaskit Media 与 Notera 加密附件能力的生产适配；
- Renderer 状态、IPC 数据流、错误处理、键盘和可访问性；
- 与上述功能相关的单元、组件和必要集成测试。

### 2.2 本次明确不包含

- 标签 UI；
- 多选和批量操作 UI；
- 附件管理页面、抽屉或 Notera 自定义附件交互；
- 目录或笔记拖放；
- 树内行内重命名；
- 树空白区域右键菜单；
- 永久右侧面板或 Drawer；
- 多窗口同时编辑；
- 同步协议、同步引擎、云端 API、同步 Outbox、同步冲突或远端附件状态。

底层现有标签、批量等 IPC 能力可以保留，Preload 现有白名单也不因本项目收紧；Renderer 产品界面不使用这些入口。

## 3. ADS 约束

布局、组件、图标、Tokens、排版、间距、主题、焦点、反馈和可访问性全部采用 ADS。

组件选择顺序为：

1. 当前、非 Deprecated 的 ADS 组件；
2. 组件公开定制能力；
3. ADS Primitives 组合；
4. 仅在 ADS 没有现成能力时编写基于 Tokens 的自定义组件。

导航采用当前 Navigation System，不使用旧 Page Layout 或 Side Navigation。对话框使用 ADS Modal Dialog，不使用 Drawer。无限层级内容树使用 ADS Primitives、Pressable、Icon 和 Tokens 组合，并实现标准 tree/treeitem 语义。

## 4. 信息架构

应用采用两区布局：可调整的左侧导航和占据其余空间的中央工作区，不设置永久右侧面板。

```text
┌────────────────────┬──────────────────────────────────────────────┐
│ 可调整/可折叠导航   │ 中央工作区                                   │
│                    │                                              │
│ Profile + 锁定      │ 编辑工具栏（仅编辑状态）                     │
│ 搜索          [+]   │ 面包屑 + 标题 + 保存/收藏/编辑预览/更多       │
│ 收藏                │                                              │
│ 最近使用            │ Atlaskit Editor 或 ReactRenderer             │
│ 回收站              │                                              │
│ 设置                │                                              │
│ 目录与笔记混合树     │                                              │
└────────────────────┴──────────────────────────────────────────────┘
```

左侧导航从上到下固定为：

1. 当前 Profile 名称与独立锁定按钮；
2. 搜索触发器与 `+` 新建按钮；
3. 收藏；
4. 最近使用；
5. 回收站；
6. 设置；
7. 目录与笔记混合树。

导航折叠后隐藏内容树，只保留主要图标入口。Profile 区域没有直接切换入口；切换 Profile 必须先锁定，再在锁定页面选择另一个 Profile。

## 5. 启动、Profile 选择与创建

锁定页采用同页选择与解锁布局：左侧为 Profile 列表，右侧为所选 Profile 的解锁内容。

- Profile 列表标题右侧使用 ADS Add Icon Button 作为“创建 Profile”入口；
- 选择 Profile 后，右侧显示密码输入和解锁主操作；
- 点击创建入口后，右侧切换为 Profile 创建表单，不打开 Modal；
- 创建表单不提供取消按钮；点击任意 Profile 即切回解锁界面；
- 没有任何 Profile 时，右侧默认显示创建表单；
- 创建成功后直接进入已解锁主界面；
- 主密码不可恢复，不提供提示、重置、安全问题或客服恢复；
- 锁定页右上角设置只允许修改主题和语言。

错误密码使用就地错误并由 Main 执行限速。密码只存在于表单局部状态，请求结束后立即清除。

## 6. 搜索、新建入口与内容树

### 6.1 搜索与新建入口

```text
[ 搜索              Ctrl + J ] [+]
```

搜索框是触发器，不在左栏直接输入。点击或按 `Ctrl/Cmd + J` 打开搜索 Modal。`+` 打开 Dropdown Menu：

- 新建笔记；
- 新建目录。

上下文创建规则：

- 当前选中目录：在该目录内创建；
- 当前选中笔记：在该笔记所属目录创建；
- 未选中任何内容：在根目录创建。

新建笔记不打开 Modal，持久化空标题并直接进入编辑状态，标题获得焦点。界面使用本地化的“无标题/Untitled”作为空标题显示回退，不把本地化默认名写入数据库。

新建目录使用小型 Modal 输入非空名称。

### 6.2 内容树交互

- 左键选择和打开；右键显示操作菜单；
- 目录可无限层级展开，子节点按需分页加载；
- 目录行在鼠标 hover 或键盘焦点进入该行时，右侧显示 `+` 和扩展按钮；
- 点击目录行的 `+` 打开“新建笔记 / 新建子目录”Dropdown Menu，创建目标固定为该目录；
- 点击目录行的扩展按钮，打开与该目录右键完全相同的操作菜单；
- 笔记行在鼠标 hover 或键盘焦点进入该行时，右侧显示扩展按钮；点击后打开与该笔记右键完全相同的操作菜单；
- 行内扩展按钮与右键入口复用同一份菜单定义、顺序、禁用规则和操作 controller，不维护两套行为；
- 点击行内按钮只执行对应按钮操作，不同时触发行的选择、展开或打开；菜单打开期间操作按钮保持可见；
- 行内按钮使用 ADS Icon Button、Tooltip 和可本地化 accessible label；按钮区域不改变树行高度，标题空间不足时使用省略显示；
- 无多选、无批量 UI、无拖放、无树内重命名；
- 不提供树空白区域右键菜单；
- 空树只显示简短引导，仍使用已有 `+` 入口创建。

目录右键菜单：

- 新建子目录；
- 新建笔记；
- 重命名；
- 移动；
- 移入回收站。

笔记右键菜单：

- 打开；
- 重命名；
- 移动；
- 复制；
- 收藏或取消收藏；
- 导出；
- 移入回收站。

## 7. 笔记工作区

已有笔记默认进入预览状态，新建笔记直接进入编辑状态。

```text
自定义响应式编辑工具栏（仅编辑状态）
面包屑 + 标题       保存状态 + 收藏 + 编辑/预览 + 更多
正文 Editor / Renderer
```

面包屑和标题位于同一行。编辑状态下，工具栏和笔记头部形成两层 sticky 区域；预览状态不显示编辑工具栏，笔记头部固定在顶部。正文独立滚动。

头部右侧依次显示：

1. 保存状态；
2. 收藏或取消收藏；
3. 编辑或预览主操作；
4. 更多菜单。

更多菜单包含：

- 创建版本；
- 查看历史；
- 导出；
- 移动；
- 复制；
- 移入回收站。

点击“编辑”进入编辑状态。点击“预览”立即执行保存刷新；成功后进入预览，失败则保留内存草稿并继续停留编辑状态。

## 8. 响应式编辑工具栏

编辑状态使用 `ComposableEditor` 的公开 `chromeless` appearance，Notera 在 Editor 外部使用 `@atlaskit/editor-toolbar` 公开组件重新组合主工具栏。表格、Media 等与当前节点相关的 Atlaskit 上下文工具栏继续保留。

工具栏动作通过 `usePreset()` 返回的公开 `editorApi` commands 和 `EditorActions` 执行，不读取私有 ProseMirror 状态，也不依赖 Atlassian 内部实验开关。

工具栏使用 `ResponsiveContainer` 的 Fullpage 容器断点：410、476、768 和 1024px。响应取决于中央工作区实际宽度，而不是窗口宽度，因此调整或折叠左侧导航会自动触发重排。

宽度大于 1024px 时顺序为：

```text
撤销 重做
| 文本样式
| 加粗 斜体 下划线 文字颜色 更多格式
| 链接
| 项目符号 编号 任务列表 列表
| 表格 Media Emoji
| Insert
```

逐级收纳规则：

- `≤1024px`：表格、Media、Emoji 移入 `Insert`；
- `≤768px`：项目符号、编号、任务列表移入“列表”，文字颜色移入“更多格式”；
- `≤476px`：链接移入 `Insert`，斜体和下划线移入“更多格式”；
- `≤410px`：加粗移入“更多格式”，保留撤销、重做、文本样式、更多格式、列表和 `Insert`。

菜单归属：

- 更多格式：加粗、斜体、下划线、删除线、行内代码、上标、下标、文字/高亮颜色、对齐、清除格式；
- 列表：项目符号、编号、任务列表、减少缩进、增加缩进；
- Insert：链接、表格、Media、Emoji、日期、分隔线、布局、面板、状态、代码块、数学公式、Mermaid。

同一动作在任一宽度只出现一次。工具栏不包含 Mention、Rovo、Pin Toolbar、语言选择器或演示用 appearance 切换。

## 9. Modal 产品设计

搜索、收藏、最近使用、回收站、历史、设置、导出和操作确认均使用 ADS Modal Dialog。Modal 打开时焦点进入对话框，关闭后返回触发元素。应用同一时刻只呈现一个主 Modal；Modal 内目录选择可使用 Popup。

### 9.1 搜索

- 打开时默认搜索全部笔记；
- 支持选择某个目录，范围包含该目录及全部子目录；
- 目录选择器使用 Popup 内的可展开目录树；
- 结果显示标题、目录、摘要和高亮；
- 使用“加载更多”进行分页；
- 每次重新打开都恢复为全部笔记范围；
- Unicode 高亮区间只生成 React 文本节点，不使用 `innerHTML`。

### 9.2 收藏与最近使用

- 收藏 Modal 显示收藏笔记列表，可打开笔记或取消收藏；
- 最近使用 Modal 显示最近访问的笔记并支持打开；
- 两者均采用分页加载，无多选和批量操作。

### 9.3 回收站

- 显示单个目录或笔记条目、删除时间和到期时间；
- 只支持单项恢复和永久删除；
- 原目录不存在时，恢复操作要求选择目标目录；
- 永久删除使用危险确认 Modal；
- 不提供清空回收站或批量操作 UI，过期清理由 Main 维护流程负责。

### 9.4 历史版本

创建版本 Modal 的名称默认填入当前本地时间，例如 `2026-08-27 14:35:22`。用户可在创建前修改，创建后名称不可更改。

- Renderer 不提供历史重命名或删除；
- 历史 Modal 左侧为版本列表，右侧为只读预览；
- 支持比较、复制和恢复；
- 比较默认使用当前版本与选中历史版本；
- 恢复前 Main 自动创建系统保护版本；
- 恢复成功后重新建立当前 `DocumentSession`。

### 9.5 设置

设置使用大型 Modal，分为“常规”和“Profile 与安全”。

常规设置：

- 主题：跟随系统、浅色、深色；
- 语言：简体中文、英文；
- 初始系统语言为中文时使用中文，否则使用英文；
- 切换后立即同步 Notera、ADS 和 Editor。

Profile 与安全：

- 自动锁定：1、5、15、30、60 分钟；
- 默认 15 分钟，不提供“永不”；
- Profile 重命名；
- 修改主密码；
- 立即锁定；
- 从设备移除。

设置中不提供直接切换 Profile。

### 9.6 导出

- 从笔记更多菜单打开导出 Modal；
- Markdown 和 PDF 使用 Radio 选择；
- 存在附件时自动打包 ZIP；
- 导出前明确提示目标文件已脱离 Notera 加密保护；
- 导出最近成功保存的当前版本；
- 编辑状态下先尽力保存，保存失败则明确提示并导出上一次成功版本；
- 开始后 Modal 转为 Progress Bar，阶段为准备、读取、渲染、写入、完成；
- 支持取消；
- 成功使用 Flag，有损节点使用 Warning；
- UI 不显示真实文件路径。

## 10. 目录与笔记操作对话框

- 新建目录：小型 Modal，名称为空时禁止提交；
- 重命名目录或笔记：小型 Modal，预填并选中当前名称；
- 移动目录或笔记：中型目录树选择 Modal，包含根目录；
- 移动目录时禁用自身及全部子目录，Main 仍执行目录环校验；
- 复制笔记：使用相同目录选择 Modal，成功后保留当前笔记；
- 移入回收站：危险确认 Modal，目录文案明确说明整个子树都会进入回收站。

当前正在编辑的笔记执行移动、复制或移入回收站前先保存。保存失败则中止操作并保留草稿。

操作成功后：

- 重命名或移动当前笔记时继续显示该笔记；
- 移入回收站后关闭当前笔记并显示未选择空状态；
- 移动当前笔记所在目录后同步更新面包屑；
- 新建笔记后展开目标目录并选中新笔记；
- 更新受影响树节点、面包屑和相关列表缓存。

## 11. 全局反馈、加载与空状态

保存状态固定为：`clean`、`dirty`、`saving`、`failed`，用户文案分别对应已保存、有未保存修改、保存中和保存失败。不设计本地版本冲突状态。

- 保存失败提供明确重试入口，不只依靠颜色表达；
- Modal 内操作失败使用就地错误并保留输入；
- 跨页面或后台完成结果使用 ADS Flag；
- 同一错误不同时显示 Flag 和就地错误；
- 不向用户显示堆栈、数据库细节、加密细节或真实路径。

启动、解锁等全局阻塞操作使用 Spinner。笔记、搜索和历史等内容加载保留应用外壳并使用 Skeleton。按钮提交期间显示加载状态并阻止重复提交。

未选择笔记、空树、空搜索、空收藏、空最近、空历史和空回收站分别使用对应 Empty State，不把无数据当作错误。

## 12. 未保存草稿离开规则

保存失败后，用户切换笔记、关闭窗口或手动锁定时，必须显示：

- 重试保存；
- 放弃修改并继续；
- 留在当前笔记。

系统锁屏、休眠和自动锁定以安全优先，不等待用户确认并立即关闭会话。若锁定事件到达时仍存在未保存草稿，Renderer 清除草稿并保留一个非敏感警告标记；下次解锁同一 Profile 后提示上次锁定时存在未保存修改。

## 13. Renderer 状态模型

采用 TanStack Query 与功能级 Reducer 的混合方案，并新增 `@tanstack/react-query` 直接依赖。

- `session`：启动、锁定、解锁中、已解锁、致命错误及当前 Profile 摘要；
- `queries`：目录、笔记、路径、搜索、收藏、最近、历史、回收站和设置等 Main 持久化数据；
- `navigation`：选中项、展开目录、左栏宽度和折叠状态；
- `documentSession`：当前笔记、最近成功保存快照、内存草稿、本地修订号、编辑/预览和保存状态；
- `overlay`：主 Modal、Popup、Dropdown 和确认流程；
- `operations`：导出等长任务的进度和取消状态；
- `preferences`：主题、语言和自动锁定时长。

笔记草稿不写入 Query 缓存。锁定后立即销毁 `documentSession`、清空当前 Profile 的 Query 域、关闭全部 Modal、撤销 Media 会话并清除操作状态。主题和语言作为设备级非敏感设置保留。

## 14. 组件边界

```text
App
├─ AppProviders
│  ├─ ADS AppProvider / Theme
│  ├─ IntlProvider
│  ├─ QueryClientProvider
│  └─ SessionProvider
├─ ProfileGate
│  ├─ ProfileAccessPage
│  └─ WorkspaceShell
│     ├─ ResizableNavigation
│     ├─ MainWorkspace
│     │  └─ NoteWorkspace
│     │     ├─ ResponsiveEditorToolbar
│     │     ├─ StickyNoteHeader
│     │     └─ EditorSurface / RendererSurface
│     └─ ModalHost
└─ GlobalFlagGroup
```

建议目录：

```text
src/renderer/
  app/
  platform/
  profile/
  navigation/
  notes/
  editor/
  search/
  favorites/
  recent/
  history/
  trash/
  settings/
  export/
  operations/
  shared-ui/
```

边界规则：

- 只有 `platform/notera-client` 访问 `window.notera`；
- Query hooks 和功能 controller 负责编排，纯 UI 组件不直接调用 IPC；
- `NoteWorkspace` 管理笔记生命周期，不包含 Atlaskit 内部实现；
- `editor/` 对外暴露 Editor、Renderer、动作接口和 Media Provider；
- 内容树只负责展示、展开和键盘交互，业务操作由 notes controller 执行；
- Math、Mermaid、Emoji 等现有有效适配迁移复用；
- 当前演示 `App.tsx` 和 editor wrapper 被产品结构替换。

## 15. IPC 数据流与契约调整

统一调用链：

```text
UI → controller/mutation → noteraClient → window.notera
   → Preload 输入校验 → Main 用例 → Preload 输出校验
   → 类型化结果/错误 → Query 或 DocumentSession
```

`noteraClient` 统一解包 `IpcResponse`，失败时抛出只包含安全错误码的 `NoteraClientError`。本地化文案由 Renderer 映射，不直接展示 Main 的英文固定消息。

需要补充或调整：

| 契约 | 目的 |
|---|---|
| `contentTree.getFolderPath({ folderId })` | 从搜索、收藏或最近打开笔记时构建面包屑 |
| `note.rename({ noteId, title })` | 无需读取整份 ADF 即可从树重命名笔记 |
| `noteDetail.isFavorite` | 直接打开笔记时显示正确收藏状态 |
| `searchResult.folderPath` | 搜索结果直接显示目录，避免逐条查询 |
| `settings.getDevice/updateDevice` | 锁定前后读取和保存主题、语言 |
| `settings.getProfile/updateProfile` | 读取和保存当前 Profile 自动锁定时长 |
| `profile.touchActivity()` | Renderer 节流报告用户活动，由 Main 管理空闲计时 |
| `app.closeRequested` / `app.completeClose` | 普通窗口关闭前执行异步保存与用户确认 |

Preload 白名单保持现状，不因本项目删除 `profile.switch`、标签、批量、历史重命名、收藏排序、回收站维护或附件相关已有方法。新增契约按相同 schema 校验规则接入。

## 16. 本地单写入者与保存协调器

当前产品没有多窗口、同步或外部写入者，因此普通编辑采用本地单写入者模型，不设计本地内容版本冲突产品流程。

`DocumentSession` 记录：

- `draftRevision`：标题或正文变化时递增；
- `savedRevision`：最近成功保存的本地修订；
- 最近成功保存的标题、ADF、`contentVersion` 和时间；
- 当前内存标题和 ADF；
- `clean / dirty / saving / failed`。

保存规则：

- 停止输入约 1 秒后自动保存；
- 同一笔记最多一个 `note.saveDraft` 在途请求；
- 保存期间继续编辑不会错误标记为已保存；
- 保存成功后若当前修订更新，继续安排下一次保存；
- `flush()` 取消 debounce、等待在途请求并保存至最新修订；
- 手动保存、预览、创建版本、切换笔记和危险操作调用 `flush()`；
- 保存失败保留完整内存草稿，Profile 锁定后停止重试。

`note.saveDraft` 不再要求 `expectedContentVersion`。所有当前笔记内容保存、重命名和历史恢复都通过同一协调器串行执行，Main 原子递增 `contentVersion`。永久历史功能继续使用 `contentVersion` 作为内部标识，但 Renderer 不提供本地冲突 UI。

旧笔记加载请求即使较晚返回，也不能覆盖后来选中的笔记；Query key 和当前选择令牌共同阻止这一竞态。

## 17. Query key 与一致性

所有 Profile 数据 Query key 都以 `localProfileId` 开头：

```text
profile/{id}/tree/{folderId}
profile/{id}/note/{noteId}
profile/{id}/path/{folderId}
profile/{id}/search/{query}/{folderId?}
profile/{id}/favorites
profile/{id}/recent
profile/{id}/history/{noteId}
profile/{id}/trash
profile/{id}/settings
```

Mutation 成功响应负责即时更新，定向 Query 失效负责最终校准。当前编辑草稿不接受后台刷新覆盖。危险删除不做乐观更新。

- 新建直接写入目标目录缓存；
- 移动刷新源目录、目标目录和路径；
- 收藏同步更新笔记详情与收藏列表；
- 历史恢复重新读取笔记并重建 `DocumentSession`；
- 回收站恢复刷新回收站和目标目录；
- `PROFILE_LOCKED` 从任何功能出现时都升级为会话关闭处理。

## 18. 导出与长任务事件

`operation.progress` 和 `operation.completed` 在应用根部只订阅一次。`export.startNote` 返回 `operationId` 后，Renderer 立即登记任务并调用一次 `operation.getStatus`，避免任务过快完成造成事件竞态。

事件只更新匹配的 `operationId`。关闭导出 Modal 不取消任务；只有用户点击取消才调用 `operation.cancel`。锁定 Profile 时 Renderer 清除任务状态，Main 负责取消实际任务并清理未完成明文输出。

## 19. Profile 设置与自动锁定

启动时并行读取设备设置、Profile 列表和会话状态。主题和语言是设备级非敏感设置，自动锁定时长是当前 Profile 设置。

Renderer 监听键盘、指针、滚动和窗口聚焦等有效活动，以约 10 秒上限节流调用 `profile.touchActivity()`。Main 持有空闲计时器并在设置更新后立即重置。

系统锁屏和休眠由 Electron `powerMonitor` 直接触发。`profile.locked` 是最终权威事件；收到后即使 Renderer 仍认为已解锁，也必须立即清除内容并返回锁定页。

普通窗口关闭流程：

1. Main 拦截关闭并发送带 `requestId` 的 `app.closeRequested`；
2. Renderer 无未保存修改时直接确认；
3. 有未保存修改时先保存，失败则显示三选项确认；
4. Renderer 调用 `app.completeClose` 继续或取消；
5. 系统关机、崩溃和强制终止不承诺完成异步交互。

## 20. Atlaskit Media 生产适配

现有 `src/main/demo-media` 是明文演示服务，不得进入生产流程。生产实现继续提供 Atlaskit Media REST 接口，使 Editor 和 ReactRenderer 使用公开 `MediaProvider`，同时把数据交给 Notera 加密附件服务。

```text
Atlaskit Editor / ReactRenderer
→ note-scoped MediaProvider
→ 127.0.0.1 随机端口 Media Adapter
→ LocalAttachmentsService
→ SQLCipher 元数据 + 加密 Blob
```

安全与生命周期：

- 服务只监听 loopback 随机端口；
- Media 会话绑定 Profile、笔记和高熵随机令牌；
- 严格验证授权、Origin、Profile 会话和笔记范围；
- CORS 不使用通配符；
- 锁定时撤销全部令牌并中止上传和读取；
- 读取按需解密并支持 Range，不创建长期明文临时文件；
- 100 MB 限制在 Adapter 和 Application 两层执行。

数据一致性：

- Atlaskit Media ID 直接作为 Notera `attachmentId`；
- 上传完成但 ADF 尚未保存时使用短期上传引用；
- `note.saveDraft` 从成功保存的 ADF 提取 Media ID，在同一数据库事务更新当前笔记附件引用；
- 从正文移除节点时不由 Media Adapter 抢先永久删除 Blob；
- 成功保存后无引用密文由现有 GC 清理；
- 放弃编辑或锁定后，短期上传引用由恢复/GC 清理；
- 历史、复制和回收站继续使用现有附件引用协调器。

生产切换后，`main.ts` 不再启动 `src/main/demo-media`；固定 token、明文 Store 和演示数据目录不进入打包产物。Editor 和 ReactRenderer 在同一笔记会话内共享生产 Provider。

## 21. 错误处理与隐私

- `SAVE_FAILED`、`DISK_FULL` 和普通 IPC 失败保留草稿并显示未保存；
- `WRONG_PASSWORD` 只显示错误密码，不区分底层认证细节；
- `PROFILE_LOCKED` 统一关闭 Renderer 会话；
- `ENTITY_NOT_FOUND` 刷新相关列表，并在当前笔记消失时回到未选择状态；
- Media 缺失或损坏不阻止笔记其他内容阅读；
- 错误日志只记录固定错误码、随机操作 ID、耗时和非敏感计数；
- 禁止日志记录 Profile 密码、标题、正文、ADF、目录名、搜索词、附件名、MIME、真实路径、Media token 或完整 IPC 参数。

## 22. 键盘与可访问性

- `Ctrl/Cmd + J` 打开全局搜索；
- `Ctrl/Cmd + S` 在编辑状态立即保存；
- `Escape` 关闭最上层 Popup、Dropdown 或 Modal，不放弃编辑内容；
- 内容树支持方向键、左右展开/折叠、Enter 打开、`Shift + F10` 或菜单键打开上下文菜单；
- 不定义与 Atlaskit Editor 内置快捷键冲突的全局快捷键；
- 图标按钮必须有可本地化 accessible label 和 Tooltip；
- 保存状态、编辑/预览切换和错误通过 live region 宣告；
- 导航调整宽度支持键盘并暴露宽度及折叠状态；
- 响应式工具栏焦点顺序与视觉顺序一致；
- 使用 ADS Tokens 保证对比度、焦点环、主题和 reduced motion；
- 中英文切换同步更新可见文案、辅助文案和无障碍名称。

## 23. 测试策略

测试与对应功能模块一起实现，以逻辑和单元测试为主。

Renderer 单元和组件测试覆盖：

- IPC 解包、错误码和锁定升级；
- Query Profile 隔离、分页、定向更新和失效；
- 保存 debounce、串行、继续输入、`flush()`、失败保留和加载竞态；
- Profile 创建、解锁、锁定、自动锁定和状态清除；
- 内容树加载、键盘、右键、hover/焦点行内按钮、两种菜单入口一致性、创建上下文和移动约束；
- 搜索、历史、回收站、设置和导出 Modal；
- 中英文、主题和系统语言回退；
- 焦点、accessible label、tree 语义和 live region；
- 四个工具栏断点的动作顺序、互斥和可达性；
- Editor/Renderer 的 ADF、Math、Mermaid、Emoji 和 Media 一致性。

IPC/Main 测试覆盖新增路径、设置、活动、窗口关闭契约，单写入者保存顺序、自动锁定和 Preload 绑定。

Media 测试覆盖 loopback、Origin、令牌范围与撤销、大小限制、取消与补偿、加密落盘、Media ID、Range、Profile 隔离、ADF 引用事务和 demo media 生产移除。

每个完整功能模块只运行相关测试并独立提交。所有模块完成后统一运行一次相关测试全集，并按实际需要运行 typecheck、ADS/项目 lint 和 production build；不在各模块后重复执行全量验证。

## 24. 完成标准

- 用户无需网络即可完成全部本地产品流程；
- UI 中不存在标签、批量或附件管理入口；
- 左侧导航可调整、可折叠，中央工作区占据剩余空间；
- 已有笔记默认预览，新建笔记默认编辑；
- 自动保存、预览切换和离开守卫不会静默丢失草稿；
- 搜索支持目录及全部子目录范围；
- 历史名称创建后不可修改，历史不可删除；
- 自动锁定没有“永不”，系统锁屏和休眠立即关闭会话；
- 主题、中文和英文同步作用于 Notera、ADS 和 Editor；
- Atlaskit Media 使用 Notera 加密附件能力，生产构建不启动 demo media；
- Renderer 不接触数据库、密钥、Node API 或真实文件路径；
- Profile 锁定后 Renderer 缓存、ADF、Media token 和长任务状态均被清除；
- 相关测试、typecheck、lint 和 production build 在最终统一验证中通过。
