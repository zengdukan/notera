# New Note 编辑器 Provider 修复实施计划

> **执行要求：** 使用 `superpowers:executing-plans` 在当前会话内执行；不派发子代理，不进行逐任务审核或重复自审。

**目标：** 恢复应用级数学公式与 Mermaid 编辑器 Provider，使点击“New Note”后编辑器能够正常挂载，并用单元回归测试防止 Provider 再次遗漏。

**架构：** 在应用统一 Provider 入口 `AppProviders` 中恢复 `MathEditorProvider` 与 `MermaidEditorProvider`，沿用重构前的嵌套顺序，使所有经应用壳渲染的编辑器共享完整上下文。测试在真实 `AppProviders` 下调用两个真实 context hook，验证装配而非模拟实现。

**技术栈：** React 18、TypeScript、Jest 29、Testing Library、React Intl、TanStack Query、Atlaskit App Provider。

**规格：** `docs/superpowers/specs/2026-08-28-new-note-editor-provider-fix-design.md`

## 全局约束

- 仅修改渲染进程 Provider 装配及其单元测试，不修改笔记创建逻辑和编辑器数据模型。
- 不涉及同步协议、同步引擎、云端 API、同步 Outbox、同步冲突或远端附件状态。
- 测试与实现属于同一个可独立验证的功能模块，并在全部验证通过后提交一次。
- 实施期间只运行当前模块测试；模块完成后只运行一次相关 Provider 测试全集和应用 TypeScript 检查。

---

### 功能模块 1：恢复编辑器对话框 Provider 装配

**目标与功能逻辑：** `Editor` 首帧调用 `useMathEditor()` 与 `useMermaidEditor()` 时必须分别读取到应用级 Provider 提供的打开对话框函数。`AppProviders` 在现有 `AppProvider`、`IntlProvider`、`QueryClientProvider` 和 `SessionProvider` 树内，以 `MathEditorProvider` 外层、`MermaidEditorProvider` 内层包裹 `children`，恢复重构前的装配语义。

**关键接口：**

- 消费：`MathEditorProvider({ children }: { children: ReactNode })`、`MermaidEditorProvider({ children }: { children: ReactNode })`。
- 验证：`useMathEditor(): OpenMathEditor`、`useMermaidEditor(): OpenMermaidEditor` 均返回函数。
- 不新增或修改 `AppProviders` 的 `locale`、`queryClient`、`children` 属性。

**涉及文件：**

- 新建：`src/renderer/app/__tests__/AppProviders.test.tsx`
- 修改：`src/renderer/app/AppProviders.tsx`
- 随功能提交：`docs/superpowers/plans/2026-08-28-new-note-editor-provider-fix.md`

**单元测试与实现：**

- [x] 新增以下 jsdom 回归测试，先运行并确认当前代码因 `useMathEditor must be used inside MathEditorProvider` 失败；随后在 `AppProviders.tsx` 引入并嵌套两个 Provider，重新运行同一测试并确认通过。

```tsx
/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';

import { useMathEditor } from '../../atlassian-editor/math';
import { useMermaidEditor } from '../../atlassian-editor/mermaid';
import { AppProviders } from '../AppProviders';

function EditorContextHarness() {
  const openMathEditor = useMathEditor();
  const openMermaidEditor = useMermaidEditor();

  return (
    <output aria-label="Editor contexts">
      {typeof openMathEditor}:{typeof openMermaidEditor}
    </output>
  );
}

describe('AppProviders', () => {
  it('provides the math and Mermaid editor contexts', () => {
    render(
      <AppProviders locale="en">
        <EditorContextHarness />
      </AppProviders>,
    );

    expect(screen.getByLabelText('Editor contexts')).toHaveTextContent(
      'function:function',
    );
  });
});
```

`AppProviders` 的最小实现形态：

```tsx
<SessionProvider>
  <MathEditorProvider>
    <MermaidEditorProvider>{children}</MermaidEditorProvider>
  </MathEditorProvider>
</SessionProvider>
```

实施阶段精确测试命令：

```powershell
npm test -- --runInBand src/renderer/app/__tests__/AppProviders.test.tsx
```

最终验证命令，仅执行一次：

```powershell
npm test -- --runInBand src/renderer/app/__tests__/AppProviders.test.tsx src/renderer/atlassian-editor/math/MathEditorProvider.test.tsx src/renderer/atlassian-editor/mermaid/MermaidEditorProvider.test.tsx
npm run typecheck:app
```

完成后提交：

```powershell
git add -- docs/superpowers/plans/2026-08-28-new-note-editor-provider-fix.md src/renderer/app/AppProviders.tsx src/renderer/app/__tests__/AppProviders.test.tsx
git commit -m "fix(renderer): restore editor dialog providers"
```

**完成标准：** 新增测试已观察到预期失败并在实现后通过；相关 Provider 测试全集与 `typecheck:app` 通过；提交仅包含本功能模块的计划、实现和测试，不包含用户现有未跟踪文件。
