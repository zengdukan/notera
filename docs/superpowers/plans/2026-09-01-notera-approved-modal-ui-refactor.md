# Notera 已批准模态界面重构实施计划

**目标：** 以 Figma `notera-main` 的指定节点为唯一视觉与交互基准，重构搜索、历史版本、导出、回收站和设置界面，同时保持现有离线业务逻辑、IPC 契约和产品结构不变。

**架构：** 继续使用现有 Electron + React + TypeScript + Atlaskit 组件体系。共享模态框只负责宽度、遮罩、标题区和响应式容器；各功能模块保留现有查询、控制器和状态机，在模块内部重组可访问 DOM 与视觉层级。Figma 文件没有创建 Variables collection，因此设计中的原始颜色统一映射到 Atlaskit `--ds-*` 语义令牌，并通过集中式 Notera 模态 CSS 变量消费，不在页面组件中散落十六进制颜色。

**技术栈：** Electron 42、React 18、TypeScript 5、Atlaskit Design System、TanStack Query 5、Jest 29、Testing Library、Webpack 5。

**规格：** 用户批准的 Figma 节点 `10:468`、`10:584`、`10:699`、`10:820`、`10:933`、`10:1041`、`10:1148`、`10:1249`、`10:1481`、`10:1369`、`10:1602`，以及 2026-09-01 的实现要求。

## 全局约束

- 不修改搜索、历史版本、导出、回收站、设置的业务边界、IPC 契约或数据持久化逻辑。
- 不纳入同步协议、同步引擎、云端 API、同步 Outbox、同步冲突或远端附件状态。
- 优先复用 `ModalDialog`、`Button`、`Textfield`、`Tabs`、`RadioGroup`、`ProgressBar`、`SectionMessage`、`Spinner`、`EmptyState`。
- 桌面基准为 1440×900；在 768px 与 375px 下使用同一内容结构响应式重排，不另建移动端产品流程。
- 所有交互保持可键盘操作，并具有可见 focus、hover、disabled、loading、empty 和 error 状态。
- 每个功能模块采用测试先行方式完成，并在该模块测试通过后形成一次提交。

---

## 功能模块一：搜索弹窗与共享响应式模态框基础

**目标与功能逻辑：** 将搜索弹窗还原为 720×620 桌面内容区：搜索输入、紧邻的范围选择、分隔清晰的结果列表和可滚动结果区域；移动端改为贴近视口的单列布局。保留现有全局/文件夹范围查询、分页、打开结果失败后刷新等逻辑，并覆盖初始、加载、空、错误和更多结果状态。共享模态框增加以 `kind` 为入口的语义类名和数字宽度支持，后续模块复用同一遮罩、边框、间距和断点。

**关键接口：** `HostedModal.width` 接受 Atlaskit 支持的 `number | WidthNames`；`ModalHost` 将 `modal.kind` 暴露为稳定的 `data-notera-modal`/类名；`SearchModal` 继续消费 `NoteraClient`、`profileId`、`rootFolderId` 和 `onOpen(SearchResult)`。

**涉及文件：**

- 新建 `src/renderer/shared-ui/ModalHost.css`
- 修改 `src/renderer/shared-ui/ModalHost.tsx`
- 修改 `src/renderer/navigation/NavigationWorkspace.tsx`
- 修改 `src/renderer/search/SearchModal.tsx`
- 修改 `src/renderer/search/SearchResults.tsx`
- 修改 `src/renderer/search/SearchScopePicker.tsx`
- 修改 `src/renderer/search/__tests__/SearchModal.test.tsx`
- 新建 `src/renderer/shared-ui/__tests__/ModalHost.test.tsx`

**单元测试：** 验证搜索自动聚焦、范围切换、结果分组、打开结果、加载/空/错误状态及分页按钮；验证共享模态框输出功能 kind、数字宽度和可关闭标题结构。

**精确测试命令：**

```powershell
npm test -- --runInBand src/renderer/search/__tests__/SearchModal.test.tsx src/renderer/shared-ui/__tests__/ModalHost.test.tsx
```

**完成后提交：**

