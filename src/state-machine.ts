/**
 * State Machine for Debate Flow
 *
 * Manages the state transitions during a multi-agent debate.
 */

import type { DebateState, DebateContext, RoundRecord, ConsensusResult } from './types/index.js';

export type StateTransition = {
  from: DebateState;
  to: DebateState;
  event: string;
  timestamp: Date;
};

export interface StateMachineOptions {
  topic: string;
  maxRounds: number;
  onStateChange?: (from: DebateState, to: DebateState, context: DebateContext) => void;
}

export class DebateStateMachine {
  private _state: DebateState = 'idle';
  private _context: DebateContext;
  private transitions: StateTransition[] = [];
  private onStateChange?: (from: DebateState, to: DebateState, context: DebateContext) => void;

  constructor(options: StateMachineOptions) {
    this._context = {
      topic: options.topic,
      currentRound: 0,
      maxRounds: options.maxRounds,
      proposerOutput: '',
      reviewerOutput: '',
      consensusReached: false,
      startTime: new Date(),
      rounds: [],
    };
    this.onStateChange = options.onStateChange;
  }

  get state(): DebateState {
    return this._state;
  }

  get context(): DebateContext {
    return { ...this._context };
  }

  get history(): StateTransition[] {
    return [...this.transitions];
  }

  /**
   * Valid state transitions
   */
  private static readonly VALID_TRANSITIONS: Record<DebateState, DebateState[]> = {
    idle: ['initializing'],
    initializing: ['proposer_turn', 'error'],
    proposer_turn: ['waiting_proposer', 'error', 'stopped'],
    waiting_proposer: ['reviewer_turn', 'error', 'stopped'],
    reviewer_turn: ['waiting_reviewer', 'error', 'stopped'],
    waiting_reviewer: ['check_consensus', 'error', 'stopped'],
    check_consensus: ['proposer_turn', 'agreed', 'no_consensus', 'error'],
    agreed: ['stopped'],
    no_consensus: ['stopped'],
    error: ['stopped'],
    stopped: [],
  };

  /**
   * Transition to a new state
   */
  transition(to: DebateState, event: string = 'transition'): boolean {
    const validNextStates = DebateStateMachine.VALID_TRANSITIONS[this._state];

    if (!validNextStates.includes(to)) {
      console.warn(
        `Invalid state transition: ${this._state} -> ${to}. ` +
        `Valid transitions: ${validNextStates.join(', ')}`
      );
      return false;
    }

    const from = this._state;
    this._state = to;

    this.transitions.push({
      from,
      to,
      event,
      timestamp: new Date(),
    });

    if (this.onStateChange) {
      this.onStateChange(from, to, this._context);
    }

    return true;
  }

  /**
   * Start the debate
   */
  start(): boolean {
    if (this._state !== 'idle') {
      return false;
    }
    return this.transition('initializing', 'start');
  }

  /**
   * Mark initialization complete, move to first proposer turn
   */
  initialized(): boolean {
    if (this._state !== 'initializing') {
      return false;
    }
    this._context.currentRound = 1;
    return this.transition('proposer_turn', 'initialized');
  }

  /**
   * Proposer has received prompt, waiting for response
   */
  proposerPrompted(): boolean {
    if (this._state !== 'proposer_turn') {
      return false;
    }
    return this.transition('waiting_proposer', 'proposer_prompted');
  }

  /**
   * Proposer response received, move to reviewer
   */
  proposerResponded(output: string): boolean {
    if (this._state !== 'waiting_proposer') {
      return false;
    }
    this._context.proposerOutput = output;
    return this.transition('reviewer_turn', 'proposer_responded');
  }

  /**
   * Reviewer has received prompt, waiting for response
   */
  reviewerPrompted(): boolean {
    if (this._state !== 'reviewer_turn') {
      return false;
    }
    return this.transition('waiting_reviewer', 'reviewer_prompted');
  }

  /**
   * Reviewer response received, check consensus
   */
  reviewerResponded(output: string): boolean {
    if (this._state !== 'waiting_reviewer') {
      return false;
    }
    this._context.reviewerOutput = output;
    return this.transition('check_consensus', 'reviewer_responded');
  }

  /**
   * Process consensus check result
   */
  processConsensus(result: ConsensusResult): DebateState {
    if (this._state !== 'check_consensus') {
      return this._state;
    }

    // Record this round
    const roundRecord: RoundRecord = {
      round: this._context.currentRound,
      proposerOutput: this._context.proposerOutput,
      reviewerOutput: this._context.reviewerOutput,
      consensus: result,
      timestamp: new Date(),
    };
    this._context.rounds.push(roundRecord);

    if (result.agreed) {
      this._context.consensusReached = true;
      this.transition('agreed', 'consensus_reached');
      return 'agreed';
    }

    // Check if max rounds reached
    if (this._context.currentRound >= this._context.maxRounds) {
      this.transition('no_consensus', 'max_rounds_reached');
      return 'no_consensus';
    }

    // Continue to next round
    this._context.currentRound++;
    this.transition('proposer_turn', 'next_round');
    return 'proposer_turn';
  }

  /**
   * Handle error
   */
  error(message: string): void {
    this._context.error = message;
    this.transition('error', 'error');
  }

  /**
   * Stop the debate
   */
  stop(): void {
    if (this._state !== 'stopped') {
      this.transition('stopped', 'stopped');
    }
  }

  /**
   * Check if debate is in a terminal state
   */
  isTerminal(): boolean {
    return ['agreed', 'no_consensus', 'error', 'stopped'].includes(this._state);
  }

  /**
   * Check if debate is running
   */
  isRunning(): boolean {
    return !this.isTerminal() && this._state !== 'idle';
  }

  /**
   * Get a summary of the current state
   */
  getSummary(): string {
    return (
      `State: ${this._state}\n` +
      `Round: ${this._context.currentRound}/${this._context.maxRounds}\n` +
      `Topic: ${this._context.topic}\n` +
      `Consensus: ${this._context.consensusReached ? 'YES' : 'NO'}\n` +
      `Duration: ${this.getDurationMs()}ms`
    );
  }

  /**
   * Get duration in milliseconds
   */
  getDurationMs(): number {
    return Date.now() - this._context.startTime.getTime();
  }
}
