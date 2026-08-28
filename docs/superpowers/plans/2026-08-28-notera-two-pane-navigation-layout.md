# Notera 两区导航布局修复实施计划

> **执行说明：** 本计划在当前会话内直接实施；遵循项目规则，不派发额外审核代理。

**目标：** 修复解锁后的主界面，使其严格呈现“可调整/可折叠左侧导航 + 占据剩余空间的中央工作区”，并在折叠后保留主要图标入口。

**架构：** 展开态继续使用 ADS Navigation System 的 `Root`、`SideNav`、`SideNavPanelSplitter` 和 `Main`；组件本地状态只跟踪折叠展示，折叠态在 `Main` 内呈现基于 ADS Icon Button、Tooltip、Primitives 和 Tokens 的紧凑入口栏。Electron 窗口的默认宽度和最小宽度保持在 ADS 桌面侧栏断点之上，避免首次启动落入无入口的移动端布局。

**技术栈：** Electron、React 18、TypeScript、Atlaskit Navigation System/Primitives/Button/Icon/Tooltip、Jest、Testing Library。

---

## 功能模块 1：恢复桌面两区布局与折叠图标栏

**目标与功能逻辑**

展开时左侧导航按 Profile/锁定、搜索/新建、收藏、最近使用、回收站、设置、内容树的顺序显示，侧栏可通过 ADS splitter 调整宽度，中央工作区占据剩余空间。点击折叠后隐藏完整侧栏和内容树，在中央工作区左边保留可展开、锁定、搜索、新建、收藏、最近使用、回收站、设置的图标入口；展开后恢复完整侧栏。窗口首次创建时使用 1280 宽度和 1120 最小宽度，确保内容视口稳定处于 ADS `64rem` 桌面断点之上。

**关键接口**

`ResizableNavigation` 保持现有业务回调接口不变；内部通过 ADS `SideNav` 的 `onCollapse`/`onExpand` 同步折叠展示，并通过 Navigation System 的公开 `useToggleSideNav()` 恢复展开。`BrowserWindowFactory.create()` 的参数继续显式包含 `minWidth`。

**涉及文件**

- 修改：`src/renderer/navigation/ResizableNavigation.tsx`
- 新建测试：`src/renderer/navigation/__tests__/ResizableNavigation.test.tsx`
- 修改：`src/renderer/navigation/NavigationHeader.tsx`
- 修改测试：`src/renderer/navigation/__tests__/NavigationHeader.test.tsx`
- 修改：`src/renderer/navigation/NavigationWorkspace.tsx`
- 修改：`src/main/window.ts`
- 修改测试：`src/main/__tests__/window.test.ts`
- 新增计划：`docs/superpowers/plans/2026-08-28-notera-two-pane-navigation-layout.md`

**单元与组件测试**

- 验证窗口默认宽度为 1280、最小宽度为 1120，均能承载 ADS 桌面两区布局。
- 验证展开态包含规范要求的完整侧栏顺序和内容树。
- 验证触发折叠后内容树消失、中央工作区仍存在、主要图标入口仍可见且业务回调可用。
- 验证从折叠图标栏可以重新展开完整侧栏。

**精确测试命令**

```powershell
npm test -- --runInBand src/main/__tests__/window.test.ts src/renderer/navigation/__tests__/ResizableNavigation.test.tsx src/renderer/navigation/__tests__/NavigationHeader.test.tsx
```

预期：两个测试文件全部通过，0 个失败。

**完成后的提交**

```powershell
git add docs/superpowers/plans/2026-08-28-notera-two-pane-navigation-layout.md src/main/window.ts src/main/__tests__/window.test.ts src/renderer/navigation/ResizableNavigation.tsx src/renderer/navigation/NavigationHeader.tsx src/renderer/navigation/NavigationWorkspace.tsx src/renderer/navigation/__tests__/ResizableNavigation.test.tsx src/renderer/navigation/__tests__/NavigationHeader.test.tsx
git commit -m "fix(renderer): restore two-pane navigation layout"
```

**快速一致性检查：** 计划只覆盖本地 Renderer 布局和窗口尺寸，不涉及同步协议、同步引擎、云端 API、Outbox、冲突或远端附件状态；测试、实现、验证和提交均归入同一完整功能模块。
