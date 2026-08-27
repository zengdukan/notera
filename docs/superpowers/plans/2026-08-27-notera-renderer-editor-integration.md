# Notera Renderer 与编辑器集成实施计划

> **执行要求：** 使用 `superpowers:executing-plans` 在当前会话按完整功能模块顺序实施。遵守仓库 `AGENTS.md`：不使用子代理或重复审核；每个模块把测试与实现一起完成并提交；所有模块完成后只执行一次必要的最终验证。

**目标：** 交付一个完整、纯离线、完全采用 Atlassian Design System 的 Notera Renderer 产品，使用户能够完成 Profile、安全生命周期、内容组织、笔记编辑与预览、搜索、收藏、历史、回收站、导出和加密 Media 全流程。

**架构：** Renderer 使用 TanStack Query 保存 Main 持久化事实的查询缓存，使用功能级 Reducer 管理会话、导航、当前文档、浮层和长任务；只有 `platform/notera-client` 可以访问 `window.notera`。Main 与加密数据库继续作为唯一持久化事实来源，并补充设置、活动、关闭握手、路径和重命名契约；Atlaskit Media 通过仅监听 loopback 的 note-scoped Adapter 接入现有加密附件服务。

**技术栈：** Electron、React 18、TypeScript、TanStack Query 5、React Intl、Atlassian Design System、Atlaskit Editor/Renderer、Zod、Jest、Testing Library、SQLCipher、Notera Application/Domain/Storage packages。

**产品规格：** `docs/superpowers/specs/2026-08-27-notera-renderer-editor-integration-design.md`

---

## 实施边界与顺序

- 按下列九个完整功能模块顺序实施；后续模块可以消费前序模块已经稳定的接口，但不得先放置无实际行为的实现。
- 每个模块先在同一工作单元内补齐相关测试，再实现功能并只运行该模块列出的测试；测试和实现只提交一次。
- 每个模块完成时，在同一次提交中把产品规格第 25 节对应状态从 `[ ]` 更新为 `[x]`。
- Preload 保留现有白名单能力；不删除 `profile.switch`、标签、批量、历史重命名、收藏排序、回收站维护或附件相关已有 API，但 Renderer 不提供这些产品入口。
- 不实现标签 UI、批量 UI、附件管理 UI、拖放、树内重命名、树空白右键菜单、多窗口编辑或任何同步能力。
- `D:\programs\atlassian-frontend-mirror` 只作为响应式 Fullpage Toolbar 的本地只读参考，不纳入 Notera 提交。

---

## 功能模块 1：Renderer 基础与 ADS 应用外壳

**目标与功能逻辑**

把当前演示入口替换为产品级应用基础，建立后续所有模块共享的 Provider、类型化 IPC 客户端、Profile 隔离查询缓存、会话根状态、唯一 Modal Host 和全局 Flag Host。所有可见基础 UI 使用 ADS 组件、Primitives、Icons 与 Tokens，不引入第二套组件库。

应用启动时并行请求设备设置、Profile 列表和 Session 状态。主题与语言可在锁定状态保留；所有 Profile 数据的 Query key 必须以 `localProfileId` 开头。任何请求返回 `PROFILE_LOCKED` 时，`noteraClient` 发布统一会话失效信号，而不是让各页面自行处理。锁定清理接口一次性清除当前 Profile Query、文档、浮层和长任务域，但不清除设备主题与语言。

`AppProviders` 固定组合 ADS `AppProvider`、`IntlProvider`、`QueryClientProvider` 和 `SessionProvider`。`ModalHost` 同一时刻只渲染一个主 Modal；Popup 和 Dropdown 仍由所属功能管理。`GlobalFlagGroup` 只承接跨页面结果，同一错误不得同时显示就地错误和 Flag。

**关键接口与状态**

```ts
class NoteraClientError extends Error {
  readonly code: IpcErrorCode;
}

interface NoteraClient {
  request<Key extends RequestKey>(
    key: Key,
    input: RequestInput<Key>,
  ): Promise<RequestData<Key>>;
  subscribe<Key extends EventKey>(
    key: Key,
    listener: (payload: EventPayload<Key>) => void,
  ): () => void;
}

type SessionState =
  | { status: 'booting' }
  | { status: 'locked'; discardedDraftProfileId?: string }
  | { status: 'unlocking'; localProfileId: string }
  | { status: 'unlocked'; profile: UnlockedSession }
  | { status: 'fatal'; code: IpcErrorCode };

type OverlayState =
  | { kind: 'none' }
  | { kind: 'search' | 'favorites' | 'recent' | 'trash' | 'settings' }
  | { kind: 'note-operation'; operation: NoteOperation };
```

Query key 工厂只导出命名函数：`treeKey(profileId, folderId)`、`noteKey(profileId, noteId)`、`folderPathKey(profileId, folderId)`、`searchKey(profileId, query, folderId?)`、`favoritesKey(profileId)`、`recentKey(profileId)`、`historyKey(profileId, noteId)`、`trashKey(profileId)` 和 `profileSettingsKey(profileId)`。禁止在组件中手写数组 key。

**涉及文件**

- 修改：`package.json`
- 修改：`package-lock.json`
- 重构：`src/renderer/App.tsx`
- 修改：`src/renderer/index.tsx`
- 新建：`src/renderer/app/AppProviders.tsx`
- 新建：`src/renderer/app/AppShell.tsx`
- 新建：`src/renderer/app/session.tsx`
- 新建：`src/renderer/app/overlay.ts`
- 新建：`src/renderer/app/query-client.ts`
- 新建：`src/renderer/app/query-keys.ts`
- 新建：`src/renderer/app/operations.ts`
- 新建：`src/renderer/app/i18n.ts`
- 新建：`src/renderer/app/messages/en.ts`
- 新建：`src/renderer/app/messages/zh-CN.ts`
- 新建：`src/renderer/platform/notera-client.ts`
- 新建：`src/renderer/platform/notera-events.ts`
- 新建：`src/renderer/shared-ui/ModalHost.tsx`
- 新建：`src/renderer/shared-ui/GlobalFlagGroup.tsx`
- 新建：`src/renderer/shared-ui/feedback.ts`
- 新建测试：`src/renderer/platform/__tests__/notera-client.test.ts`
- 新建测试：`src/renderer/app/__tests__/query-client.test.ts`
- 新建测试：`src/renderer/app/__tests__/query-keys.test.ts`
- 新建测试：`src/renderer/app/__tests__/session.test.tsx`
- 新建测试：`src/renderer/app/__tests__/i18n.test.tsx`
- 新建测试：`src/renderer/app/__tests__/AppShell.test.tsx`
- 修改状态：`docs/superpowers/specs/2026-08-27-notera-renderer-editor-integration-design.md`

`package.json` 增加本产品直接使用的依赖并更新锁文件：`@tanstack/react-query`、`@atlaskit/app-provider`、`@atlaskit/navigation-system`、`@atlaskit/primitives`、`@atlaskit/breadcrumbs`、`@atlaskit/editor-toolbar`、`@atlaskit/empty-state`、`@atlaskit/flag`、`@atlaskit/form`、`@atlaskit/menu`、`@atlaskit/popup`、`@atlaskit/progress-bar`、`@atlaskit/radio`、`@atlaskit/section-message`、`@atlaskit/select`、`@atlaskit/skeleton`、`@atlaskit/spinner`、`@atlaskit/tabs` 和 `@atlaskit/textfield`。安装时使用仓库锁定规则生成实际兼容版本，不手改 `package-lock.json`。

**单元与组件测试**

- `noteraClient` 严格解包成功响应，只抛出安全错误码，并把 `PROFILE_LOCKED` 升级为一次会话失效通知。
- 事件订阅校验 payload，取消订阅后不再派发；不暴露任意 channel 或 `ipcRenderer`。
- Query key 对不同 Profile、目录、笔记、查询词和搜索范围严格隔离；锁定只移除目标 Profile 数据。
- Session reducer 在解锁、锁定和致命错误间转换确定；锁定清除敏感子状态并仅保留非敏感的丢弃草稿标记。
- 中英文消息完整覆盖应用基础文案；中文系统语言回退到中文，其他语言回退到英文。
- App 外壳启动并行加载，阻塞态使用 ADS Spinner，局部加载接口使用 Skeleton；Modal Host 保证唯一主 Modal，Flag 与就地错误不重复。

