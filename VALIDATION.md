# 桌面验收记录

2026-10-18，本机 DeepSeek Harness 0.2.1-rc.2（332895e），Desktop profile。

已通过官方 CLI 安装 link bundle，当前保持启用。检查使用正在运行的真实桌面 Electron 页面，没有用 HTML 原型或模拟渲染替代。

## 验收结果

| 检查 | 结果 |
| --- | --- |
| 原工作区上方仅新增一个全局区域，只有运行中／待完结两页 | 通过 |
| 两个实际工作区的会话聚合及项目来源标签 | 通过 |
| 点击会话使用原生导航，标题对应正确会话 | 通过 |
| 正常结束后手动完结，聚合移除而原工作区仍保留 | 通过 |
| 完结后不切换当前会话，撤销恢复聚合行 | 通过 |
| 新一轮活动使旧完结记录失效 | 通过 |
| 实际 Agent 运行时进入运行中，结束后转待完结 | 通过：专用 Agent 在 pre-step 前拦截，无模型请求；拒绝后显示运行失败 |
| 后台刷新／完结／撤销不写聊天事件 | 通过：两条专用会话操作前后 seq 均为 7；聊天未出现内部命令 |
| 冷会话完结无需激活 Agent | 通过：prepared observation，完结后 Agent 仍不存在 |
| 完整退出并重启桌面，完结记录仍有效 | 通过：A 保持隐藏，B 仍显示；重启后 reopen 恢复 A |
| 浅色／深色继承宿主主题 | 通过：实际界面截图已检查；主题恢复为原来的跟随系统 |
| 组件禁用后恢复原列表，重新启用只有一个区域 | 通过：等待官方开关保存状态后重复完整往返验证 |
| 清理后的原工作区保留、任务区无错误 | 通过：一个原生工作区树，一个新增区域，QA 行为 0 |

## 实测修复

1. link bundle 不应导入仅能在安装目录解析的 storage-domain identity helper。改用公开结构 DomainSpec，并直接导入未重写的原始 Host 入口做回归检查。
2. 压缩版原生组件注册者名称不稳定。按原生工作区插槽结构契约识别，补上压缩版注册者回归测试。
3. UI 不能用人类 slash command 做后台元数据传输。改为原生 connection exact Fetch route，继承 owner 认证；冷会话走 sessionQuery 的可释放 observation。实际桌面已证明无新聊天记录。

`npm test`：17 项通过，包含构建、Host 原始入口导入、聚合、过期操作、存储失败、响应竞争、插槽卸载恢复和后台接口测试。

## 环境恢复和证据

专用 GlobalTasks QA 工作区已移除，专用测试会话已归档，保留原生日志用于追溯。早期测试夹具标题缺少原生必需字段，导致夹具自身无法冷加载；未改写该日志，后续改用原生 sessionTitle.rename 创建有效夹具，并完成冷加载与重启验收。用户原有会话、工作区、完结记录没有被重置。

官方开发者工具已恢复关闭，临时 Host 测试句柄已释放；重启后的临时全局测试属性不存在。桌面恢复到原任务规划会话、跟随系统主题，搜索已清空。
最终以无调试参数的正常方式重新启动桌面，临时 9223／9230 监听均已关闭。

早期命令传输测试曾在原任务规划等会话留下 global-tasks 命令记录。这些历史记录保留，未回写或删除用户日志；最终实现的后台操作不再产生这些记录。

本地实际截图（不打入安装包）：
- `.qa/desktop-light.png`
- `.qa/desktop-dark.png`
- `.qa/desktop-disabled.png`
- `.qa/desktop-final.png`

兼容边界：仅验证本机 0.2.1-rc.2。该版本没有 before-workspaces 插槽，使用可卸载组件包装适配；升级 Harness 后应复核插槽契约。独立错误边界和结构检查用于保留原界面。原有 side-chat 插件兼容异常与本插件无关，未修改。

2026-10-18 后续界面调整：按用户要求移除完结成功提示和撤销条，完结后直接移除聚合行；后台 reopen 能力保留。已重新构建、通过源码及产物语法检查并更新安装包。此项调整未重新执行桌面点击验收。

2026-10-30 · 0.2.0：把「待完结」拆成「待处理」和「待确认」两个标签，默认打开「待处理」；列表高度改为可拖拽（双击恢复默认，按窗口记忆），项目标签最大宽度由 82px 放宽到 112px。

- 代码：`src/model.js` 输出 `running / attention / review` 三组并导出 `TABS`、`ATTENTION_STATES`；`src/client.js` 标签数组与键盘导航改为按 `TABS` 泛化，新增指针拖拽与键盘调高；`src/styles.js` 移除固定 `max-height`，新增 `.dsgt-grip`。
- 测试：`npm test` 26 项通过（模型 8、适配 5、Host 状态 3、客户端传输 2、传输 1、Host 导入 1）。新增「三标签互斥」「待输入归入待处理」「完结记录不能压掉待处理」三项用例。
- 尚未完成：三标签切换与默认页需在真实 0.2.1-rc.2 桌面上复核。拖拽调整任务区高度已由用户在真实桌面确认可用（2026-10-30）；手柄的键盘微调与双击复位仍待逐项验证。
- 高度交互实现要点：手柄位于任务列表与原生工作区列表之间，拖动改变任务区自身高度，工作区列表随之上下移动；用 Pointer Capture 而非 `preventDefault()`，避免吞掉双击复位；最小 96px、最大 60% 窗口高度；值存 `localStorage` 的 `dsh-global-tasks:list-height`，属界面偏好而非任务元数据。

