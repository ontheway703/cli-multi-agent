/**
 * Debate Orchestrator
 *
 * The main coordinator that manages the entire debate flow between agents.
 */

import { TmuxManager, generateSessionName } from './tmux/index.js';
import { createAdapter, type AgentAdapter } from './agents/index.js';
import { DebateStateMachine } from './state-machine.js';
import { detectConsensus, formatConsensusResult } from './consensus/index.js';
import { SYSTEM_PROMPT_PROPOSER, SYSTEM_PROMPT_REVIEWER } from './config/defaults.js';
import type {
  DebateConfig,
  DebateState,
  DebateContext,
  ConsensusResult,
  RoundRecord,
} from './types/index.js';

export interface OrchestratorEvents {
  onStateChange?: (from: DebateState, to: DebateState, context: DebateContext) => void;
  onRoundStart?: (round: number, maxRounds: number) => void;
  onRoundEnd?: (round: number, record: RoundRecord) => void;
  onConsensus?: (result: ConsensusResult) => void;
  onError?: (error: Error) => void;
}

export class Orchestrator {
  private config: DebateConfig;
  private tmux: TmuxManager;
  private stateMachine: DebateStateMachine;
  private proposer: AgentAdapter | null = null;
  private reviewer: AgentAdapter | null = null;
  private events: OrchestratorEvents;
  private isShuttingDown = false;

  constructor(config: DebateConfig, events?: OrchestratorEvents) {
    this.config = {
      ...config,
      sessionName: config.sessionName ?? generateSessionName(),
    };

    this.tmux = new TmuxManager({
      sessionName: this.config.sessionName!,
    });

    this.events = events ?? {};

    this.stateMachine = new DebateStateMachine({
      topic: config.topic,
      maxRounds: config.maxRounds,
      onStateChange: this.events.onStateChange,
    });
  }

  /**
   * Get current state
   */
  get state(): DebateState {
    return this.stateMachine.state;
  }

  /**
   * Get current context
   */
  get context(): DebateContext {
    return this.stateMachine.context;
  }

  /**
   * Get session name
   */
  get sessionName(): string {
    return this.config.sessionName!;
  }

  /**
   * Initialize and run the debate
   */
  async run(): Promise<DebateContext> {
    try {
      await this.initialize();
      await this.runDebateLoop();
      return this.stateMachine.context;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.stateMachine.error(err.message);
      this.events.onError?.(err);
      throw err;
    }
  }

  /**
   * Initialize tmux session and agents
   */
  private async initialize(): Promise<void> {
    this.stateMachine.start();

    // Check tmux availability
    if (!(await TmuxManager.checkTmuxAvailable())) {
      throw new Error('tmux is not installed or not available');
    }

    // Create tmux session with layout
    await this.tmux.createSession({ withStatusPane: false });

    // Update status bar
    await this.updateStatus('Initializing agents...');

    // Create and start agents
    this.proposer = createAdapter('proposer', this.config.proposer, this.tmux);
    this.reviewer = createAdapter('reviewer', this.config.reviewer, this.tmux);

    await this.proposer.start();
    await this.reviewer.start();

    // Wait for agents to be ready
    await this.waitForAgentsReady();

    // Send system prompts
    await this.sendSystemPrompts();

    this.stateMachine.initialized();
  }

  /**
   * Wait for both agents to be ready
   */
  private async waitForAgentsReady(): Promise<void> {
    const maxWait = 15000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const proposerReady = await this.proposer!.isReady();
      const reviewerReady = await this.reviewer!.isReady();

      if (proposerReady && reviewerReady) {
        return;
      }

      await this.sleep(1000);
    }