**精确测试命令**

```powershell
npm test -- --runInBand src/renderer/platform/__tests__/notera-client.test.ts src/renderer/app/__tests__/query-client.test.ts src/renderer/app/__tests__/query-keys.test.ts src/renderer/app/__tests__/session.test.tsx src/renderer/app/__tests__/i18n.test.tsx src/renderer/app/__tests__/AppShell.test.tsx
```

预期：列出的 6 个测试文件全部通过，0 个失败；测试中 `console.error` 不出现未处理的 React 或 IPC 错误。

**完成后的提交**

```powershell
git add package.json package-lock.json src/renderer/App.tsx src/renderer/index.tsx src/renderer/app src/renderer/platform src/renderer/shared-ui docs/superpowers/specs/2026-08-27-notera-renderer-editor-integration-design.md
git commit -m "feat(renderer): establish ADS application foundation"
```

---

## 功能模块 2：Profile、设置与安全生命周期

**目标与功能逻辑**

实现 Profile 同页选择与解锁、右侧创建表单、锁定入口和完整设置 Modal，并把活动上报、可配置自动锁定、系统锁屏/休眠、普通窗口关闭握手与 Renderer 清理串成统一安全生命周期。

锁定页左侧为分页 Profile 列表，标题右侧为创建按钮；右侧显示当前 Profile 解锁表单或创建表单。创建不打开 Modal、没有取消按钮，点击任意 Profile 返回解锁表单；没有 Profile 时默认创建。主界面 Profile 区只显示当前名称和锁定按钮，不提供切换按钮。切换 Profile 必须锁定后重新选择。

设置 Modal 分为“常规”和“Profile 与安全”。设备设置保存 `SYSTEM/LIGHT/DARK` 主题和 `zh-CN/en` 语言，锁定前后可读；Profile 设置保存 `1/5/15/30/60` 分钟自动锁定，默认 15 且没有“永不”。Profile 安全操作包括重命名、修改密码、立即锁定和从设备移除；密码请求完成后立即清空局部表单状态。

Renderer 对 `keydown`、`pointerdown`、`scroll` 和 `focus` 进行合并，以不超过每 10 秒一次的频率调用 `profile.touchActivity({})`。Main 记录最后活动时间并依据当前 Profile 设置重置计时器，不再以 `powerMonitor.getSystemIdleTime()` 作为普通自动锁定依据；`lock-screen` 和 `suspend` 仍立即锁定。`profile.locked` 是最终权威事件，收到后无条件清除 Profile Query、ADF、Modal、Media 会话引用和长任务状态。

普通窗口关闭由 Main 拦截并发布带 `requestId` 的 `app.closeRequested`。Renderer 无未保存草稿时立即 `app.completeClose({action:'proceed'})`；有草稿时先调用文档离开守卫，最终选择继续关闭或取消。系统关机、崩溃和强制结束不进入该异步承诺。

**关键 IPC 与持久化接口**

```ts
type ThemePreference = 'SYSTEM' | 'LIGHT' | 'DARK';
type LanguagePreference = 'zh-CN' | 'en';
type AutoLockMinutes = 1 | 5 | 15 | 30 | 60;

settings.getDevice({})
  -> { theme: ThemePreference; language: LanguagePreference }
settings.updateDevice({ theme?, language? })
  -> { theme: ThemePreference; language: LanguagePreference }
settings.getProfile({})
  -> { autoLockMinutes: AutoLockMinutes }
settings.updateProfile({ autoLockMinutes })
  -> { autoLockMinutes: AutoLockMinutes }
profile.touchActivity({}) -> {}

app.closeRequested event -> { requestId: string }
app.completeClose({ requestId, action: 'proceed' | 'cancel' }) -> {}
```

`PreferencesStore` 使用原子替换维护一个版本化、严格解码的非敏感设置文件；设备设置独立于 Profile，Profile 自动锁定设置以 `localProfileId` 分区，删除 Profile 时同步删除其设置。损坏设置文件回退到安全默认值并只记录固定错误码，不将原始 JSON 写入日志。

**涉及文件**

- 新建：`src/shared/ipc/contracts/settings.ts`
- 新建：`src/shared/ipc/contracts/app.ts`
- 修改：`src/shared/ipc/contracts/profile.ts`
- 修改：`src/shared/ipc/registry.ts`
- 修改：`src/shared/ipc/api.ts`
- 修改：`src/main/preload.ts`
- 修改：`src/renderer/preload.d.ts`
- 修改：`packages/application/src/paths.ts`
- 新建：`packages/application/src/preferences.ts`
- 修改：`packages/application/src/manager.ts`
- 修改：`packages/application/src/types.ts`
- 修改：`packages/application/src/index.ts`
- 新建：`src/main/ipc/settings-handlers.ts`
- 修改：`src/main/ipc/profile-handlers.ts`
- 修改：`src/main/lifecycle/auto-lock.ts`
- 修改：`src/main/lifecycle/session-lock.ts`
- 新建：`src/main/lifecycle/window-close.ts`
- 修改：`src/main/runtime.ts`
- 修改：`src/main/window.ts`
- 修改：`src/main/main.ts`
- 新建：`src/renderer/profile/ProfileGate.tsx`
- 新建：`src/renderer/profile/ProfileAccessPage.tsx`
- 新建：`src/renderer/profile/ProfileList.tsx`
- 新建：`src/renderer/profile/CreateProfileForm.tsx`
- 新建：`src/renderer/profile/UnlockProfileForm.tsx`
- 新建：`src/renderer/profile/profile-controller.ts`
- 新建：`src/renderer/profile/activity-reporter.ts`
- 新建：`src/renderer/profile/close-guard.ts`
- 新建：`src/renderer/settings/SettingsModal.tsx`
- 新建：`src/renderer/settings/GeneralSettings.tsx`
- 新建：`src/renderer/settings/ProfileSecuritySettings.tsx`
- 新建：`src/renderer/settings/settings-queries.ts`
- 修改：`src/renderer/app/session.tsx`
- 修改：`src/renderer/app/AppShell.tsx`
- 修改测试：`src/shared/ipc/__tests__/registry.test.ts`
- 新建测试：`src/shared/ipc/__tests__/settings-app-contracts.test.ts`
- 修改测试：`src/__tests__/preload.test.ts`
- 新建测试：`packages/application/src/__tests__/preferences.test.ts`
- 修改测试：`packages/application/src/__tests__/manager.test.ts`
- 修改测试：`src/main/lifecycle/__tests__/auto-lock.test.ts`
- 修改测试：`src/main/lifecycle/__tests__/session-lock.test.ts`
- 新建测试：`src/main/lifecycle/__tests__/window-close.test.ts`
- 新建测试：`src/main/ipc/__tests__/settings-handlers.test.ts`
- 修改测试：`src/main/ipc/__tests__/profile-handlers.test.ts`
- 修改测试：`src/main/__tests__/runtime.test.ts`
- 修改测试：`src/main/__tests__/window.test.ts`
- 新建测试：`src/renderer/profile/__tests__/ProfileAccessPage.test.tsx`
- 新建测试：`src/renderer/profile/__tests__/activity-reporter.test.ts`
- 新建测试：`src/renderer/profile/__tests__/close-guard.test.ts`
- 新建测试：`src/renderer/settings/__tests__/SettingsModal.test.tsx`
- 修改状态：`docs/superpowers/specs/2026-08-27-notera-renderer-editor-integration-design.md`

**单元、组件与 Main 测试**

- 创建、选择、错误密码、解锁、重新锁定和无 Profile 初始状态符合同页交互；创建表单无 Modal 和取消按钮。
- 设备设置锁定前后可读，Profile 设置只在解锁 Gate 内可读写；非法主题、语言和自动锁定分钟被契约拒绝。
- 语言和主题切换立即同步 Notera、ADS 与 Editor 国际化上下文；Profile 重命名、改密和移除保留输入错误并清空密码。
- 活动事件 10 秒节流，自动锁定按最新 Profile 设置重置；锁屏和休眠不等待 Renderer 立即锁定。
- `profile.locked` 清除 Profile 数据且只保留非敏感丢弃草稿标记；手动锁定使用离开守卫，系统锁定不弹确认。
- Close request ID 只能完成一次，旧 ID 和重复完成被拒绝；取消保持窗口，继续关闭只触发一次真实关闭。
- Registry、Preload、Runtime 对新增请求和事件一一绑定，同时现有白名单方法仍然存在。