```powershell
git add docs/superpowers/plans/2026-09-01-notera-approved-modal-ui-refactor.md src/renderer/shared-ui src/renderer/search src/renderer/navigation/NavigationWorkspace.tsx
git commit -m "refactor(search): match approved Figma modal"
```

## 功能模块二：创建版本、历史列表与版本对比

**目标与功能逻辑：** 创建版本保持默认命名、空名称禁用和失败后保留输入；历史界面实现左侧版本列表、右侧快照、底部操作组，版本对比实现等宽双栏及移动端纵向排列。保留只读快照、复制为笔记、恢复版本和比较控制器调用；补齐历史加载、空列表、快照加载、操作失败与按钮工作中状态。

**关键接口：** `CreateVersionModal.onCreate(versionName)` 不变；`HistoryModal` 继续消费 `HistoryController.compare/copy/restore`；`HistoryList` 通过 `selectedId` 和 `onSelect` 管理选择态；`HistoryCompare` 继续消费 `history.compare` 返回的左右快照。

**涉及文件：**

- 修改 `src/renderer/history/CreateVersionModal.tsx`
- 修改 `src/renderer/history/HistoryModal.tsx`
- 修改 `src/renderer/history/HistoryList.tsx`
- 修改 `src/renderer/history/HistoryPreview.tsx`
- 修改 `src/renderer/history/HistoryCompare.tsx`
- 修改 `src/renderer/history/__tests__/CreateVersionModal.test.tsx`
- 修改 `src/renderer/history/__tests__/HistoryModal.test.tsx`

**单元测试：** 验证创建按钮 disabled/loading/error；验证默认选中首个版本、明确选择态、预览和对比布局语义、工作中禁用、空/加载/错误反馈，以及复制和恢复接口不变。

**精确测试命令：**

```powershell
npm test -- --runInBand src/renderer/history/__tests__/CreateVersionModal.test.tsx src/renderer/history/__tests__/HistoryModal.test.tsx src/renderer/history/__tests__/history-controller.test.ts
```

**完成后提交：**

```powershell
git add src/renderer/history
git commit -m "refactor(history): match approved version flows"
```

## 功能模块三：导出选择、进度与结果

**目标与功能逻辑：** 导出初始态按 Figma 呈现 Markdown/PDF 选择、安全提示和主操作；运行态呈现当前阶段、进度条、阶段轨迹和取消操作；结果态呈现成功摘要与有损导出警告。保留保存失败回退、启动失败、取消、失败和完成状态机，不显示输出路径或内部错误。

**关键接口：** `ExportModal` 继续订阅 `ExportOperationStore`；`ExportController.start({ noteId, format, save })` 和 `cancel()` 不变；`ExportProgress` 与 `ExportReport` 仅重构呈现，不改变 `ExportOperation` 联合类型。

**涉及文件：**

- 修改 `src/renderer/export/ExportModal.tsx`
- 修改 `src/renderer/export/ExportProgress.tsx`
- 修改 `src/renderer/export/ExportReport.tsx`
- 修改 `src/renderer/export/__tests__/ExportModal.test.tsx`
- 修改 `src/renderer/export/__tests__/export-operation.test.ts`

**单元测试：** 验证格式选中态、安全提示、开始按钮 loading、保存失败回退、运行阶段和进度、取消、成功/有损/失败结果，以及不泄露路径。

**精确测试命令：**

```powershell
npm test -- --runInBand src/renderer/export/__tests__/ExportModal.test.tsx src/renderer/export/__tests__/export-operation.test.ts src/renderer/export/__tests__/export-controller.test.ts
```

**完成后提交：**

```powershell
git add src/renderer/export
git commit -m "refactor(export): match approved export states"
```

## 功能模块四：回收站、恢复反馈与永久删除

**目标与功能逻辑：** 回收站使用清晰的条目分隔、元数据和恢复/永久删除操作；恢复成功在列表顶部显示内联成功提示；永久删除确认使用危险说明与右对齐危险主操作。保留原位置可用时直接恢复、原位置缺失时选择目录、单条永久删除确认、缺失项刷新和操作失败逻辑，并覆盖 loading、empty、error 和分页状态。

