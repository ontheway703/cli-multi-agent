/**
 * Core type definitions for the CLI multi-agent debate system
 */

// ============ Agent Configuration ============

export interface AgentConfig {
  /** Command to start the agent CLI (e.g., "claude", "codex") */
  command: string;
  /** Arguments to pass to the command */
  args?: string[];
  /** Regex pattern to detect when agent is ready for input */
  promptPattern: string;
  /** Timeout in seconds for single turn response */
  timeout: number;
  /** Optional name for display purposes */
  name?: string;
}

export interface DebateConfig {
  /** Maximum number of debate rounds */
  maxRounds: number;
  /** The debate topic/question */
  topic: string;
  /** Proposer agent configuration */
  proposer: AgentConfig;
  /** Reviewer agent configuration */
  reviewer: AgentConfig;
  /** Session name for tmux */
  sessionName?: string;
  /** Directory for logs and outputs */
  outputDir?: string;
}

// ============ State Machine ============

export type DebateState =
  | 'idle'
  | 'initializing'
  | 'proposer_turn'
  | 'waiting_proposer'
  | 'reviewer_turn'
  | 'waiting_reviewer'
  | 'check_consensus'
  | 'agreed'
  | 'no_consensus'
  | 'error'
  | 'stopped';

export interface DebateContext {
  topic: string;
  currentRound: number;
  maxRounds: number;
  proposerOutput: string;
  reviewerOutput: string;
  consensusReached: boolean;
  error?: string;
  startTime: Date;
  rounds: RoundRecord[];
}

export interface RoundRecord {
  round: number;
  proposerOutput: string;
  reviewerOutput: string;
  consensus: ConsensusResult | null;
  timestamp: Date;
}

// ============ Consensus Detection ============

export interface ConsensusResult {
  /** Whether the reviewer agrees with the proposal */
  agreed: boolean;
  /** Reason for the decision */
  reason: string | null;
  /** Final answer if agreed */
  finalAnswer: string | null;
  /** Feedback for next iteration if not agreed */
  feedback: string | null;
  /** Confidence score 0-1 for the parsing */
  confidence: number;
  /** Raw content that was parsed */
  rawContent: string;
}

// ============ Tmux Management ============

export interface TmuxPane {
  id: string;
  index: number;
  width: number;
  height: number;
  active: boolean;
}

export interface TmuxSession {
  name: string;
  created: Date;
  attached: boolean;
  panes: TmuxPane[];
}

// ============ Events ============

export type DebateEventType =
  | 'state_change'
  | 'round_start'
  | 'round_end'
  | 'proposer_output'
  | 'reviewer_output'
  | 'consensus_reached'
  | 'timeout'
  | 'error';

export interface DebateEvent {
  type: DebateEventType;
  timestamp: Date;
  data: unknown;
}

// ============ CLI Options ============

export interface StartOptions {
  topic: string;
  maxRounds: number;
  attach: boolean;
  proposerCmd?: string;
  reviewerCmd?: string;
  config?: string;
}

export interface StatusInfo {
  sessionName: string;
  state: DebateState;
  currentRound: number;
  maxRounds: number;
  topic: string;
  lastActivity: Date;
}
