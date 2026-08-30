# Electron 启动与 Profile 访问 UI 重构实施计划

**目标：** 按批准的 Figma 原型重构 Electron 启动、Profile 首次创建、已有 Profile 解锁、工作区进入过渡与启动失败界面，并保持现有本地 Profile 产品结构不变。

**架构：** 继续沿用 React 18、Electron IPC、现有 `SessionProvider` 与 Profile controller；在 session reducer 中增加可测试的工作区进入过渡状态，并将启动视图与 Profile 访问视图拆成职责明确的 ADS 组件。所有颜色、字体、间距、圆角、阴影和组件状态优先使用 Atlassian Design System 组件及 tokens，少量页面级 CSS 变量只作为 ADS tokens 的语义别名。

**技术栈：** Electron 42、React 18、TypeScript 5、Atlaskit/ADS、react-intl、Jest、Testing Library、Webpack。

**设计基准：** Figma 文件 `8gPbyJRsSh2rfXAv5dUZkC` 中节点 `3:576`、`8:1386`、`3:708`、`3:1239`、`3:1014`、`3:1029`；响应式参照同页 375px 与 960px 画板。

## 全局约束

- 不修改已批准的跳转结构：booting 成功后按 Profile 数量进入首次创建或解锁，创建/解锁成功后进入工作区过渡，再显示主窗口；加载失败进入 fatal。
- 不纳入同步协议、同步引擎、云端 API、同步 Outbox、同步冲突或远端附件状态。
- Profile 创建、解锁、校验和 IPC 契约保持现有业务语义；本次只补齐启动/访问状态与 UI。
- 页面不使用截图背景，不新增自绘图标；使用 ADS 图标、组件、Typography 与 tokens。
- 每个功能模块包含失败测试、实现、模块相关测试与一次提交；全部模块结束后只执行一次最终相关测试和必要的 typecheck/lint/build。

---

### 功能模块 1：启动状态机、启动反馈与工作区进入过渡

**目标与功能逻辑：**

- `booting` 在 Profile 列表与 Session 状态并行加载期间显示批准的居中品牌、Spinner 和本地加载说明。
- 启动请求失败后进入 `fatal`，显示 ADS error SectionMessage、恢复建议和“关闭应用”按钮。
- Profile 创建或解锁成功后不直接渲染主窗口，而是先进入 `transitioning`；显示成功图标、Profile 已解锁说明和 ADS Skeleton 工作区预览，最短展示 800ms 后再进入 `unlocked`。
- 已存在的未锁定 Session 在启动恢复时直接进入主窗口，不人为增加过渡。

**关键接口：**

- `SessionState` 新增 `{ status: 'transitioning'; profile: UnlockedSession }`。
- `SessionAction` 新增 `{ type: 'transitioning'; profile: UnlockedSession }`。
- `createProfileController` 的 create/unlock 成功分支派发 `transitioning`；`AppShell` 负责 800ms 后派发 `unlocked`，组件卸载或状态改变时清理 timer。
- `FatalStartupView` 的关闭操作调用渲染进程 `window.close()`，不扩展 IPC 契约。

**涉及文件：**

- 修改：`src/renderer/app/session.tsx`
- 修改：`src/renderer/profile/profile-controller.ts`
- 修改：`src/renderer/profile/ProfileGate.tsx`
- 修改：`src/renderer/app/AppShell.tsx`
- 修改：`src/renderer/app/AppShell.css`
- 修改：`src/renderer/app/messages/en.ts`
- 修改：`src/renderer/app/messages/zh-CN.ts`
- 修改：`src/renderer/app/__tests__/session.test.tsx`
- 修改：`src/renderer/app/__tests__/AppShell.test.tsx`
- 修改：`src/renderer/profile/__tests__/profile-controller.test.ts`（若现有 controller 测试位于其他文件，则沿用现有位置）

**单元测试：**

- reducer 收到 `transitioning` 后保留完整解锁 Session，并能继续转为 `unlocked`。
- 创建/解锁 IPC 成功后先显示“Profile 已解锁”与 skeleton，800ms 内不显示工作区，timer 到期后显示工作区。
- 启动恢复到已解锁 Session 时直接显示工作区。
- 启动失败时移除 loading status，显示错误恢复信息和关闭按钮。
- 创建/解锁失败仍回到 locked，不错误进入过渡。

**精确测试命令：**

```powershell
npm test -- --runInBand src/renderer/app/__tests__/session.test.tsx src/renderer/app/__tests__/AppShell.test.tsx src/renderer/profile/__tests__/profile-controller.test.ts
```

**完成后提交：**

```powershell
git add src/renderer/app/session.tsx src/renderer/app/AppShell.tsx src/renderer/app/AppShell.css src/renderer/app/messages/en.ts src/renderer/app/messages/zh-CN.ts src/renderer/app/__tests__/session.test.tsx src/renderer/app/__tests__/AppShell.test.tsx src/renderer/profile/profile-controller.ts src/renderer/profile/ProfileGate.tsx src/renderer/profile/__tests__/profile-controller.test.ts
git commit -m "feat(profile): add startup and workspace transition states"
```