## 2026-10-30 · 0.3.0：会话树与批量清除

改在 `dsh-global-tasks-backup-0.2.0/` 备份之上进行，0.2.0 原样保留。

### 新增

| 项 | 实现 |
| --- | --- |
| 主区会话树 | `src/tree.js` 纯投影 + `src/tree-view.js` 组件 + `src/tree-styles.js`；注册到 `main` 槽（key `global-session-tree`） |
| 打开方式 | 任务区底部「浏览全部会话 N ↗」→ `ctx.layout.selectPanel('global-session-tree')` |
| 返回 | 面板标题栏「← 返回会话」→ `selectPanel(null)` |
| 会话跳转 | `ctx.uiWorkspace.openSession(id)`，与侧栏行同一入口 |
| 批量清除 | 「待处理」标签下「全部清除」→ Host `dismiss` 动作，复用 `completions` 表 |

### 设计取舍

- **没有升级 storage domain 版本**。`dsh-storage` 明确「stored version differing from the descriptor rejects `version-mismatch` (no migration)」，新增表会强制 v2 并丢掉已有完结记录。改为复用 `completions` 表：`dismiss` 与 `complete` 写入同一记录形状（`userSeq`/`startSeq`/`completedAt`），活动推进即自动失效，因此不需要 `kind` 字段。
- **`shell.leading` 不可用**。源码为 `const leadingMounted = darwin && sidebarCollapsed`，Windows 上永不渲染，故入口放在侧栏任务区底部而非窗口左上角。
- **`main` 面板拿不到 `open`**。该槽的 owner props 只有 `useSessions`/`useWorkspaces`/`useSessionStatus` 等，跳转必须走 `ctx.uiWorkspace`，故 `inject` 增加 `uiWorkspace` 与 `layout`。

### 测试

`npm test` 33 项通过（模型 8、树 9、适配 5、Host 状态 7、客户端传输 2、传输 1、Host 导入 1）。新增树投影 9 项、`dismiss` 4 项。

### 未完成

- **会话树与「全部清除」尚未在真实桌面点击验收**。尝试用 CDP 直连 Web GUI（`http://127.0.0.1:51720`）验证，页面返回 `dsh web authentication required`，需要 `dsh web` 打印的带 token URL，本次未取得。因此树的实际渲染、`selectPanel` 切换、`uiWorkspace.openSession` 跳转、批量清除的 Host 往返均只有静态与单元级证据。
- 构建仍在受限沙箱内用 `node_modules/@esbuild/win32-x64/esbuild.exe` CLI 出包后按 `build.mjs` 模板包装，与 `npm run build` 等价。
- 构建说明：本次构建在受限沙箱内完成，esbuild 的 JS API 无法 spawn 子进程，改用 `node_modules/@esbuild/win32-x64/esbuild.exe` CLI 出包后按 `build.mjs` 的同一模板包装，产物与 `npm run build` 等价。

## 2026-10-30 · 0.2.1-rc.5 复核与标题栏精简

宿主升级到 Desktop 0.2.1-rc.5（`dshBuildCommit d4db512a`，bundled runtime `@deepseek-ai/dsh-desktop-runtime@0.2.1-rc.5`）后复核插槽契约，并从实测截图确认插件区域正常渲染。

### 契约复核（对照 asar 内 `dsh-client-ui-workspace/lib/client.js`）

| 契约点 | rc.5 实测 | 结论 |
| --- | --- | --- |
| `sidebar.workspaces` 注册 | 仍然 `children` 含 `sidebar.workspaces.session.menu.item`、`store: viewStore`、`inject: browserInjected` | `attachWorkspaceAdapter` 的三特征识别继续命中 |
| 原生组件 props | `WorkspaceBrowser({ wide, usePanelInfo, useSessions, useSessionStatus, useWorkspaces, open, … })` | 包装层的前置兼容性检查仍成立 |
| `main` 面板 | `renderSlot("main", {}, { entryKey: usePanelInfo(info => info.activePanelId) ?? "conversation" })` | 树面板的 keyed 注册与 `selectPanel` 校验未变 |
| `layout.selectPanel` | `if (panelId !== null && !this.hasMainPanel(panelId)) throw` | 未注册 key 仍会抛错，行为一致 |
| 客户端模块装载 | `window.__ModuleLoader__.load({id, factory})` | `build.mjs` 产物格式无需改动 |

### 标题栏精简

按要求删除标题栏右槽的「所有工作区 / All workspaces」文案：`src/client.js` 折叠态改为渲染 `null`，`src/styles.js` 删除 `.dsgt-scope` 规则与 `dsgt-head-searching` 相关描述，locale 表移除 `scope` 键。标题右侧只剩放大镜按钮，点击就地展开搜索框，Esc 或清空后收起。

- 构建：`node build.mjs` 通过，`client.js` 53178 字节；`node --check index.js` / `client.js` 均通过。
- 自动检查：33 项全部通过（模型 8、树 9、适配 5、Host 状态 7、客户端传输 2、传输 1、Host 导入 1）。
- 产物校验：`client.js` 中已无 `所有工作区` 与 `dsgt-scope` 残留。
- 真实桌面：截图中该文案已被移除，三个标签、列表、高度手柄与「浏览全部会话」均正常。
