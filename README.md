# CLI Multi-Agent Debate Tool

一个基于终端的多 Agent 协作工具，让 AI Agent（如 Claude Code、Codex 等）在命令行内进行"方案生成—评审—共识"的辩论协作。

## 特性

- **tmux 可视化**：双 pane 布局，实时观察两个 Agent 对话
- **通用 Agent 支持**：任何 CLI 工具都可接入（Claude Code、Codex、Coco 等）
- **共识检测**：自动解析 `AGREE/REASON/FINAL_ANSWER` 判断是否达成一致
- **产物落盘**：JSONL 日志 + 最终方案输出
- **终端无关**：Warp、iTerm2、VS Code 终端、SSH 均可运行

## 安装

```bash
# 克隆仓库
git clone https://github.com/ontheway703/cli-multi-agent.git
cd cli-multi-agent

# 安装依赖
npm install

# 编译
npm run build

# 确保 tmux 已安装
brew install tmux  # macOS
```

## 快速开始

```bash
# 启动辩论
npm run debate -- start --topic "设计一个用户认证系统" --max-rounds 5

# 查看活动会话
npm run debate -- status

# 附加到会话
npm run debate -- attach

# 停止会话
npm run debate -- stop
```

## 命令详解

### `debate start`

启动新的辩论会话。

```bash
npm run debate -- start [options]

Options:
  -t, --topic <topic>        辩论主题（必填）
  -r, --max-rounds <number>  最大轮次（默认: 10）
  -a, --attach               启动后附加到会话（默认: true）
  --no-attach                后台运行
  --proposer <command>       Proposer Agent 命令（默认: claude）
  --reviewer <command>       Reviewer Agent 命令（默认: claude）
  -o, --output <dir>         输出目录（默认: ./debate-output）
```

**示例：**

```bash
# 使用 Claude Code 进行自我辩论
npm run debate -- start -t "评审这个 API 设计方案"

# 使用不同的 Agent
npm run debate -- start -t "代码重构策略" --proposer claude --reviewer codex

# 后台运行
npm run debate -- start -t "技术选型讨论" --no-attach
```

### `debate attach`

附加到已运行的辩论会话。

```bash
npm run debate -- attach [--session <name>]
```

### `debate status`

查看所有活动的辩论会话。

```bash
npm run debate -- status
```

### `debate stop`

停止辩论会话。

```bash
npm run debate -- stop [--session <name>] [--all]
```

### `debate logs`

查看辩论日志。

```bash
npm run debate -- logs [-o <output-dir>]
```

## 界面布局

```
┌─────────────────────────────────────────────────────────────┐
│  debate session                                              │
├────────────────────────────┬────────────────────────────────┤
│   [Proposer Pane]          │   [Reviewer Pane]              │
│   Agent A 实时输出          │   Agent B 实时输出             │
│                            │                                 │
├────────────────────────────┴────────────────────────────────┤
│  Round 2/10 | Status: reviewing | Topic: API设计             │
└─────────────────────────────────────────────────────────────┘
```

**快捷键：**
- `Ctrl+b d` - 退出会话（后台继续运行）
- `Ctrl+b o` - 切换 pane
- `Ctrl+b [` - 进入复制模式（滚动查看）

## 配置自定义 Agent

通过配置文件 `.debaterc.yaml` 自定义 Agent：

```yaml
agents:
  proposer:
    command: "claude"
    promptPattern: "^>\\s*$"
    timeout: 180
  reviewer:
    command: "codex"
    promptPattern: "^\\$\\s*$"
    timeout: 180

maxRounds: 10
outputDir: "./debate-output"
```

## 共识格式

Reviewer Agent 需要在回复末尾使用以下格式：

**同意时：**
```
AGREE: YES
REASON: 同意的理由
FINAL_ANSWER: 最终方案
```

**需要修改时：**
```
AGREE: NO
REASON: 不同意的理由
FEEDBACK: 具体改进建议
```

## 输出文件

辩论结束后，产物保存在 `./debate-output/<session-id>/`：

```
debate-output/
└── debate-xxxx/
    ├── rounds.jsonl    # 每轮详细记录
    ├── final.txt       # 达成共识时的最终方案
    └── last.txt        # 未达成共识时的最后状态
```

## 开发

```bash
# 监听文件变化自动编译
npm run dev

# 测试 tmux 集成
npm run test:tmux

# 运行测试
npm test
```

## 项目结构

```
cli-multi-agent/
├── src/
│   ├── index.ts           # CLI 入口
│   ├── orchestrator.ts    # 协调器核心
│   ├── state-machine.ts   # 状态机
│   ├── tmux/              # tmux 操作封装
│   ├── agents/            # Agent 适配器
│   ├── consensus/         # 共识检测
│   ├── logger/            # 日志记录
│   └── config/            # 配置
├── bin/debate.js          # CLI 入口脚本
└── scripts/test-tmux.ts   # tmux 测试脚本
```

## 依赖

- Node.js >= 18
- tmux

## License

MIT