**精确测试命令**

```powershell
npm test -- --runInBand src/shared/ipc/__tests__/settings-app-contracts.test.ts src/shared/ipc/__tests__/registry.test.ts src/__tests__/preload.test.ts packages/application/src/__tests__/preferences.test.ts packages/application/src/__tests__/manager.test.ts src/main/lifecycle/__tests__/auto-lock.test.ts src/main/lifecycle/__tests__/session-lock.test.ts src/main/lifecycle/__tests__/window-close.test.ts src/main/ipc/__tests__/settings-handlers.test.ts src/main/ipc/__tests__/profile-handlers.test.ts src/main/__tests__/runtime.test.ts src/main/__tests__/window.test.ts src/renderer/profile/__tests__/ProfileAccessPage.test.tsx src/renderer/profile/__tests__/activity-reporter.test.ts src/renderer/profile/__tests__/close-guard.test.ts src/renderer/settings/__tests__/SettingsModal.test.tsx
```

预期：列出的 16 个测试文件全部通过，0 个失败；测试不创建真实 BrowserWindow、不弹系统对话框、不记录密码或设置原始内容。

**完成后的提交**

```powershell
git add src/shared/ipc src/main src/renderer/profile src/renderer/settings src/renderer/app/session.tsx src/renderer/app/AppShell.tsx src/renderer/preload.d.ts src/__tests__/preload.test.ts packages/application/src docs/superpowers/specs/2026-08-27-notera-renderer-editor-integration-design.md
git commit -m "feat(renderer): add profile settings and secure lifecycle"
```

---

## 功能模块 3：左侧导航、内容树与内容操作

**目标与功能逻辑**

实现可调整宽度、可折叠的 ADS 左侧导航、无限层级目录与笔记混合树，以及目录/笔记的创建、重命名、移动、复制和移入回收站流程。左栏顺序固定为 Profile 与锁定、搜索与新建、收藏、最近、回收站、设置、内容树；中央工作区始终占据剩余空间。

全局 `+` 根据当前选择在根目录、选中目录或选中笔记所属目录创建笔记/目录。新建笔记持久化空标题并选中，后续笔记工作区直接进入编辑且标题获得焦点；新建目录使用非空名称小型 Modal。

树子节点按需分页。目录行 hover 或键盘焦点进入时显示 `+` 和扩展按钮；`+` 只弹“新建笔记/新建子目录”，扩展按钮与右键共享目录菜单。笔记行 hover 或聚焦显示扩展按钮，与右键共享笔记菜单。按钮点击必须阻止树行选择/展开；菜单打开期间按钮保持可见。空白区域无右键菜单。

统一 `contentActions` 定义动作顺序、可见性、禁用条件、accessible label 和 controller；右键与扩展按钮只传入不同 anchor，不维护两套菜单。树实现 `role=tree/treeitem`、方向键、左右展开/折叠、Enter 打开、`Shift+F10`/菜单键、焦点恢复和标题省略。

**关键接口**

```ts
contentTree.getFolderPath({ folderId })
  -> { items: Array<{ id: string; name: string }> }
note.rename({ noteId, title }) -> NoteSummary

interface NoteMutationGuard {
  flushBefore(operation: 'move' | 'copy' | 'trash'): Promise<'ready' | 'blocked'>;
}

type ContentActionId =
  | 'open' | 'create-note' | 'create-folder' | 'rename'
  | 'move' | 'copy' | 'toggle-favorite' | 'export' | 'trash';
```

目录选择器包含根目录。移动目录时 Renderer 禁用自身及所有子目录，Main 仍执行 `FOLDER_CYCLE` 校验。移动、复制或移入回收站当前笔记前调用 `NoteMutationGuard`；保存失败则中止操作。Mutation 成功后定向更新或失效源/目标树、路径和相关列表，危险删除不做乐观更新。

**涉及文件**

- 修改：`src/shared/ipc/contracts/content-tree.ts`
- 修改：`src/shared/ipc/contracts/note.ts`
- 修改：`src/shared/ipc/registry.ts`
- 修改：`src/shared/ipc/api.ts`
- 修改：`src/main/preload.ts`
- 修改：`src/renderer/preload.d.ts`
- 修改：`packages/application/src/local-notes/types.ts`
- 修改：`packages/application/src/local-notes/folders.ts`
- 修改：`packages/application/src/local-notes/notes.ts`
- 修改：`packages/application/src/local-notes/service.ts`
- 修改：`src/main/ipc/local-notes-handlers.ts`
- 新建：`src/renderer/navigation/ResizableNavigation.tsx`
- 新建：`src/renderer/navigation/NavigationHeader.tsx`
- 新建：`src/renderer/navigation/navigation-reducer.ts`
- 新建：`src/renderer/navigation/ContentTree.tsx`
- 新建：`src/renderer/navigation/ContentTreeRow.tsx`
- 新建：`src/renderer/navigation/tree-keyboard.ts`
- 新建：`src/renderer/navigation/tree-queries.ts`
- 新建：`src/renderer/navigation/content-actions.tsx`
- 新建：`src/renderer/navigation/content-controller.ts`
- 新建：`src/renderer/notes/note-mutation-guard.ts`
- 新建：`src/renderer/notes/CreateFolderModal.tsx`
- 新建：`src/renderer/notes/RenameContentModal.tsx`
- 新建：`src/renderer/notes/FolderPicker.tsx`
- 新建：`src/renderer/notes/MoveContentModal.tsx`
- 新建：`src/renderer/notes/TrashContentModal.tsx`
- 修改：`src/renderer/app/AppShell.tsx`
- 修改测试：`src/shared/ipc/__tests__/organization-contracts.test.ts`
- 修改测试：`src/__tests__/preload.test.ts`
- 修改测试：`packages/application/src/__tests__/local-notes-folders.test.ts`
- 修改测试：`packages/application/src/__tests__/local-notes-notes.test.ts`
- 修改测试：`src/main/ipc/__tests__/local-notes-handlers.test.ts`
- 新建测试：`src/renderer/navigation/__tests__/navigation-reducer.test.ts`
- 新建测试：`src/renderer/navigation/__tests__/ContentTree.test.tsx`
- 新建测试：`src/renderer/navigation/__tests__/content-actions.test.tsx`
- 新建测试：`src/renderer/navigation/__tests__/content-controller.test.ts`
- 新建测试：`src/renderer/notes/__tests__/FolderPicker.test.tsx`
- 新建测试：`src/renderer/notes/__tests__/content-modals.test.tsx`
- 修改状态：`docs/superpowers/specs/2026-08-27-notera-renderer-editor-integration-design.md`

**单元与组件测试**

- `getFolderPath` 返回从根到目标的稳定路径，缺失目录失败；`note.rename` 不读取或回传 ADF。
- 导航宽度限制、键盘调整、折叠/展开与中央区域伸缩确定；折叠后隐藏树但保留主要图标入口。
- 全局新建上下文对根、目录和笔记三种选择正确；新建笔记空标题，新建目录拒绝空白。
- 无限树分页、展开缓存、选择、键盘导航和 tree 语义正确；旧分页响应不能写入错误父节点。
- 目录 hover/焦点显示两个按钮，笔记只显示扩展按钮；按钮不触发行事件，菜单打开保持显示。
- 目录和笔记的右键/扩展入口返回同一动作 ID、顺序、禁用状态和 controller 调用；树空白右键无行为。
- 移动目录禁用自身和后代，Main 环校验保留；保存守卫失败时移动/复制/回收站 Mutation 不执行。
- 成功操作只刷新受影响的树、路径和列表缓存；当前笔记移入回收站后清除选择。

**精确测试命令**

```powershell
npm test -- --runInBand src/shared/ipc/__tests__/organization-contracts.test.ts src/__tests__/preload.test.ts packages/application/src/__tests__/local-notes-folders.test.ts packages/application/src/__tests__/local-notes-notes.test.ts src/main/ipc/__tests__/local-notes-handlers.test.ts src/renderer/navigation/__tests__/navigation-reducer.test.ts src/renderer/navigation/__tests__/ContentTree.test.tsx src/renderer/navigation/__tests__/content-actions.test.tsx src/renderer/navigation/__tests__/content-controller.test.ts src/renderer/notes/__tests__/FolderPicker.test.tsx src/renderer/notes/__tests__/content-modals.test.tsx
```

