/**
 * Low-level tmux command execution utilities
 */

import { execa, type ExecaError } from 'execa';

export interface TmuxCommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  error?: string;
}

/**
 * Execute a tmux command and return the result
 */
export async function runTmuxCommand(
  args: string[],
  options?: { timeout?: number }
): Promise<TmuxCommandResult> {
  try {
    const result = await execa('tmux', args, {
      timeout: options?.timeout ?? 10000,
      reject: false,
    });

    return {
      success: result.exitCode === 0,
      stdout: result.stdout,
      stderr: result.stderr,
      error: result.exitCode !== 0 ? result.stderr || 'Command failed' : undefined,
    };
  } catch (error) {
    const execaError = error as ExecaError;
    const stderrValue = execaError.stderr;
    const stderr = typeof stderrValue === 'string' ? stderrValue : '';
    return {
      success: false,
      stdout: '',
      stderr,
      error: execaError.message ?? 'Unknown error',
    };
  }
}

/**
 * Check if tmux is available on the system
 */
export async function isTmuxAvailable(): Promise<boolean> {
  try {
    const result = await execa('tmux', ['-V']);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Get tmux version
 */
export async function getTmuxVersion(): Promise<string | null> {
  try {
    const result = await execa('tmux', ['-V']);
    return result.stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Check if a tmux session exists
 */
export async function sessionExists(sessionName: string): Promise<boolean> {
  const result = await runTmuxCommand(['has-session', '-t', sessionName]);
  return result.success;
}

/**
 * List all tmux sessions
 */
export async function listSessions(): Promise<string[]> {
  const result = await runTmuxCommand([
    'list-sessions',
    '-F',
    '#{session_name}',
  ]);
  if (!result.success) {
    return [];
  }
  return result.stdout.split('\n').filter(Boolean);
}

/**
 * Escape special characters for tmux send-keys
 * When using send-keys -l (literal mode), most escaping is not needed
 */
export function escapeForSendKeys(text: string): string {
  // For send-keys -l, we only need to handle newlines specially
  // Everything else is sent literally
  return text;
}

/**
 * Format a pane target string
 */
export function formatPaneTarget(
  sessionName: string,
  windowIndex: number = 0,
  paneIndex: number = 0
): string {
  return `${sessionName}:${windowIndex}.${paneIndex}`;
}
