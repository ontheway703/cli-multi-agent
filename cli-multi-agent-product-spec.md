# CLI 多 Agent 协作工具：需求与用户体验说明

> 面向终端（Warp/iTerm2/VS Code 终端/SSH）的一款可视化多 Agent 协作工具，支持如 Claude Code 与 Codex 在命令行内多轮对话，生成与评审方案，直到达成一致。

本文聚焦产品视角：需求、用户体验、操作路径与技术选型约束。实现细节参见《cli-multi-agent-implementation.md》与《debate-system-design.md》。

## 一、背景与目标

- 目标：在命令行中快速编排两个（或多个）CLI 智能体相互对话，形成“方案生成—评审—迭代—共识”的闭环；同时提供过程可视化与进度感知。
- 范式：
  - Proposer（如 Claude Code）：提出方案。
  - Reviewer（如 Codex）：审查并提出改进建议；满足要求时明确“同意/通过”。
- 成功标准：在配置的最大轮次内达成“共识”（AGREE: YES）并产出最终结论；或在达不到共识时给出清晰的“最后版本”与原因说明。

## 二、用户画像与使用场景

- 画像：
  - 开发者/架构师：需要在本地快速对齐方案与风险点。
  - 团队内评审者：希望可复盘的对话与可视化过程。
  - 运维/平台工程师：偏好通用终端（Warp/SSH/CI）一致体验。
- 场景：
  - 技术方案初稿生成与审查；
  - 代码改造策略辩论；
  - 风险评估与上线检查清单共创；
  - 教学演示：展示多 Agent 协作思考过程。

## 三、核心需求

1) 多 Agent 协作
- 支持至少 2 个 Agent（后续可扩展到 N 个）。
- 轮次驱动：Proposer → Reviewer →（必要时）Proposer 迭代 → …
- 共识判定：按约定字段判定（AGREE/REASON/FINAL_ANSWER）。

2) 上下文与可视化
- 进程持久：同一 Agent 在其进程内保持上下文。
- 可视化观看：用户可实时看到两个 Agent 的对话过程。
- 总进度可见：显示当前轮次、最大轮次、状态（等待/处理中/共识达成）。

3) 可操作性与审计
- 可中断/恢复：用户可在会话中断后再次进入继续观看。
- 产物落盘：保存最终方案与每轮摘要（日志与 JSONL）。
- 错误可见：超时、重试、进程异常有清晰提示与处理策略。

4) 兼容性
- 终端无关：Warp、iTerm2、VS Code 终端、SSH 均可运行。
- 平台优先：macOS、Linux；Windows 通过 WSL 或等效方案。

## 四、非目标（当前版本）

- 不依赖 GUI 专有 API（如 iTerm2 Python API）。
- 不内置云端会话管理/鉴权；本地运行优先。
- 不强制依赖特定模型或供应商；只假设有可交互的 CLI 工具。

## 五、技术选型（面向体验的约束）

- 首选：tmux 协调器（与终端无关、可 attach 可复盘，最佳可视化一致性）。
- 可选增强：Node.js TUI（blessed/ink）作为“总控台”展示，但不替代 tmux。
- 兜底：PTY 直连（无 tmux 的极简/容器场景）。
- 若目标 CLI 提供 SDK/API（HTTP/Socket/官方 SDK），优先走 SDK 路径（更稳），但不影响可视化策略。
- 结论：为支持 Warp，放弃 iTerm2 专属实现。

## 六、用户体验设计（UX）

1) 布局与信息架构
- tmux 窗口（Window: agents）：
  - 左 Pane：Proposer（如 Claude Code）。
  - 右 Pane：Reviewer（如 Codex）。
  - 底部细 Pane 或状态栏：总进度/摘要（Round x/N、状态、最终结论提示）。
- tmux 状态栏：`status-right` 展示“Round x/N | 进度条 | 状态（waiting/reviewing/agreed）”。

2) 状态语义
- 状态：idle / prompting / generating / reviewing / agreed / timeout / error / stopping。
- 高亮提示：达成一致时在底部 Pane 与状态栏高亮“AGREED”，并输出最终结论路径（final.txt）。

