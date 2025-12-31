/**
 * TmuxManager - High-level tmux session and pane management
 */

import {
  runTmuxCommand,
  sessionExists,
  formatPaneTarget,
  isTmuxAvailable,
} from './commands.js';

export interface TmuxManagerOptions {
  sessionName: string;
}

export interface PaneInfo {
  id: string;
  index: number;
  target: string;
}

export class TmuxManager {
  private sessionName: string;
  private proposerPane: PaneInfo | null = null;
  private reviewerPane: PaneInfo | null = null;
  private statusPane: PaneInfo | null = null;
  private isInitialized = false;

  constructor(options: TmuxManagerOptions) {
    this.sessionName = options.sessionName;
  }

  /**
   * Check if tmux is available on the system
   */
  static async checkTmuxAvailable(): Promise<boolean> {
    return isTmuxAvailable();
  }

  /**
   * Get the session name
   */
  getSessionName(): string {
    return this.sessionName;
  }

  /**
   * Check if this session exists
   */
  async exists(): Promise<boolean> {
    return sessionExists(this.sessionName);
  }

  /**
   * Create a new tmux session with the debate layout:
   * - Left pane: Proposer
   * - Right pane: Reviewer
   * - Bottom strip: Status (optional)
   */
  async createSession(options?: {
    withStatusPane?: boolean;
  }): Promise<void> {
    // Check if session already exists
    if (await this.exists()) {
      throw new Error(`Session '${this.sessionName}' already exists`);
    }

    // Create new detached session
    const createResult = await runTmuxCommand([
      'new-session',
      '-d',
      '-s',
      this.sessionName,
      '-x',
      '200',
      '-y',
      '50',
    ]);

    if (!createResult.success) {
      throw new Error(`Failed to create session: ${createResult.error}`);
    }

    // Split horizontally to create left (proposer) and right (reviewer) panes
    const splitResult = await runTmuxCommand([
      'split-window',
      '-h',
      '-t',
      `${this.sessionName}:0`,
    ]);

    if (!splitResult.success) {
      await this.killSession();
      throw new Error(`Failed to split window: ${splitResult.error}`);
    }

    // Set up pane references
    this.proposerPane = {
      id: '0',
      index: 0,
      target: formatPaneTarget(this.sessionName, 0, 0),
    };

    this.reviewerPane = {
      id: '1',
      index: 1,
      target: formatPaneTarget(this.sessionName, 0, 1),
    };

    // Optionally create a status pane at the bottom
    if (options?.withStatusPane) {
      // Select pane 0 first, then split from there
      await runTmuxCommand([
        'select-pane',
        '-t',
        this.proposerPane.target,
      ]);

      const statusResult = await runTmuxCommand([
        'split-window',
        '-v',
        '-l',
        '3', // 3 lines for status
        '-t',
        this.proposerPane.target,
      ]);

      if (statusResult.success) {
        this.statusPane = {
          id: '2',
          index: 2,
          target: formatPaneTarget(this.sessionName, 0, 2),
        };

        // Update proposer pane target (it shifted)
        this.proposerPane.index = 0;
        this.proposerPane.target = formatPaneTarget(this.sessionName, 0, 0);
      }
    }

    // Set up status bar
    await this.updateStatusBar('Initializing...');

    this.isInitialized = true;
  }

  /**
   * Send text to a specific pane
   * Uses send-keys -l for literal mode to avoid escape issues
   */
  async sendKeys(
    pane: 'proposer' | 'reviewer' | 'status',
    text: string,
    options?: { enter?: boolean }
  ): Promise<void> {
    const paneInfo = this.getPaneInfo(pane);
    if (!paneInfo) {
      throw new Error(`Pane '${pane}' not initialized`);
    }

    // Split text into lines and send each separately to handle newlines
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Send the line content using literal mode
      if (line.length > 0) {
        const result = await runTmuxCommand([
          'send-keys',
          '-l',
          '-t',
          paneInfo.target,
          line,
        ]);

        if (!result.success) {
          throw new Error(`Failed to send keys: ${result.error}`);
        }
      }

      // Send Enter for line breaks (except for the last line unless enter option is true)
      if (i < lines.length - 1) {
        await runTmuxCommand([
          'send-keys',
          '-t',
          paneInfo.target,
          'Enter',
        ]);
      }
    }