    // Continue anyway - agents might work without explicit ready signal
    console.warn('Agents may not be fully ready, continuing...');
  }

  /**
   * Send system prompts to establish roles
   */
  private async sendSystemPrompts(): Promise<void> {
    // Send proposer role prompt
    await this.proposer!.sendPrompt(
      `${SYSTEM_PROMPT_PROPOSER}\n\nThe topic for discussion is:\n${this.config.topic}`
    );
    await this.proposer!.waitForResponse({ timeout: 30000 });

    // Send reviewer role prompt
    await this.reviewer!.sendPrompt(SYSTEM_PROMPT_REVIEWER);
    await this.reviewer!.waitForResponse({ timeout: 30000 });
  }

  /**
   * Main debate loop
   */
  private async runDebateLoop(): Promise<void> {
    while (!this.stateMachine.isTerminal() && !this.isShuttingDown) {
      const state = this.stateMachine.state;

      switch (state) {
        case 'proposer_turn':
          await this.handleProposerTurn();
          break;

        case 'reviewer_turn':
          await this.handleReviewerTurn();
          break;

        case 'check_consensus':
          await this.handleConsensusCheck();
          break;

        default:
          // For waiting states, the handlers above will manage transitions
          await this.sleep(100);
      }
    }

    // Final status update
    const finalState = this.stateMachine.state;
    if (finalState === 'agreed') {
      await this.updateStatus(`AGREED - Round ${this.context.currentRound}/${this.config.maxRounds}`);
    } else if (finalState === 'no_consensus') {
      await this.updateStatus(`NO CONSENSUS - Max rounds reached`);
    }
  }

  /**
   * Handle proposer turn
   */
  private async handleProposerTurn(): Promise<void> {
    const round = this.context.currentRound;
    this.events.onRoundStart?.(round, this.config.maxRounds);

    await this.updateStatus(`Round ${round}/${this.config.maxRounds} - Proposer thinking...`);

    let prompt: string;

    if (round === 1) {
      // First round - ask for initial proposal
      prompt = `Please provide your initial proposal for the topic: "${this.config.topic}"`;
    } else {
      // Subsequent rounds - include reviewer feedback
      const lastRound = this.context.rounds[this.context.rounds.length - 1];
      prompt = `The reviewer provided the following feedback:\n\n${lastRound?.consensus?.feedback ?? lastRound?.reviewerOutput ?? 'Please revise your proposal.'}\n\nPlease update your proposal based on this feedback.`;
    }

    // Send prompt to proposer
    this.stateMachine.proposerPrompted();
    await this.proposer!.sendPrompt(prompt);

    // Wait for response
    const response = await this.proposer!.waitForResponse({
      timeout: this.config.proposer.timeout * 1000,
    });

    this.stateMachine.proposerResponded(response.content);
  }

  /**
   * Handle reviewer turn
   */
  private async handleReviewerTurn(): Promise<void> {
    const round = this.context.currentRound;

    await this.updateStatus(`Round ${round}/${this.config.maxRounds} - Reviewer evaluating...`);

    const proposerOutput = this.context.proposerOutput;

    const prompt = `Please review the following proposal:\n\n---\n${proposerOutput}\n---\n\nProvide your evaluation and indicate whether you AGREE or not.`;

    // Send prompt to reviewer
    this.stateMachine.reviewerPrompted();
    await this.reviewer!.sendPrompt(prompt);

    // Wait for response
    const response = await this.reviewer!.waitForResponse({
      timeout: this.config.reviewer.timeout * 1000,
    });

    this.stateMachine.reviewerResponded(response.content);
  }

  /**
   * Handle consensus check
   */
  private async handleConsensusCheck(): Promise<void> {
    const reviewerOutput = this.context.reviewerOutput;
    const result = detectConsensus(reviewerOutput);

    this.events.onConsensus?.(result);

    const newState = this.stateMachine.processConsensus(result);

    // Record round
    const lastRound = this.context.rounds[this.context.rounds.length - 1];
    if (lastRound) {
      this.events.onRoundEnd?.(lastRound.round, lastRound);
    }

    // Log consensus result
    console.log(`\n--- Round ${lastRound?.round} Consensus Check ---`);
    console.log(formatConsensusResult(result));
    console.log(`Next state: ${newState}\n`);
  }

  /**
   * Update tmux status bar
   */
  private async updateStatus(status: string): Promise<void> {
    try {
      await this.tmux.updateStatusBar(status);
    } catch {
      // Ignore status bar errors
    }
  }

  /**
   * Attach to the tmux session
   */
  async attach(): Promise<void> {
    await this.tmux.attach();
  }

  /**
   * Stop the debate gracefully
   */
  async stop(): Promise<void> {
    this.isShuttingDown = true;
    this.stateMachine.stop();

    if (this.proposer?.isStarted) {
      await this.proposer.stop();
    }

    if (this.reviewer?.isStarted) {
      await this.reviewer.stop();
    }
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    try {
      await this.stop();
      await this.tmux.killSession();
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Get final result for output
   */
  getFinalResult(): {
    agreed: boolean;
    rounds: RoundRecord[];
    finalAnswer: string | null;
  } {
    const ctx = this.context;
    const lastRound = ctx.rounds[ctx.rounds.length - 1];

    return {
      agreed: ctx.consensusReached,
      rounds: ctx.rounds,
      finalAnswer: lastRound?.consensus?.finalAnswer ?? null,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Quick start function for simple usage
 */
export async function startDebate(
  topic: string,
  options?: Partial<DebateConfig>
): Promise<Orchestrator> {
  const { createDefaultConfig } = await import('./config/defaults.js');
  const config = createDefaultConfig(topic, options);
  const orchestrator = new Orchestrator(config);
  return orchestrator;
}