3) 产物与复盘
- 每轮摘要：提取 AGREE/REASON/FINAL_ANSWER 字段，写入 JSONL。
- 最终产物：`debate.final.txt` 或 `debate.last.txt`（达成一致/未达成）。
- 全量日志：原始 tmux 输出落盘便于复盘。

4) 键位与提示
- 直接使用 tmux 原生操作：`Ctrl-b %`（分屏）、`Ctrl-b o`（切 pane）、`Ctrl-b [`（复制）。
- 提示帮助：底部 Pane/状态栏在首次启动时显示“常用键位与命令提示”。

## 七、用户操作路径（命令草案）

为统一体验，这里定义用户侧命令抽象（实现可用 shell/Node/Go 包装 tmux 命令）：

- 启动并进入可视化
  - `debate start --attach --topic "<主题>" [--max-rounds 10]`：
    - 创建 tmux 会话与两 Pane，启动 Proposer/Reviewer。
    - 注入系统约束与首轮内容，显示状态栏与底部进度。
    - 直接 attach 进入对话视图。

- 后台运行
  - `debate start --no-attach --topic "<主题>"`：后台运行，用户可稍后进入。
  - `debate attach`：进入已运行会话。
  - `debate status`：命令行打印当前轮次、状态、近一轮结论。

- 过程控制
  - `debate pause` / `debate resume`：暂停/继续轮次推进（可选）。
  - `debate stop`：结束会话，保持产物与日志。

- 审计与导出
  - `debate logs`：打开/打印日志目录路径。
  - `debate export --final`：输出最终方案文件路径。

## 八、配置与约束

- 环境依赖：
  - `tmux` 可用；
  - 安装可交互的 CLI Agent（如 `claude`、`codex` 等）；
  - 可选：Node.js（若启用 TUI 总控台）。
- 关键参数（环境变量/YAML）：
  - `MAX_ROUNDS`、`TURN_TIMEOUT`；
  - `PROPOSER_CMD`、`REVIEWER_CMD`；
  - 布局：`LAYOUT=split-horizontal|split-vertical`，`CAPTURE_BACKLOG`；
  - 日志：目录、是否启用 JSONL。

## 九、共识与终止条件（体验层）

- 共识：
  - 判定规则：检测 Reviewer 输出中的 `AGREE: YES` 与（可选）`FINAL_ANSWER:` 存在且非空。
  - 达成时：
    - 状态栏显示 `AGREED`；
    - 底部 Pane 输出最终结论摘要与保存路径；
    - 自动停止后续轮次推进（会话可保留供查看）。
- 超时与未达成：
  - 超过最大轮次则停止推进；
  - 落盘 `debate.last.txt`，并提示“未达成一致”。

## 十、故障与恢复（用户视角）

- 超时：状态栏与底部 Pane 显示 `TIMEOUT`，协调器可尝试重试 M 次；失败则停止。
- 进程异常：自动拉起对应 Agent，并回放必要的上下文提示语（在可行范围内），同时提示用户。
- 用户中断：会话仍在后台，可 `debate attach` 恢复；若停止则保留产物与日志。

## 十一、体验差异化与后续演进

- 差异化：在“不依赖 GUI”的前提下，实现 tmux 内可视化、状态栏进度、底部摘要，通用于 Warp/SSH/CI。
- 可选增强：
  - Node.js TUI（blessed/ink）作为独立“总控台”：多窗口展示两 Agent 输出、增量进度、可操作按钮（暂停/继续/导出）。
  - SDK 模式：当 CLI 提供 API 时，转向结构化通信，简化解析，提高稳定性；可保留 tmux 可视化只读视图。
  - 多 Agent 扩展：专家投票、角色编排、复合共识策略。

---

以上为产品侧的需求与体验规范。若需要，我可以将“命令草案”细化为参数定义与帮助文档，并与实现文档对齐，形成一套一致的用户手册与运行手册。

