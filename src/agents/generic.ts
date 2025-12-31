/**
 * Generic Agent Adapter
 *
 * A configurable adapter that works with any CLI agent
 * through configuration-based customization.
 */

import { BaseAgentAdapter } from './adapter.js';
import type { AgentConfig } from '../types/index.js';
import type { TmuxManager } from '../tmux/index.js';

export class GenericAgentAdapter extends BaseAgentAdapter {
  readonly role: 'proposer' | 'reviewer';

  constructor(
    role: 'proposer' | 'reviewer',
    config: AgentConfig,
    tmux: TmuxManager
  ) {
    super(config, tmux);
    this.role = role;
  }

  /**
   * Create a proposer adapter
   */
  static createProposer(config: AgentConfig, tmux: TmuxManager): GenericAgentAdapter {
    return new GenericAgentAdapter('proposer', config, tmux);
  }

  /**
   * Create a reviewer adapter
   */
  static createReviewer(config: AgentConfig, tmux: TmuxManager): GenericAgentAdapter {
    return new GenericAgentAdapter('reviewer', config, tmux);
  }
}

/**
 * Claude Code specific adapter with optimized detection
 */
export class ClaudeCodeAdapter extends BaseAgentAdapter {
  readonly role: 'proposer' | 'reviewer';

  // Claude Code specific prompt patterns
  private static readonly CLAUDE_PROMPT_PATTERNS = [
    /^\s*>\s*$/,              // Single > prompt
    /\n>\s*$/,                // > at end of content
    /^\s*claude>\s*$/i,       // claude> prompt
  ];

  constructor(
    role: 'proposer' | 'reviewer',
    config: AgentConfig,
    tmux: TmuxManager
  ) {
    super(config, tmux);
    this.role = role;

    // Override prompt pattern for Claude Code
    if (!config.promptPattern) {
      (this.config as AgentConfig).promptPattern = '^\\s*>\\s*$';
    }
  }

  protected isResponseComplete(content: string): boolean {
    // First try the configured pattern
    if (super.isResponseComplete(content)) {
      return true;
    }

    // Then try Claude-specific patterns
    const lastLines = content.split('\n').slice(-5).join('\n');
    return ClaudeCodeAdapter.CLAUDE_PROMPT_PATTERNS.some((pattern) =>
      pattern.test(lastLines)
    );
  }

  /**
   * Claude Code may need special handling for its REPL
   */
  async start(): Promise<void> {
    await super.start();

    // Wait for Claude Code to fully initialize (it shows a welcome message)
    await this.waitForInitialization();
  }

  private async waitForInitialization(): Promise<void> {
    const maxWait = 10000; // 10 seconds max
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const content = await this.tmux.capturePane(this.paneRole);

      // Claude Code shows ">" when ready
      if (/>\s*$/.test(content)) {
        return;
      }

      await this.sleep(500);
    }

    // Continue anyway after timeout
  }

  static createProposer(config: AgentConfig, tmux: TmuxManager): ClaudeCodeAdapter {
    return new ClaudeCodeAdapter('proposer', config, tmux);
  }

  static createReviewer(config: AgentConfig, tmux: TmuxManager): ClaudeCodeAdapter {
    return new ClaudeCodeAdapter('reviewer', config, tmux);
  }
}
