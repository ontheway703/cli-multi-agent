/**
 * Default configuration values for the debate system
 */

import type { AgentConfig, DebateConfig } from '../types/index.js';
import { generateSessionName } from '../tmux/index.js';

export const DEFAULT_AGENT_CONFIG: Omit<AgentConfig, 'command'> = {
  promptPattern: '^[>$#]\\s*$',
  timeout: 120,
  args: [],
};

export const DEFAULT_CLAUDE_CONFIG: AgentConfig = {
  command: 'claude',
  args: [],
  promptPattern: '^>\\s*$',
  timeout: 180,
  name: 'Claude Code',
};

export const DEFAULT_CODEX_CONFIG: AgentConfig = {
  command: 'codex',
  args: [],
  promptPattern: '^\\$\\s*$',
  timeout: 180,
  name: 'Codex',
};

export const DEFAULT_MAX_ROUNDS = 10;
export const DEFAULT_POLL_INTERVAL_MS = 500;
export const DEFAULT_STABILITY_COUNT = 3;

export const SYSTEM_PROMPT_PROPOSER = `You are the Proposer in a collaborative debate. Your role is to:
1. Present clear, well-structured proposals
2. Respond to feedback constructively
3. Iterate on your proposals based on reviewer input

When you complete a proposal, clearly mark it with:
FINAL_ANSWER: <your complete proposal>

Be concise and focus on actionable solutions.`;

export const SYSTEM_PROMPT_REVIEWER = `You are the Reviewer in a collaborative debate. Your role is to:
1. Critically evaluate proposals
2. Provide constructive feedback
3. Approve proposals that meet requirements

After reviewing, you MUST end your response with one of:

If you APPROVE:
AGREE: YES
REASON: <why you approve>
FINAL_ANSWER: <confirmed final answer>

If you need CHANGES:
AGREE: NO
REASON: <what needs to change>
FEEDBACK: <specific improvements needed>

Be thorough but fair in your evaluation.`;

export function createDefaultConfig(
  topic: string,
  options?: Partial<DebateConfig>
): DebateConfig {
  return {
    topic,
    maxRounds: options?.maxRounds ?? DEFAULT_MAX_ROUNDS,
    proposer: options?.proposer ?? { ...DEFAULT_CLAUDE_CONFIG },
    reviewer: options?.reviewer ?? { ...DEFAULT_CLAUDE_CONFIG, name: 'Claude Code (Reviewer)' },
    sessionName: options?.sessionName ?? generateSessionName(),
    outputDir: options?.outputDir ?? './debate-output',
  };
}