    // Send final Enter if requested
    if (options?.enter !== false) {
      await runTmuxCommand([
        'send-keys',
        '-t',
        paneInfo.target,
        'Enter',
      ]);
    }
  }

  /**
   * Capture the current content of a pane
   */
  async capturePane(
    pane: 'proposer' | 'reviewer' | 'status',
    options?: { lines?: number }
  ): Promise<string> {
    const paneInfo = this.getPaneInfo(pane);
    if (!paneInfo) {
      throw new Error(`Pane '${pane}' not initialized`);
    }

    const args = ['capture-pane', '-p', '-t', paneInfo.target];

    // Optionally limit to last N lines
    if (options?.lines) {
      args.push('-S', `-${options.lines}`);
    }

    const result = await runTmuxCommand(args);

    if (!result.success) {
      throw new Error(`Failed to capture pane: ${result.error}`);
    }

    return result.stdout;
  }

  /**
   * Start logging pane output to a file
   */
  async startPaneLogging(
    pane: 'proposer' | 'reviewer',
    logPath: string
  ): Promise<void> {
    const paneInfo = this.getPaneInfo(pane);
    if (!paneInfo) {
      throw new Error(`Pane '${pane}' not initialized`);
    }

    const result = await runTmuxCommand([
      'pipe-pane',
      '-t',
      paneInfo.target,
      `cat >> "${logPath}"`,
    ]);

    if (!result.success) {
      throw new Error(`Failed to start pane logging: ${result.error}`);
    }
  }

  /**
   * Stop logging pane output
   */
  async stopPaneLogging(pane: 'proposer' | 'reviewer'): Promise<void> {
    const paneInfo = this.getPaneInfo(pane);
    if (!paneInfo) {
      throw new Error(`Pane '${pane}' not initialized`);
    }

    await runTmuxCommand(['pipe-pane', '-t', paneInfo.target]);
  }

  /**
   * Update the tmux status bar with current state
   */
  async updateStatusBar(status: string): Promise<void> {
    await runTmuxCommand([
      'set-option',
      '-t',
      this.sessionName,
      'status-right',
      ` ${status} `,
    ]);

    await runTmuxCommand([
      'set-option',
      '-t',
      this.sessionName,
      'status-right-length',
      '100',
    ]);
  }

  /**
   * Update the status pane content (if exists)
   */
  async updateStatusPane(content: string): Promise<void> {
    if (!this.statusPane) {
      return;
    }

    // Clear and update status pane
    await runTmuxCommand([
      'send-keys',
      '-t',
      this.statusPane.target,
      'C-c',
    ]);

    await runTmuxCommand([
      'send-keys',
      '-t',
      this.statusPane.target,
      `clear && echo "${content}"`,
    ]);

    await runTmuxCommand([
      'send-keys',
      '-t',
      this.statusPane.target,
      'Enter',
    ]);
  }

  /**
   * Run a command in a pane
   */
  async runInPane(
    pane: 'proposer' | 'reviewer',
    command: string
  ): Promise<void> {
    const paneInfo = this.getPaneInfo(pane);
    if (!paneInfo) {
      throw new Error(`Pane '${pane}' not initialized`);
    }

    const result = await runTmuxCommand([
      'send-keys',
      '-t',
      paneInfo.target,
      command,
      'Enter',
    ]);

    if (!result.success) {
      throw new Error(`Failed to run command in pane: ${result.error}`);
    }
  }

  /**
   * Select (focus) a specific pane
   */
  async selectPane(pane: 'proposer' | 'reviewer' | 'status'): Promise<void> {
    const paneInfo = this.getPaneInfo(pane);
    if (!paneInfo) {
      throw new Error(`Pane '${pane}' not initialized`);
    }

    await runTmuxCommand(['select-pane', '-t', paneInfo.target]);
  }

  /**
   * Attach to the session (brings user into tmux)
   */
  async attach(): Promise<void> {
    if (!(await this.exists())) {
      throw new Error(`Session '${this.sessionName}' does not exist`);
    }

    // Use spawn instead of execa for interactive attach
    const { spawn } = await import('child_process');
    const tmux = spawn('tmux', ['attach-session', '-t', this.sessionName], {
      stdio: 'inherit',
    });

    return new Promise((resolve, reject) => {
      tmux.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`tmux attach exited with code ${code}`));
        }
      });

      tmux.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Kill the session
   */
  async killSession(): Promise<void> {
    const result = await runTmuxCommand([
      'kill-session',
      '-t',
      this.sessionName,
    ]);

    if (!result.success && (await this.exists())) {
      throw new Error(`Failed to kill session: ${result.error}`);
    }

    this.isInitialized = false;
    this.proposerPane = null;
    this.reviewerPane = null;
    this.statusPane = null;
  }

  /**
   * Get pane info by role
   */
  private getPaneInfo(pane: 'proposer' | 'reviewer' | 'status'): PaneInfo | null {
    switch (pane) {
      case 'proposer':
        return this.proposerPane;
      case 'reviewer':
        return this.reviewerPane;
      case 'status':
        return this.statusPane;
      default:
        return null;
    }
  }

  /**
   * Check if the manager is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.proposerPane !== null && this.reviewerPane !== null;
  }
}

/**
 * Generate a unique session name
 */
export function generateSessionName(prefix: string = 'debate'): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `${prefix}-${timestamp}-${random}`;
}