预期：列出的 11 个测试文件全部通过，0 个失败；两种菜单入口的动作矩阵完全相等。

**完成后的提交**

```powershell
git add src/shared/ipc src/main/preload.ts src/main/ipc/local-notes-handlers.ts src/renderer/preload.d.ts src/renderer/app/AppShell.tsx src/renderer/navigation src/renderer/notes packages/application/src/local-notes src/__tests__/preload.test.ts docs/superpowers/specs/2026-08-27-notera-renderer-editor-integration-design.md
git commit -m "feat(renderer): add navigation tree and content actions"
```

---

## 功能模块 4：笔记工作区与 Atlaskit 编辑器集成

**目标与功能逻辑**

实现当前笔记 `DocumentSession`、单窗口单写入者保存协调器、默认预览/显式编辑、自定义两层 sticky 工作区头部、响应式外部工具栏，以及 Atlaskit Editor/ReactRenderer 的一致 ADF 渲染。迁移并保留现有 Math、Mermaid、Emoji 能力，删除演示用 appearance、语言选择器和内置主工具栏行为。

已有笔记默认预览，新建笔记直接编辑。标题与面包屑同一行；右侧依次为保存状态、收藏、编辑/预览主操作和更多菜单。更多菜单只包含创建版本、历史、导出、移动、复制和移入回收站。编辑状态显示外部响应式工具栏和 `ComposableEditor appearance="chromeless"`；预览状态使用 `ReactRenderer`。

`DocumentSession` 只保存内存草稿，不写 Query 缓存。标题或 ADF 变化递增 `draftRevision`；停止输入约 1 秒保存，同一笔记最多一个请求在途，继续输入会在当前保存后再次排队。`flush()` 取消 debounce、等待在途保存并保存最新修订。预览、Ctrl/Cmd+S、创建版本、切换笔记和危险操作调用 `flush()`。失败保留完整草稿和明确重试入口；点击预览保存失败时仍处于编辑。

当前笔记保存、树重命名和历史恢复通过 `NoteWriteCoordinator` 串行。`note.saveDraft` 删除 `expectedContentVersion` 和 `CONTENT_VERSION_CONFLICT`，Main 在事务中读取当前版本并原子递增。保存成功只在响应对应的本地 revision 仍是最新时标记 clean；旧笔记的迟到加载结果不得覆盖后来选择。

工具栏以中央工作区容器宽度为准，使用 `ResponsiveContainer` 的 410、476、768、1024px Fullpage 断点。宽屏顺序和逐级收纳严格遵循产品规格第 8 节；同一动作在任一宽度只出现一次。动作通过公开 `editorApi` commands 与 `EditorActions`，不得读取私有 ProseMirror 状态或实验开关。Mention、Rovo、Pin、语言选择器和 appearance 切换不出现。

**关键状态与接口**

```ts
type SaveState = 'clean' | 'dirty' | 'saving' | 'failed';

interface DocumentSessionState {
  noteId: string;
  mode: 'preview' | 'edit';
  draftRevision: number;
  savedRevision: number;
  draft: { title: string; document: DocNode };
  saved: { title: string; document: DocNode; contentVersion: number; savedAt: number };
  saveState: SaveState;
}

note.saveDraft({ noteId, title, document })
  -> { noteId, contentVersion, savedAt }

noteDetail.isFavorite: boolean
```

ADF 中所有 `media` 节点的 `attrs.id` 作为附件 ID 集合。成功保存时 Application 在同一数据库事务内写入笔记内容并把当前笔记附件引用替换为该集合；引用的附件必须存在且属于当前 Vault。此处完成保存引用协调，模块 9 再把 Atlaskit 上传生命周期切换为短期上传引用。

**涉及文件**

- 修改：`src/shared/ipc/contracts/note.ts`
- 修改：`src/shared/ipc/adf.ts`
- 修改：`packages/application/src/local-notes/types.ts`
- 修改：`packages/application/src/local-notes/notes.ts`
- 修改：`packages/application/src/local-notes/mapping.ts`
- 修改：`packages/application/src/local-notes/service.ts`
- 修改：`packages/application/src/local-attachments/references.ts`
- 修改：`src/main/ipc/local-notes-handlers.ts`
- 重构：`src/renderer/atlassian-editor/editor.tsx`
- 修改：`src/renderer/atlassian-editor/feature-flags.ts`
- 删除：`src/renderer/atlassian-editor/LanguagePicker.tsx`
- 新建：`src/renderer/editor/EditorSurface.tsx`
- 新建：`src/renderer/editor/RendererSurface.tsx`
- 新建：`src/renderer/editor/editor-preset.tsx`
- 新建：`src/renderer/editor/editor-providers.ts`
- 新建：`src/renderer/editor/ResponsiveEditorToolbar.tsx`
- 新建：`src/renderer/editor/toolbar-actions.ts`
- 新建：`src/renderer/editor/toolbar-layout.ts`
- 新建：`src/renderer/editor/toolbar-groups.tsx`
- 新建：`src/renderer/editor/adf-media.ts`
- 新建：`src/renderer/notes/document-session.ts`
- 新建：`src/renderer/notes/save-coordinator.ts`
- 新建：`src/renderer/notes/note-write-coordinator.ts`
- 新建：`src/renderer/notes/note-queries.ts`
- 新建：`src/renderer/notes/NoteWorkspace.tsx`
- 新建：`src/renderer/notes/StickyNoteHeader.tsx`
- 新建：`src/renderer/notes/NoteMoreMenu.tsx`
- 修改：`src/renderer/notes/note-mutation-guard.ts`
- 修改：`src/renderer/navigation/content-controller.ts`
- 修改：`src/renderer/app/AppShell.tsx`
- 修改测试：`src/shared/ipc/__tests__/profile-content-contracts.test.ts`
- 修改测试：`packages/application/src/__tests__/local-notes-notes.test.ts`
- 修改测试：`packages/application/src/__tests__/local-attachments-lifecycle.test.ts`
- 修改测试：`src/main/ipc/__tests__/local-notes-handlers.test.ts`
- 重构测试：`src/renderer/atlassian-editor/__tests__/editor.test.tsx`
- 新建测试：`src/renderer/editor/__tests__/toolbar-layout.test.ts`
- 新建测试：`src/renderer/editor/__tests__/ResponsiveEditorToolbar.test.tsx`
- 新建测试：`src/renderer/editor/__tests__/EditorRendererSurface.test.tsx`
- 新建测试：`src/renderer/editor/__tests__/adf-media.test.ts`
- 新建测试：`src/renderer/notes/__tests__/document-session.test.ts`
- 新建测试：`src/renderer/notes/__tests__/save-coordinator.test.ts`
- 新建测试：`src/renderer/notes/__tests__/NoteWorkspace.test.tsx`
- 修改状态：`docs/superpowers/specs/2026-08-27-notera-renderer-editor-integration-design.md`

**单元与组件测试**

- `saveDraft` 无 expected version，Main 原子递增且不会产生本地冲突分支；标题、ADF 和附件引用同事务提交/回滚。
- `noteDetail.isFavorite` 对直接打开、收藏和取消收藏准确。
- Document reducer 对编辑、继续输入、保存成功/失败、预览和切换笔记的 revision 规则确定。
- 1 秒 debounce、单在途请求、保存期间继续编辑、失败重试、`flush()` 和锁定停止重试均使用 fake timers 验证。
- 迟到的旧笔记加载不替换新选择；草稿不写入 Query 缓存，后台 refetch 不覆盖编辑草稿。
- 已有笔记默认预览，新笔记空标题并聚焦编辑；预览失败保留编辑，成功才切到 Renderer。
- 头部顺序、sticky 层级、保存 live region、收藏按钮、编辑/预览和更多菜单符合规格。
- 四个断点逐项断言可见动作、菜单归属、顺序、互斥与键盘焦点顺序；宽度来源是工作区容器。
- Editor 与 Renderer 对同一 ADF、Math、Mermaid、Emoji 和测试 Media Provider 产生一致内容；无 Mention、Rovo、Pin、语言选择器和演示 appearance 控件。