**关键接口：** `TrashController.restore`/`deletePermanent` 不变；`TrashList` 继续通过 `onRestore(item)` 和 `onDelete(item)` 上报操作；`RestoreTrashModal` 与 `DeleteTrashModal` 只负责确认所需输入和呈现状态。

**涉及文件：**

- 修改 `src/renderer/trash/TrashModal.tsx`
- 修改 `src/renderer/trash/TrashList.tsx`
- 修改 `src/renderer/trash/RestoreTrashModal.tsx`
- 修改 `src/renderer/trash/DeleteTrashModal.tsx`
- 修改 `src/renderer/trash/__tests__/TrashModal.test.tsx`

**单元测试：** 验证条目类型与过期元数据、直接恢复、目标文件夹恢复、恢复成功提示、永久删除确认/取消、危险操作 loading、缺失/失败反馈、空/加载/错误状态和分页。

**精确测试命令：**

```powershell
npm test -- --runInBand src/renderer/trash/__tests__/TrashModal.test.tsx src/renderer/trash/__tests__/trash-controller.test.ts
```

**完成后提交：**

```powershell
git add src/renderer/trash
git commit -m "refactor(trash): match approved recovery flows"
```

## 功能模块五：设置界面与主题/语言状态

**目标与功能逻辑：** 设置界面还原顶部标签页、三段式主题选择和语言控件；个人资料与安全页继续提供自动锁定、重命名、修改密码、立即锁定和从设备移除。主题选择使用 System/Light/Dark 可见选择态，修复简体中文显示文本；更新期间提供 disabled/loading，失败时显示内联错误，不改变现有设置保存接口。

**关键接口：** `SettingsModal` 的 device/profile 与回调签名不变；`GeneralSettings.onUpdate(Partial<DeviceSettings>)` 不变；`ProfileSecuritySettings` 的自动锁定、重命名、密码、锁定、移除回调不变。

**涉及文件：**

- 修改 `src/renderer/settings/SettingsModal.tsx`
- 修改 `src/renderer/settings/GeneralSettings.tsx`
- 修改 `src/renderer/settings/ProfileSecuritySettings.tsx`
- 修改 `src/renderer/settings/__tests__/SettingsModal.test.tsx`

**单元测试：** 验证标签页、主题单选组、语言选择、设置更新 loading/error、自动锁定可选值以及安全页现有操作；确认不存在未批准的 Never 或 Switch profile 选项。

**精确测试命令：**

```powershell
npm test -- --runInBand src/renderer/settings/__tests__/SettingsModal.test.tsx src/main/ipc/__tests__/settings-handlers.test.ts src/shared/ipc/__tests__/settings-app-contracts.test.ts
```

**完成后提交：**

```powershell
git add src/renderer/settings
git commit -m "refactor(settings): match approved preferences UI"
```

## 最终验证

所有模块完成后只运行一次相关单元测试全集，再按 CSS、TypeScript 和 Webpack 集成风险运行一次 typecheck、受影响文件 lint 和 renderer build。启动开发环境后，通过 Edge 在 375px、768px、1440px 三档视口逐一打开五类模态框，对照 Figma 检查布局、字体、间距、圆角、遮罩和状态；只修复本次重构造成或暴露的偏差，并仅重跑对应失败检查。

```powershell
npm test -- --runInBand src/renderer/search src/renderer/history src/renderer/export src/renderer/trash src/renderer/settings src/renderer/shared-ui src/renderer/navigation/__tests__/NavigationWorkspace.test.tsx
npm run typecheck
npx eslint src/renderer/search src/renderer/history src/renderer/export src/renderer/trash src/renderer/settings src/renderer/shared-ui src/renderer/navigation/NavigationWorkspace.tsx --ext .ts,.tsx
npm run build:renderer
npm start
```

**快速一致性检查结果：** 11 个目标节点均被搜索、历史版本、导出、回收站、设置五个模块覆盖；接口命名与现有实现一致；未包含同步或产品结构变更；没有占位项。
