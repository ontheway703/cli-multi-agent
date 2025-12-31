/**
 * Agent Adapter Interface
 *
 * Defines the contract for adapting different CLI agents
 * (Claude Code, Codex, Coco, etc.) to work with the debate system.
 */

import type { AgentConfig } from '../types/index.js';
import type { TmuxManager } from '../tmux/index.js';

export interface AgentResponse {
  /** The full output from the agent */
  content: string;
  /** Whether the response is complete (agent ready for next input) */
  complete: boolean;
  /** Time taken to get the response in ms */
  duration: number;
}

export interface AgentAdapter {
  /** The agent's role in the debate */
  readonly role: 'proposer' | 'reviewer';

  /** Agent configuration */
  readonly config: AgentConfig;

  /** Whether the agent has been started */
  readonly isStarted: boolean;

  /**
   * Start the agent CLI in its designated pane
   */
  start(): Promise<void>;

  /**
   * Send a prompt to the agent
   */
  sendPrompt(prompt: string): Promise<void>;

  /**
   * Wait for the agent to complete its response
   * Returns when the agent is ready for the next input
   */
  waitForResponse(options?: {
    timeout?: number;
    pollInterval?: number;
  }): Promise<AgentResponse>;

  /**
   * Check if the agent is ready to receive input
   */
  isReady(): Promise<boolean>;

  /**
   * Get the current pane content
   */
  getCurrentOutput(): Promise<string>;

  /**
   * Stop/terminate the agent
   */
  stop(): Promise<void>;
}

/**
 * Base implementation with common functionality
 */
export abstract class BaseAgentAdapter implements AgentAdapter {
  abstract readonly role: 'proposer' | 'reviewer';
  readonly config: AgentConfig;

  protected tmux: TmuxManager;
  protected _isStarted = false;
  protected lastCaptureContent = '';
  protected responseStartMarker = '';

  constructor(config: AgentConfig, tmux: TmuxManager) {
    this.config = config;
    this.tmux = tmux;
  }

  get isStarted(): boolean {
    return this._isStarted;
  }

  protected get paneRole(): 'proposer' | 'reviewer' {
    return this.role;
  }

  async start(): Promise<void> {
    if (this._isStarted) {
      return;
    }

    // Build the command with arguments
    const fullCommand = this.config.args?.length
      ? `${this.config.command} ${this.config.args.join(' ')}`
      : this.config.command;

    // Start the CLI in the designated pane
    await this.tmux.runInPane(this.paneRole, fullCommand);

    // Wait a bit for the CLI to initialize
    await this.sleep(1000);

    this._isStarted = true;
  }

  async sendPrompt(prompt: string): Promise<void> {
    if (!this._isStarted) {
      throw new Error('Agent not started');
    }

    // Capture current content as baseline for detecting new output
    this.lastCaptureContent = await this.tmux.capturePane(this.paneRole);
    this.responseStartMarker = `__PROMPT_${Date.now()}__`;

    // Send the prompt
    await this.tmux.sendKeys(this.paneRole, prompt, { enter: true });
  }

  async waitForResponse(options?: {
    timeout?: number;
    pollInterval?: number;
  }): Promise<AgentResponse> {
    const timeout = options?.timeout ?? this.config.timeout * 1000;
    const pollInterval = options?.pollInterval ?? 500;

    const startTime = Date.now();
    let lastContent = '';
    let stableCount = 0;
    const stabilityThreshold = 3;

    while (Date.now() - startTime < timeout) {
      const currentContent = await this.tmux.capturePane(this.paneRole);

      // Check if content has stabilized
      if (currentContent === lastContent) {
        stableCount++;

        // Check if stable AND looks complete (prompt visible or other indicators)
        if (stableCount >= stabilityThreshold) {
          const isComplete = this.isResponseComplete(currentContent);
          if (isComplete) {
            return {
              content: this.extractNewContent(currentContent),
              complete: true,
              duration: Date.now() - startTime,
            };
          }
        }
      } else {
        stableCount = 0;
        lastContent = currentContent;
      }

      await this.sleep(pollInterval);
    }

    // Timeout - return what we have
    const finalContent = await this.tmux.capturePane(this.paneRole);
    return {
      content: this.extractNewContent(finalContent),
      complete: false,
      duration: Date.now() - startTime,
    };
  }

  async isReady(): Promise<boolean> {
    if (!this._isStarted) {
      return false;
    }

    const content = await this.tmux.capturePane(this.paneRole);
    return this.isResponseComplete(content);
  }

  async getCurrentOutput(): Promise<string> {
    return this.tmux.capturePane(this.paneRole);
  }

  async stop(): Promise<void> {
    if (!this._isStarted) {
      return;
    }

    // Send Ctrl+C to interrupt, then exit command
    await this.tmux.sendKeys(this.paneRole, '\x03', { enter: false });
    await this.sleep(500);
    await this.tmux.sendKeys(this.paneRole, 'exit', { enter: true });

    this._isStarted = false;
  }

  /**
   * Check if the response appears complete
   * Override in subclasses for agent-specific detection
   */
  protected isResponseComplete(content: string): boolean {
    const pattern = new RegExp(this.config.promptPattern, 'm');
    const lines = content.split('\n');

    // Check if any of the last few lines match the prompt pattern
    const lastLines = lines.slice(-5);
    return lastLines.some((line) => pattern.test(line.trim()));
  }

  /**
   * Extract new content since the last prompt was sent
   */
  protected extractNewContent(currentContent: string): string {
    // Simple approach: return content after the last known baseline
    // This is a basic implementation; may need refinement for specific agents

    if (!this.lastCaptureContent) {
      return currentContent;
    }

    // Find where the new content starts
    const baselineLines = this.lastCaptureContent.split('\n').length;
    const currentLines = currentContent.split('\n');

    if (currentLines.length > baselineLines) {
      // Return lines after the baseline, minus the prompt line at the end
      const newLines = currentLines.slice(baselineLines);
      // Remove trailing prompt line if present
      const pattern = new RegExp(this.config.promptPattern);
      while (newLines.length > 0 && pattern.test(newLines[newLines.length - 1].trim())) {
        newLines.pop();
      }
      return newLines.join('\n').trim();
    }

    return currentContent;
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