**精确测试命令**

```powershell
npm test -- --runInBand src/shared/ipc/__tests__/profile-content-contracts.test.ts packages/application/src/__tests__/local-notes-notes.test.ts packages/application/src/__tests__/local-attachments-lifecycle.test.ts src/main/ipc/__tests__/local-notes-handlers.test.ts src/renderer/atlassian-editor/__tests__/editor.test.tsx src/renderer/atlassian-editor/math src/renderer/atlassian-editor/mermaid src/renderer/editor/__tests__/toolbar-layout.test.ts src/renderer/editor/__tests__/ResponsiveEditorToolbar.test.tsx src/renderer/editor/__tests__/EditorRendererSurface.test.tsx src/renderer/editor/__tests__/adf-media.test.ts src/renderer/notes/__tests__/document-session.test.ts src/renderer/notes/__tests__/save-coordinator.test.ts src/renderer/notes/__tests__/NoteWorkspace.test.tsx
```

预期：列出的测试文件和两个现有扩展测试目录全部通过，0 个失败；四个响应式断点均不存在重复动作。

**完成后的提交**

```powershell
git add src/shared/ipc src/main/ipc/local-notes-handlers.ts src/renderer/App.tsx src/renderer/app/AppShell.tsx src/renderer/atlassian-editor src/renderer/editor src/renderer/notes src/renderer/navigation/content-controller.ts packages/application/src/local-notes packages/application/src/local-attachments/references.ts docs/superpowers/specs/2026-08-27-notera-renderer-editor-integration-design.md
git commit -m "feat(renderer): integrate note workspace and editor"
```

---

## 功能模块 5：搜索、收藏与最近使用

**目标与功能逻辑**

实现全局搜索、收藏和最近使用三个 ADS Modal。搜索触发器位于左栏并支持 Ctrl/Cmd+J；每次打开恢复为全部笔记范围，用户可以从 Popup 目录树选择一个目录，范围包含该目录及全部后代。结果按页加载，显示标题、完整目录、摘要和 Unicode 安全高亮。

高亮只按 Unicode code point 切分并生成 React 文本节点，不使用 `innerHTML`。搜索结果直接携带 `folderPath`，避免 N+1 路径请求。打开结果时更新选中笔记和树路径；缺失条目刷新当前页并显示安全就地反馈。

收藏 Modal 分页显示收藏笔记，可打开或取消收藏；最近使用 Modal 分页显示最近访问笔记并打开。两者无多选和批量操作。收藏 Mutation 同步更新当前 `noteDetail.isFavorite` 和收藏列表，再定向失效校准；最近访问在成功打开笔记后由 Main 的现有访问时间语义维护。

**关键接口**

```ts
interface SearchResult {
  noteId: string;
  title: string;
  excerpt: string;
  folderPath: Array<{ id: string; name: string }>;
  updatedAt: number;
  highlights: SearchHighlight[];
}

search.query({ query, folderId?, cursor?, pageSize? }) -> CursorPage<SearchResult>
```

搜索目录范围继续由 Application/Storage 的递归查询保证，Renderer 不在客户端过滤结果。搜索 key 包含 Profile、query 和 folderId；关闭后丢弃输入与范围但不需要清空其他 Profile 已隔离缓存。

**涉及文件**

- 修改：`src/shared/ipc/contracts/search.ts`
- 修改：`packages/application/src/local-notes/types.ts`
- 修改：`packages/application/src/local-notes/search.ts`
- 修改：`packages/application/src/local-notes/mapping.ts`
- 新建：`src/renderer/search/SearchModal.tsx`
- 新建：`src/renderer/search/SearchScopePicker.tsx`
- 新建：`src/renderer/search/SearchResults.tsx`
- 新建：`src/renderer/search/unicode-highlight.tsx`
- 新建：`src/renderer/search/search-queries.ts`
- 新建：`src/renderer/favorites/FavoritesModal.tsx`
- 新建：`src/renderer/favorites/favorite-queries.ts`
- 新建：`src/renderer/recent/RecentModal.tsx`
- 新建：`src/renderer/recent/recent-queries.ts`
- 修改：`src/renderer/navigation/ResizableNavigation.tsx`
- 修改：`src/renderer/shared-ui/ModalHost.tsx`
- 修改：`src/renderer/notes/StickyNoteHeader.tsx`
- 修改测试：`src/shared/ipc/__tests__/profile-content-contracts.test.ts`
- 修改测试：`packages/application/src/__tests__/local-notes-search-session.test.ts`
- 修改测试：`src/main/ipc/__tests__/local-notes-handlers.test.ts`
- 新建测试：`src/renderer/search/__tests__/unicode-highlight.test.tsx`
- 新建测试：`src/renderer/search/__tests__/SearchModal.test.tsx`
- 新建测试：`src/renderer/favorites/__tests__/FavoritesModal.test.tsx`
- 新建测试：`src/renderer/recent/__tests__/RecentModal.test.tsx`
- 修改状态：`docs/superpowers/specs/2026-08-27-notera-renderer-editor-integration-design.md`

**单元与组件测试**

- 搜索结果契约包含有序 `folderPath`；目录范围确实包含自身与后代而不包含旁支。
- Modal 每次重开恢复全部范围，目录 Popup 支持展开和根目录选择，query/scope 变化重置 cursor。
- Ctrl/Cmd+J 打开并把焦点移入搜索框，Escape 关闭后焦点回到触发器。
- Unicode 高亮对代理对、组合字符、标题/摘要多个不相交区间正确，输出中没有 `dangerouslySetInnerHTML`。
- 搜索、收藏、最近分页“加载更多”不重复条目；空状态使用对应 ADS Empty State。
- 打开结果时选择正确笔记并展开路径；收藏/取消收藏同时更新当前详情与列表，失败恢复缓存。
- UI 中不出现标签、收藏排序、多选或批量动作。

**精确测试命令**

```powershell
npm test -- --runInBand src/shared/ipc/__tests__/profile-content-contracts.test.ts packages/application/src/__tests__/local-notes-search-session.test.ts src/main/ipc/__tests__/local-notes-handlers.test.ts src/renderer/search/__tests__/unicode-highlight.test.tsx src/renderer/search/__tests__/SearchModal.test.tsx src/renderer/favorites/__tests__/FavoritesModal.test.tsx src/renderer/recent/__tests__/RecentModal.test.tsx
```

预期：列出的 7 个测试文件全部通过，0 个失败；Unicode 高亮断言全部使用文本节点。

**完成后的提交**

```powershell
git add src/shared/ipc/contracts/search.ts src/renderer/search src/renderer/favorites src/renderer/recent src/renderer/navigation/ResizableNavigation.tsx src/renderer/shared-ui/ModalHost.tsx src/renderer/notes/StickyNoteHeader.tsx packages/application/src/local-notes src/main/ipc/__tests__/local-notes-handlers.test.ts src/shared/ipc/__tests__/profile-content-contracts.test.ts docs/superpowers/specs/2026-08-27-notera-renderer-editor-integration-design.md
git commit -m "feat(renderer): add search favorites and recent modals"
```

---

## 功能模块 6：历史版本

**目标与功能逻辑**

实现创建版本、历史列表、只读预览、比较、复制和恢复。创建版本前先 `DocumentSession.flush()`；名称输入默认填入当前本地时间的 `YYYY-MM-DD HH:mm:ss`，用户可在提交前修改，创建后 Renderer 不提供重命名、清空名称或删除入口。Preload 中已有历史重命名白名单保留但 UI 不消费。

历史 Modal 左侧为分页版本列表，右侧使用与笔记预览一致的 ReactRenderer。比较默认左侧当前成功保存版本、右侧选中历史版本，并明确标注两边来源；复制使用目录选择器并保持当前笔记。恢复先执行保存协调器串行屏障，Main 自动创建 `BEFORE_HISTORY_RESTORE` 系统保护版本，再恢复所选版本；成功后重新读取笔记并重建 DocumentSession，不把旧草稿合并到恢复结果。

系统保护版本显示创建时间和保护原因，不显示可编辑名称。当前版本与历史版本的附件引用继续由 Application 的现有 `AttachmentReferenceCoordinator` 原子维护。

**关键控制器接口**

