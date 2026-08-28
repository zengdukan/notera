# New Note 编辑器 Provider 修复设计

日期：2026-08-28

## 背景与根因

点击“New Note”后，笔记工作区首次挂载 `EditorSurface`，其内部的 Atlaskit `Editor` 会在首帧调用 `useMathEditor()` 与 `useMermaidEditor()`。这两个 hook 都要求组件树中存在对应的 Provider。

应用壳重构前，`App.tsx` 使用 `MathEditorProvider` 和 `MermaidEditorProvider` 包裹编辑器。重构为 `AppProviders` 与 `AppShell` 后，这两个 Provider 被移除；后续接入笔记工作区时也没有恢复。因此新笔记挂载编辑器时首先抛出 `useMathEditor must be used inside MathEditorProvider`。如果只恢复数学 Provider，渲染会继续在 Mermaid hook 处失败。

## 目标与范围

本次修复目标是恢复应用级数学公式与 Mermaid 编辑器上下文，使新建笔记能够正常挂载编辑器，并保持两个扩展的插入、编辑能力。

范围仅包含渲染进程 Provider 装配及其单元回归测试。不修改笔记创建逻辑、编辑器数据模型、同步协议、同步引擎、云端 API、同步 Outbox、同步冲突或远端附件状态。

## 方案

在 `src/renderer/app/AppProviders.tsx` 中恢复应用级 `MathEditorProvider` 与 `MermaidEditorProvider`，放置在已有的国际化、查询客户端和会话 Provider 树内，并包裹 `children`。

采用应用级装配的原因：

- 与应用壳重构前的工作结构一致。
- 所有通过应用壳渲染的编辑器入口都能获得完整上下文，不依赖各个调用方重复包裹。
- 数学和 Mermaid 对话框共享应用级生命周期，避免每个 `EditorSurface` 实例创建独立的模态状态。
- 保留两个 hook 对缺失 Provider 的显式报错，继续尽早暴露装配错误。

Provider 顺序沿用原结构：`MathEditorProvider` 外层、`MermaidEditorProvider` 内层。两者没有数据依赖，顺序不改变业务行为，但沿用既有顺序可减少不必要差异。

## 关键接口与数据流

不新增公共接口，也不修改现有组件属性。

渲染链路为：

`App` → `AppProviders` → `AppShell` → `NoteWorkspace` → `EditorSurface` → `Editor`。

修复后，`Editor` 调用 `useMathEditor()` 和 `useMermaidEditor()` 时分别取得 Provider 暴露的打开对话框函数。工具栏、双击扩展节点和扩展 Provider 继续使用这些函数，不需要额外适配。

## 测试设计

在 `src/renderer/app/__tests__/AppProviders.test.tsx` 增加集成回归用例，在 `AppProviders` 内挂载同时调用 `useMathEditor()` 和 `useMermaidEditor()` 的测试组件，并断言组件成功渲染且两个 hook 均返回函数。

该测试在当前缺陷代码上应因缺失 `MathEditorProvider` 抛出与用户报告一致的错误。恢复数学 Provider 后，它还会捕获缺失 Mermaid Provider 的同类问题；完整实现后通过。测试使用真实 context 与 Provider，不模拟 hook 行为。

模块实现期间运行：

```powershell
npm test -- --runInBand src/renderer/app/__tests__/AppProviders.test.tsx
```

最终验证运行相关 Provider 测试全集与应用 TypeScript 检查：

```powershell
npm test -- --runInBand src/renderer/app/__tests__/AppProviders.test.tsx src/renderer/atlassian-editor/math/MathEditorProvider.test.tsx src/renderer/atlassian-editor/mermaid/MermaidEditorProvider.test.tsx
npm run typecheck:app
```

## 涉及文件与提交

- `src/renderer/app/AppProviders.tsx`：恢复两个编辑器 Provider 的应用级装配。
- `src/renderer/app/__tests__/AppProviders.test.tsx`：新增缺失 Provider 的回归测试，或在已有文件中追加该用例。

测试和实现作为同一个完整功能模块提交，提交信息使用 `fix(renderer): restore editor dialog providers`。

## 完成标准

- 点击“New Note”挂载编辑器时不再出现 Math 或 Mermaid Provider 缺失异常。
- 数学与 Mermaid hook 在应用 Provider 树下均可正常取得打开对话框函数。
- 相关 Provider 单元测试全部通过。
- 应用 TypeScript 检查通过。
