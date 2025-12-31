/**
 * Logger for debate sessions
 *
 * Handles JSONL logging and final output generation.
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import type { RoundRecord, DebateContext, ConsensusResult } from '../types/index.js';

export interface LogEntry {
  timestamp: string;
  type: 'round' | 'state_change' | 'consensus' | 'error' | 'info';
  data: unknown;
}

export class DebateLogger {
  private outputDir: string;
  private sessionId: string;
  private logPath: string;
  private initialized = false;

  constructor(outputDir: string, sessionId: string) {
    this.outputDir = outputDir;
    this.sessionId = sessionId;
    this.logPath = join(outputDir, sessionId, 'rounds.jsonl');
  }

  /**
   * Initialize the logger (create directories)
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    const sessionDir = join(this.outputDir, this.sessionId);
    await fs.mkdir(sessionDir, { recursive: true });
    this.initialized = true;
  }

  /**
   * Log a round
   */
  async logRound(record: RoundRecord): Promise<void> {
    await this.init();

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      type: 'round',
      data: {
        round: record.round,
        proposerOutput: record.proposerOutput,
        reviewerOutput: record.reviewerOutput,
        consensus: record.consensus,
      },
    };

    await this.appendLog(entry);
  }

  /**
   * Log a state change
   */
  async logStateChange(from: string, to: string): Promise<void> {
    await this.init();

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      type: 'state_change',
      data: { from, to },
    };

    await this.appendLog(entry);
  }

  /**
   * Log consensus result
   */
  async logConsensus(result: ConsensusResult): Promise<void> {
    await this.init();

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      type: 'consensus',
      data: result,
    };

    await this.appendLog(entry);
  }

  /**
   * Log an error
   */
  async logError(error: Error | string): Promise<void> {
    await this.init();

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      type: 'error',
      data: {
        message: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      },
    };

    await this.appendLog(entry);
  }

  /**
   * Write final result
   */
  async writeFinal(context: DebateContext, finalAnswer: string | null): Promise<string> {
    await this.init();

    const sessionDir = join(this.outputDir, this.sessionId);
    const filename = context.consensusReached ? 'final.txt' : 'last.txt';
    const filepath = join(sessionDir, filename);

    const content = this.formatFinalOutput(context, finalAnswer);
    await fs.writeFile(filepath, content, 'utf-8');

    return filepath;
  }

  /**
   * Format final output content
   */
  private formatFinalOutput(context: DebateContext, finalAnswer: string | null): string {
    const lines: string[] = [];

    lines.push('='.repeat(60));
    lines.push(`DEBATE ${context.consensusReached ? 'CONCLUDED' : 'ENDED'}`);
    lines.push('='.repeat(60));
    lines.push('');
    lines.push(`Topic: ${context.topic}`);
    lines.push(`Rounds: ${context.currentRound}/${context.maxRounds}`);
    lines.push(`Consensus: ${context.consensusReached ? 'YES' : 'NO'}`);
    lines.push(`Start: ${context.startTime.toISOString()}`);
    lines.push(`End: ${new Date().toISOString()}`);
    lines.push('');

    if (finalAnswer) {
      lines.push('-'.repeat(60));
      lines.push('FINAL ANSWER:');
      lines.push('-'.repeat(60));
      lines.push(finalAnswer);
      lines.push('');
    }

    lines.push('-'.repeat(60));
    lines.push('ROUND SUMMARY:');
    lines.push('-'.repeat(60));

    for (const round of context.rounds) {
      lines.push(`\n[Round ${round.round}]`);
      lines.push(`Proposer: ${this.truncate(round.proposerOutput, 200)}`);
      lines.push(`Reviewer: ${this.truncate(round.reviewerOutput, 200)}`);
      if (round.consensus) {
        lines.push(`Agreement: ${round.consensus.agreed ? 'YES' : 'NO'}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Append an entry to the JSONL log
   */
  private async appendLog(entry: LogEntry): Promise<void> {
    const line = JSON.stringify(entry) + '\n';
    await fs.appendFile(this.logPath, line, 'utf-8');
  }

  /**
   * Get the session directory path
   */
  getSessionDir(): string {
    return join(this.outputDir, this.sessionId);
  }

  /**
   * Get the log file path
   */
  getLogPath(): string {
    return this.logPath;
  }

  /**
   * Truncate text for summary
   */
  private truncate(text: string, maxLength: number): string {
    const cleaned = text.replace(/\n/g, ' ').trim();
    if (cleaned.length <= maxLength) {
      return cleaned;
    }
    return cleaned.substring(0, maxLength - 3) + '...';
  }
}

/**
 * Ensure directory exists
 */
export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Read JSONL log file
 */
export async function readLogs(logPath: string): Promise<LogEntry[]> {
  try {
    const content = await fs.readFile(logPath, 'utf-8');
    return content
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as LogEntry);
  } catch {
    return [];
  }
}