```ts
interface HistoryController {
  create(input: { noteId: string; versionName: string }): Promise<void>;
  compare(input: { noteId: string; versionId: string }): Promise<HistoryComparison>;
  copy(input: { noteId: string; versionId: string; targetFolderId: string }): Promise<void>;
  restore(input: { noteId: string; versionId: string }): Promise<void>;
}
```

恢复调用现有 `history.restore` 时使用协调器最近成功保存的 `contentVersion`；如果实体已消失则关闭工作区并刷新列表。产品不呈现本地冲突 UI，所有当前笔记写入保持串行。

**涉及文件**

- 新建：`src/renderer/history/CreateVersionModal.tsx`
- 新建：`src/renderer/history/HistoryModal.tsx`
- 新建：`src/renderer/history/HistoryList.tsx`
- 新建：`src/renderer/history/HistoryPreview.tsx`
- 新建：`src/renderer/history/HistoryCompare.tsx`
- 新建：`src/renderer/history/history-controller.ts`
- 新建：`src/renderer/history/history-queries.ts`
- 新建：`src/renderer/history/local-version-name.ts`
- 修改：`src/renderer/notes/NoteMoreMenu.tsx`
- 修改：`src/renderer/notes/note-write-coordinator.ts`
- 修改：`src/renderer/shared-ui/ModalHost.tsx`
- 修改测试：`packages/application/src/__tests__/local-notes-history.test.ts`
- 修改测试：`packages/application/src/__tests__/local-attachments-lifecycle.test.ts`
- 修改测试：`src/main/ipc/__tests__/local-notes-handlers.test.ts`
- 新建测试：`src/renderer/history/__tests__/local-version-name.test.ts`
- 新建测试：`src/renderer/history/__tests__/CreateVersionModal.test.tsx`
- 新建测试：`src/renderer/history/__tests__/HistoryModal.test.tsx`
- 新建测试：`src/renderer/history/__tests__/history-controller.test.ts`
- 修改状态：`docs/superpowers/specs/2026-08-27-notera-renderer-editor-integration-design.md`

**单元与组件测试**

- 默认版本名使用注入的本地时间且格式稳定，提交前可编辑，空白名被禁用。
- 创建先 flush；失败保留 Modal 输入且不创建版本，成功刷新历史列表。
- 历史列表分页、空状态、用户版本和系统保护版本文案正确；无重命名、删除或清空名称动作。
- 预览复用完整扩展与 Media Provider；比较默认 CURRENT 与所选 VERSION，切换版本不会串页。
- 复制目标目录正确且不切换当前笔记；复制后的树目标缓存刷新。
- 恢复串行等待保存，Main 创建保护版本并原子迁移附件引用；Renderer 重读并重建干净 DocumentSession。
- 恢复失败保留当前草稿或已保存快照，不出现本地版本冲突产品状态。

**精确测试命令**

```powershell
npm test -- --runInBand packages/application/src/__tests__/local-notes-history.test.ts packages/application/src/__tests__/local-attachments-lifecycle.test.ts src/main/ipc/__tests__/local-notes-handlers.test.ts src/renderer/history/__tests__/local-version-name.test.ts src/renderer/history/__tests__/CreateVersionModal.test.tsx src/renderer/history/__tests__/HistoryModal.test.tsx src/renderer/history/__tests__/history-controller.test.ts
```

预期：列出的 7 个测试文件全部通过，0 个失败；历史 UI 查询中不存在 rename/delete mutation。

**完成后的提交**

```powershell
git add src/renderer/history src/renderer/notes/NoteMoreMenu.tsx src/renderer/notes/note-write-coordinator.ts src/renderer/shared-ui/ModalHost.tsx packages/application/src/__tests__/local-notes-history.test.ts packages/application/src/__tests__/local-attachments-lifecycle.test.ts src/main/ipc/__tests__/local-notes-handlers.test.ts docs/superpowers/specs/2026-08-27-notera-renderer-editor-integration-design.md
git commit -m "feat(renderer): add immutable note history workflow"
```

---

## 功能模块 7：回收站

**目标与功能逻辑**

实现回收站分页 Modal、单项恢复、目标目录回退和危险永久删除。列表每项显示目录/笔记类型、名称、删除时间和到期时间；不提供多选、批量、清空回收站或手动清理过期入口。

当 `originalParentAvailable=true` 时可直接恢复；为 false 时先打开目录选择器并传 `targetFolderId`。若直接恢复仍返回 `TRASH_TARGET_REQUIRED`，保留当前条目并进入目标选择流程。永久删除必须经过二次危险确认，并只操作当前 `trashEntryId`。过期清理由 Main 维护生命周期负责，Renderer 不调用 `trash.purgeExpired`。

恢复成功后从当前回收站页移除条目并定向刷新目标树；恢复目录时允许 Main 重建整个子树。永久删除成功只更新回收站缓存并用 Flag 报告，不显示底层删除数量或路径。条目过期或已不存在时刷新列表并显示安全反馈。

**涉及文件**

- 新建：`src/renderer/trash/TrashModal.tsx`
- 新建：`src/renderer/trash/TrashList.tsx`
- 新建：`src/renderer/trash/RestoreTrashModal.tsx`
- 新建：`src/renderer/trash/DeleteTrashModal.tsx`
- 新建：`src/renderer/trash/trash-controller.ts`
- 新建：`src/renderer/trash/trash-queries.ts`
- 修改：`src/renderer/navigation/ResizableNavigation.tsx`
- 修改：`src/renderer/shared-ui/ModalHost.tsx`
- 修改测试：`packages/application/src/__tests__/local-notes-trash.test.ts`
- 修改测试：`packages/application/src/__tests__/local-attachments-lifecycle.test.ts`
- 修改测试：`src/main/ipc/__tests__/local-notes-handlers.test.ts`
- 新建测试：`src/renderer/trash/__tests__/TrashModal.test.tsx`
- 新建测试：`src/renderer/trash/__tests__/trash-controller.test.ts`
- 修改状态：`docs/superpowers/specs/2026-08-27-notera-renderer-editor-integration-design.md`

**单元与组件测试**

- 分页列表和加载更多稳定，显示删除/到期时间和类型；空回收站使用 ADS Empty State。
- 原父目录存在时直接恢复，不存在时必须选择目标；`TRASH_TARGET_REQUIRED` 能转入同一选择流程。
- 恢复刷新目标目录、回收站和相关路径缓存，恢复整个目录子树不产生批量 UI。
- 永久删除必须二次确认，取消不调用 IPC，确认只传单个 ID。
- `ENTITY_NOT_FOUND` 和 `TRASH_ENTRY_EXPIRED` 刷新列表且不泄漏内部信息。
- UI 中不存在清空、选择框、多选、purgeExpired 或批量操作入口。

**精确测试命令**

```powershell
npm test -- --runInBand packages/application/src/__tests__/local-notes-trash.test.ts packages/application/src/__tests__/local-attachments-lifecycle.test.ts src/main/ipc/__tests__/local-notes-handlers.test.ts src/renderer/trash/__tests__/TrashModal.test.tsx src/renderer/trash/__tests__/trash-controller.test.ts
```

预期：列出的 5 个测试文件全部通过，0 个失败；Renderer 测试中 `trash.purgeExpired` 调用次数为 0。

**完成后的提交**

```powershell
git add src/renderer/trash src/renderer/navigation/ResizableNavigation.tsx src/renderer/shared-ui/ModalHost.tsx packages/application/src/__tests__/local-notes-trash.test.ts packages/application/src/__tests__/local-attachments-lifecycle.test.ts src/main/ipc/__tests__/local-notes-handlers.test.ts docs/superpowers/specs/2026-08-27-notera-renderer-editor-integration-design.md
git commit -m "feat(renderer): add single-item trash workflows"
```

---

## 功能模块 8：单笔记导出与长任务 UI

**目标与功能逻辑**

把已经存在的 Main 单笔记导出能力接入 Renderer，完成 Markdown/PDF 选择、明文安全提示、编辑态保存失败回退、进度、取消、成功报告和有损节点警告。导出入口来自笔记更多菜单和笔记树菜单，不创建附件管理入口。

打开 Modal 时默认 Markdown，使用 ADS Radio 选择 Markdown/PDF；明确提示导出文件已脱离 Notera 加密保护。编辑状态先调用 `flush()`：成功后导出最新版本；失败时显示“导出上一次成功保存版本”和“返回编辑”选择，绝不把未保存内存草稿伪装成导出内容。存在附件时 Main 自动选择 ZIP，Renderer 只展示最终 `packaging`。