### 功能模块 2：ADS Profile 创建/解锁界面、状态与响应式布局

**目标与功能逻辑：**

- 桌面 1440px：渲染 72px 品牌栏、左侧本地加密说明和右侧固定宽度访问卡片；空 Profile 直接显示首次创建，已有 Profile 显示 Profile 列表、当前选择、创建入口和解锁表单。
- 窄屏 768–960px：将产品价值说明压缩为顶部摘要/信息区，访问卡片居中，保持完整创建/解锁能力。
- 移动 375px：隐藏桌面说明，去掉卡片边框与阴影，使用单列 20px 页面边距、全宽按钮和适合触控的 Profile 选择项。
- 使用 ADS Heading/Text/Typography、Button、Form/Field、Textfield、Menu ButtonItem、SectionMessage、Spinner、Skeleton 和官方 icons；用 `--notera-profile-*` 语义变量引用 `--ds-*` tokens，不在页面散落颜色值。
- 覆盖默认、hover、focus、disabled/loading、empty、字段错误和系统错误；错误密码保留输入并显示字段错误，系统错误替换表单为 ADS SectionMessage 与“重试”。
- 所有新增界面文案接入 `react-intl`，英文和简体中文均完整；Profile 名称等用户数据原样显示。

**关键接口：**

- `ProfileAccessPage` 继续接收 `profiles`、`isBusy`、`onCreate`、`onUnlock`，不改变业务调用方。
- `ProfileList` 增加可选的移动端展示策略但保持 `onSelect(profile)` 与 `onCreate()` 接口。
- `CreateProfileForm`、`UnlockProfileForm` 继续返回现有字段值；系统错误状态新增显式 retry 操作，retry 不缓存或重放密码。
- 抽取共享品牌栏与产品说明为纯展示组件，避免 booting/fatal/profile 页面复制布局能力。

**涉及文件：**

- 新建：`src/renderer/profile/ProfileAccessHeader.tsx`
- 新建：`src/renderer/profile/ProfileAccessHero.tsx`
- 修改：`src/renderer/profile/ProfileAccessPage.tsx`
- 修改：`src/renderer/profile/ProfileAccessPage.css`
- 修改：`src/renderer/profile/ProfileList.tsx`
- 修改：`src/renderer/profile/CreateProfileForm.tsx`
- 修改：`src/renderer/profile/UnlockProfileForm.tsx`
- 修改：`src/renderer/app/messages/en.ts`
- 修改：`src/renderer/app/messages/zh-CN.ts`
- 修改：`src/renderer/profile/__tests__/ProfileAccessPage.test.tsx`
- 修改：`src/renderer/profile/__tests__/profile-form.test.ts`

**单元测试：**

- 空 Profile 显示首次创建标题、两字段、密码不可恢复信息和提交按钮，不显示 Profile listbox。
- 已有 Profile 默认选择首项；切换 Profile、进入创建、返回任一 Profile 后显示正确表单和标题。
- 提交期间字段、选择项和创建入口均不可操作，并显示创建中/解锁中的 ADS loading 状态。
- 错误密码显示字段级错误且保留解锁上下文；系统错误显示 SectionMessage 与 retry，retry 后恢复空密码表单。
- 英文与简体中文 locale 均能渲染关键标题和操作；可访问名称、listbox/option 语义和 focusable 操作保持有效。

**精确测试命令：**

```powershell
npm test -- --runInBand src/renderer/profile/__tests__/ProfileAccessPage.test.tsx src/renderer/profile/__tests__/profile-form.test.ts
```

**完成后提交：**

```powershell
git add src/renderer/profile/ProfileAccessHeader.tsx src/renderer/profile/ProfileAccessHero.tsx src/renderer/profile/ProfileAccessPage.tsx src/renderer/profile/ProfileAccessPage.css src/renderer/profile/ProfileList.tsx src/renderer/profile/CreateProfileForm.tsx src/renderer/profile/UnlockProfileForm.tsx src/renderer/profile/__tests__/ProfileAccessPage.test.tsx src/renderer/profile/__tests__/profile-form.test.ts src/renderer/app/messages/en.ts src/renderer/app/messages/zh-CN.ts
git commit -m "refactor(profile): match approved ADS access experience"
```

## 最终验证

全部模块完成后只执行以下一次最终验证；若某项失败，只修复失败原因并重跑受影响命令：

```powershell
npm test -- --runInBand src/renderer/app/__tests__/session.test.tsx src/renderer/app/__tests__/AppShell.test.tsx src/renderer/profile/__tests__/profile-controller.test.ts src/renderer/profile/__tests__/ProfileAccessPage.test.tsx src/renderer/profile/__tests__/profile-form.test.ts
npm run typecheck:app
npm run lint -- --quiet src/renderer/app src/renderer/profile
npm run build:renderer
```

随后启动开发版，在 375px、768px、1440px 视口分别检查 booting、empty、create、unlock、transition、fatal 及 loading/error 状态，对照 Figma 修正明显的布局、字体和间距偏差；视觉修正只重跑受影响模块测试，最终不重复已通过的检查。
