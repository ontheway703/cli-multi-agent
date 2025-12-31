# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
npm run build          # Compile TypeScript
npm run dev            # Watch mode compilation
npm run debate -- <cmd>  # Run CLI commands (start, attach, status, stop, logs)
npm run test:tmux      # Test tmux integration
npm test               # Run vitest tests
```

## Architecture Overview

This is a CLI tool that orchestrates debates between AI agents (like Claude Code, Codex) using tmux for visualization.

### Core Flow

```
CLI Entry (src/index.ts)
    ↓
Orchestrator (src/orchestrator.ts)
    ├── TmuxManager (src/tmux/) - Creates session, manages panes, sends/captures content
    ├── AgentAdapter (src/agents/) - Abstracts different CLI agents
    ├── StateMachine (src/state-machine.ts) - Controls debate flow
    ├── ConsensusDetector (src/consensus/) - Parses AGREE/REASON/FINAL_ANSWER
    └── Logger (src/logger/) - JSONL logging and final output
```

### Key Design Patterns

- **Adapter Pattern**: `AgentAdapter` interface in `src/agents/adapter.ts` allows any CLI to be integrated. Implement `sendPrompt()`, `waitForResponse()`, and `isResponseComplete()`.

- **State Machine**: Debate flows through states: `idle → initializing → proposer_turn → waiting_proposer → reviewer_turn → waiting_reviewer → check_consensus → (agreed|no_consensus|next round)`

- **Response Detection**: Uses polling (`tmux capture-pane`) + stability detection (content unchanged for 3 consecutive checks) + prompt pattern matching.

### tmux Integration

All tmux operations go through `src/tmux/manager.ts`:
- `send-keys -l` for literal text (avoids escape issues)
- `capture-pane -p` for output capture
- Session naming: `debate-{timestamp}-{random}`

### Consensus Format

Reviewer output must contain:
```
AGREE: YES|NO
REASON: <text>
FINAL_ANSWER: <text>  (if agreed)
FEEDBACK: <text>      (if not agreed)
```

Parsed by `src/consensus/detector.ts` with regex + semantic fallback.