应用根部只订阅一次 `operation.progress` 与 `operation.completed`。`export.startNote` 返回 operationId 后先登记任务，再立即调用一次 `operation.getStatus` 防止快速完成竞态。事件只能更新匹配 ID。关闭 Modal 不取消；只有明确点击取消才调用 `operation.cancel`。锁定清空 Renderer 任务状态，Main SessionLifecycle 取消实际任务和未完成明文输出。

阶段映射固定为准备、读取、渲染、写入和完成；进度未知时使用不定进度。成功 Flag 不显示真实路径，PDF 有损节点使用 Warning，失败只展示安全错误文案。

**涉及文件**

- 新建：`src/renderer/export/ExportModal.tsx`
- 新建：`src/renderer/export/ExportProgress.tsx`
- 新建：`src/renderer/export/ExportReport.tsx`
- 新建：`src/renderer/export/export-controller.ts`
- 新建：`src/renderer/export/export-operation.ts`
- 修改：`src/renderer/app/operations.ts`
- 修改：`src/renderer/app/AppProviders.tsx`
- 修改：`src/renderer/notes/NoteMoreMenu.tsx`
- 修改：`src/renderer/navigation/content-actions.tsx`
- 修改：`src/renderer/shared-ui/ModalHost.tsx`
- 修改测试：`src/main/export/__tests__/coordinator.test.ts`
- 修改测试：`src/main/ipc/__tests__/export-handlers.test.ts`
- 修改测试：`src/main/operations/__tests__/registry.test.ts`
- 新建测试：`src/renderer/export/__tests__/export-operation.test.ts`
- 新建测试：`src/renderer/export/__tests__/export-controller.test.ts`
- 新建测试：`src/renderer/export/__tests__/ExportModal.test.tsx`
- 修改状态：`docs/superpowers/specs/2026-08-27-notera-renderer-editor-integration-design.md`

**单元与组件测试**

- 格式选择和明文提示正确；有附件的 ZIP 决策以 Main 报告为准，UI 不预测文件名或路径。
- clean/dirty 编辑态分别导出；保存失败只能导出上次成功版本或返回编辑，不读取当前草稿 ADF。
- start 后登记 ID 并立即 getStatus；进度/完成事件早到、晚到、重复和其他 ID 均不污染当前任务。
- 关闭 Modal 不取消，显式取消只调用一次并处理终态幂等；锁定清空前端任务。
- 各阶段文案和进度条正确；成功 Flag、取消、失败和有损 Warning 互斥且不泄漏路径。
- 树菜单和更多菜单复用同一导出 controller；没有附件管理页面或自定义附件操作。

**精确测试命令**

```powershell
npm test -- --runInBand src/main/export/__tests__/coordinator.test.ts src/main/ipc/__tests__/export-handlers.test.ts src/main/operations/__tests__/registry.test.ts src/renderer/export/__tests__/export-operation.test.ts src/renderer/export/__tests__/export-controller.test.ts src/renderer/export/__tests__/ExportModal.test.tsx
```

预期：列出的 6 个测试文件全部通过，0 个失败；测试断言可见文案中不包含真实路径。

**完成后的提交**

```powershell
git add src/renderer/export src/renderer/app/operations.ts src/renderer/app/AppProviders.tsx src/renderer/notes/NoteMoreMenu.tsx src/renderer/navigation/content-actions.tsx src/renderer/shared-ui/ModalHost.tsx src/main/export/__tests__/coordinator.test.ts src/main/ipc/__tests__/export-handlers.test.ts src/main/operations/__tests__/registry.test.ts docs/superpowers/specs/2026-08-27-notera-renderer-editor-integration-design.md
git commit -m "feat(renderer): add note export operation UI"
```

---

## 功能模块 9：Atlaskit Media 生产适配

**目标与功能逻辑**

用生产 Media Adapter 替换明文 `src/main/demo-media`，让 Atlaskit Editor 与 ReactRenderer 继续通过公开 `MediaProvider` 工作，但上传、读取、Range 和引用生命周期全部落到 Notera 加密附件服务。产品不增加附件页面、抽屉或自定义附件交互。

服务只监听 `127.0.0.1` 随机端口，API base URL 仍通过已校验的附加参数传给 Renderer。Renderer 为当前 note 创建 Provider，`/auth` 请求携带 noteId；Main 验证严格 Origin、当前 Profile、有效 note 和会话状态后签发 32 字节 base64url 高熵令牌，令牌绑定 `{localProfileId,noteId,collection,expiresAt}`。CORS 只允许实际 Renderer origin 和固定请求头/方法，不使用 `*`。锁定、切换和退出撤销令牌、中止上传与读取。

Adapter 实现 Atlaskit 当前实际使用的 auth、createWithFiles/chunk/finalize、binary、metadata/items 和 image 读取端点；路由形状以已安装版本和本地 Atlassian Fullpage 源码为准。所有 fileId 必须为 UUID，且直接作为 Notera `attachmentId`；collection 固定派生自 Profile/note scope，客户端值不能扩大权限。单文件限制在 Adapter 和 Application 两层均为 100 MiB。

上传采用加密流，不拼接完整明文 Buffer、不创建长期明文文件。上传完成但 ADF 未保存时写入带过期时间的短期上传引用；`note.saveDraft` 在同一数据库事务把 ADF Media ID 对应短期引用提升为当前笔记引用并移除正文已删除的引用。放弃编辑或锁定后，短期引用由恢复/GC 清除；Blob 只有在没有当前、历史、回收站或有效上传引用时才能回收。

读取通过 `LocalAttachmentsService.openReader()` 按需解密，支持 `bytes=start-end`、`bytes=start-` 和 `bytes=-suffix` 单 Range；非法、多 Range 和越界返回 416。响应设置受控 MIME、长度、Content-Range、Accept-Ranges、`Cache-Control: no-store`、`nosniff`，不暴露真实路径、文件名、令牌或底层错误。锁定后既有请求中止，新请求返回无详情 401/404。

**关键接口与存储变化**

```ts
interface MediaSessionRegistry {
  issue(input: { localProfileId: string; noteId: string }): MediaAuth;
  authorize(request: Request): { localProfileId: string; noteId: string };
  revokeProfile(localProfileId: string): void;
  revokeAll(): void;
}

interface ImportAttachmentInput {
  attachmentId?: AttachmentId; // Media Adapter 必须传 Atlaskit fileId
  noteId: NoteId;
  reference: { kind: 'CURRENT_NOTE' } | { kind: 'UPLOAD'; expiresAt: Timestamp };
  fileName: string;
  mimeType: string;
  source: AsyncIterable<Uint8Array>;
  signal?: AbortSignal;
}
```

Storage schema 增加可过期上传引用，不改变同步模型或远端状态。迁移必须兼容现有 Vault；完整性检查、恢复和 GC 都识别该引用。生产 `main.ts` 只启动 Media Adapter，不导入 demo server；Webpack 生产依赖图测试保证 `src/main/demo-media` 不进入 bundle。确认不再使用后删除 demo media 源码和测试。

**涉及文件**

- 修改：`packages/domain/src/models/attachment.ts`
- 修改：`packages/domain/src/operations/attachments.ts`
- 修改：`packages/domain/src/index.ts`
- 新建：`packages/storage-sqlcipher/src/schema/v5.ts`
- 修改：`packages/storage-sqlcipher/src/migrations/registry.ts`
- 修改：`packages/storage-sqlcipher/src/migrations/runner.ts`
- 修改：`packages/storage-sqlcipher/src/repositories/attachments.ts`
- 修改：`packages/storage-sqlcipher/src/types.ts`
- 修改：`packages/storage-sqlcipher/src/integrity.ts`
- 修改：`packages/application/src/local-attachments/types.ts`
- 修改：`packages/application/src/local-attachments/import.ts`
- 修改：`packages/application/src/local-attachments/references.ts`
- 修改：`packages/application/src/local-attachments/gc.ts`
- 修改：`packages/application/src/local-attachments/recovery.ts`
- 修改：`packages/application/src/local-attachments/service.ts`
- 修改：`packages/application/src/local-notes/notes.ts`
- 新建：`src/main/media-adapter/session-registry.ts`
- 新建：`src/main/media-adapter/range.ts`
- 新建：`src/main/media-adapter/routes.ts`
- 新建：`src/main/media-adapter/server.ts`
- 新建：`src/main/media-adapter/electron-lifecycle.ts`
- 修改：`src/main/lifecycle/session-lock.ts`
- 修改：`src/main/runtime.ts`
- 修改：`src/main/main.ts`
- 修改：`src/shared/atlassian-editor/media-runtime.ts`
- 重构：`src/renderer/atlassian-editor/media-provider.ts`
- 修改：`src/renderer/editor/editor-providers.ts`
- 修改：`src/renderer/editor/EditorSurface.tsx`
- 修改：`src/renderer/editor/RendererSurface.tsx`
- 删除：`src/main/demo-media/config.ts`
- 删除：`src/main/demo-media/store.ts`
- 删除：`src/main/demo-media/server.ts`
- 删除：`src/main/demo-media/electron-lifecycle.ts`
- 删除：`src/main/demo-media/__tests__/store.test.ts`
- 删除：`src/main/demo-media/__tests__/server.test.ts`
- 删除：`src/main/demo-media/__tests__/electron-lifecycle.test.ts`
- 修改测试：`packages/domain/src/__tests__/attachments.test.ts`
- 修改测试：`packages/storage-sqlcipher/src/__tests__/schema.test.ts`
- 修改测试：`packages/storage-sqlcipher/src/__tests__/migrations.test.ts`
- 修改测试：`packages/storage-sqlcipher/src/__tests__/attachments.test.ts`
- 修改测试：`packages/storage-sqlcipher/src/__tests__/integrity.test.ts`
- 修改测试：`packages/application/src/__tests__/local-attachments-import.test.ts`
- 修改测试：`packages/application/src/__tests__/local-attachments-gc-recovery.test.ts`
- 修改测试：`packages/application/src/__tests__/local-attachments-lifecycle.test.ts`
- 修改测试：`packages/application/src/__tests__/local-notes-notes.test.ts`
- 新建测试：`src/main/media-adapter/__tests__/session-registry.test.ts`
- 新建测试：`src/main/media-adapter/__tests__/range.test.ts`
- 新建测试：`src/main/media-adapter/__tests__/server.test.ts`
- 修改测试：`src/main/__tests__/runtime.test.ts`
- 修改测试：`src/main/__tests__/main.test.ts`
- 修改测试：`src/shared/atlassian-editor/__tests__/media-runtime.test.ts`
- 重构测试：`src/renderer/atlassian-editor/__tests__/media-provider.test.ts`
- 修改测试：`src/renderer/editor/__tests__/EditorRendererSurface.test.tsx`
- 修改状态：`docs/superpowers/specs/2026-08-27-notera-renderer-editor-integration-design.md`

**单元、集成与安全测试**

- 服务只绑定 loopback 随机端口；错误 Origin、缺失/过期/跨 Profile/跨 note token 全部拒绝，CORS 无通配符。
- token 使用注入的 32 字节随机值，严格绑定 Profile/note/collection；锁定、切换、退出立即撤销并中止活动请求。
- Atlaskit Media 路由满足安装版本真实请求：上传 fileId 保持不变、分块顺序和大小限制正确、失败/取消执行补偿。
- 上传明文不完整驻留内存或落盘，Attachment Store 只产生加密 Blob；Media ID 等于 attachmentId。
- 上传引用在保存时原子提升，ADF 删除 Media 时移除当前引用；保存失败保持旧内容与旧引用，不能出现半提交。
- 历史、复制、回收站引用不被短期引用破坏；过期上传引用在恢复/GC 后释放 Blob，活动引用不被误删。
- 完整读取和三种合法 Range 返回精确字节；非法、多 Range、越界为 416；所有 Reader 在成功、失败和取消时恰好关闭。
- Editor 与 Renderer 对同一 note 共用生产 Provider；Media 缺失/损坏不阻断其他正文。
- `main.ts` 和生产 bundle 不引用 demo media、固定 token、明文 Store 或演示数据目录。

**精确测试命令**

```powershell
npm test -- --runInBand packages/domain/src/__tests__/attachments.test.ts packages/storage-sqlcipher/src/__tests__/schema.test.ts packages/storage-sqlcipher/src/__tests__/migrations.test.ts packages/storage-sqlcipher/src/__tests__/attachments.test.ts packages/storage-sqlcipher/src/__tests__/integrity.test.ts packages/application/src/__tests__/local-attachments-import.test.ts packages/application/src/__tests__/local-attachments-gc-recovery.test.ts packages/application/src/__tests__/local-attachments-lifecycle.test.ts packages/application/src/__tests__/local-notes-notes.test.ts src/main/media-adapter/__tests__/session-registry.test.ts src/main/media-adapter/__tests__/range.test.ts src/main/media-adapter/__tests__/server.test.ts src/main/__tests__/runtime.test.ts src/main/__tests__/main.test.ts src/shared/atlassian-editor/__tests__/media-runtime.test.ts src/renderer/atlassian-editor/__tests__/media-provider.test.ts src/renderer/editor/__tests__/EditorRendererSurface.test.tsx
```

预期：列出的 17 个测试文件全部通过，0 个失败；安全测试中没有明文临时文件、通配 CORS、跨 scope 成功请求或未关闭 Reader。

**完成后的提交**

```powershell
git add packages/domain/src packages/storage-sqlcipher/src packages/application/src/local-attachments packages/application/src/local-notes/notes.ts src/main/media-adapter src/main/lifecycle/session-lock.ts src/main/runtime.ts src/main/main.ts src/shared/atlassian-editor src/renderer/atlassian-editor src/renderer/editor src/main/demo-media docs/superpowers/specs/2026-08-27-notera-renderer-editor-integration-design.md
git commit -m "feat(media): connect Atlaskit to encrypted attachments"
```

---

## 所有模块完成后的唯一最终验证

九项实施状态全部为 `[x]` 后，只执行下面一次相关测试全集和必要工程检查；不创建额外功能任务或审核任务。

```powershell
npm test -- --runInBand src/renderer src/shared/ipc src/shared/atlassian-editor src/__tests__/preload.test.ts src/main/ipc src/main/lifecycle src/main/operations src/main/export src/main/media-adapter src/main/__tests__/runtime.test.ts src/main/__tests__/window.test.ts src/main/__tests__/main.test.ts packages/application/src/__tests__/preferences.test.ts packages/application/src/__tests__/local-notes-folders.test.ts packages/application/src/__tests__/local-notes-notes.test.ts packages/application/src/__tests__/local-notes-search-session.test.ts packages/application/src/__tests__/local-notes-history.test.ts packages/application/src/__tests__/local-notes-trash.test.ts packages/application/src/__tests__/local-attachments-import.test.ts packages/application/src/__tests__/local-attachments-gc-recovery.test.ts packages/application/src/__tests__/local-attachments-lifecycle.test.ts packages/domain/src/__tests__/attachments.test.ts packages/storage-sqlcipher/src/__tests__/schema.test.ts packages/storage-sqlcipher/src/__tests__/migrations.test.ts packages/storage-sqlcipher/src/__tests__/attachments.test.ts packages/storage-sqlcipher/src/__tests__/integrity.test.ts
npm run typecheck
npm run check:deps
npx eslint src/renderer src/main src/shared packages/application/src packages/domain/src packages/storage-sqlcipher/src --ext .ts,.tsx
npm run build
```

预期：

- Renderer、相关 Shared/Main/Application/Domain/Storage 测试全部通过，0 个失败；
- 所有 workspace 与应用 TypeScript 检查通过；
- 依赖方向无循环，Renderer 不能直接依赖 Main、Application、Domain 或 Storage；
- 本次涉及源码的项目与 ADS lint 全部通过；
- production Main、Preload、Renderer 和导出 Renderer 构建成功；
- 生产依赖图不包含 `src/main/demo-media`，UI 中不存在标签、批量、附件管理或同步入口。

若某项失败，只针对失败原因修复并复测该失败项；未受影响且已经通过的检查不重复运行。最终验证不单独提交；如验证导致代码修复，把修复归入对应功能模块提交，或在尚未推送时 amend 最后一个实际受影响模块，保持每个完整功能模块一次提交。
