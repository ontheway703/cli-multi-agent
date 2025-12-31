export {
  type AgentAdapter,
  type AgentResponse,
  BaseAgentAdapter,
} from './adapter.js';

export { GenericAgentAdapter, ClaudeCodeAdapter } from './generic.js';

import type { AgentConfig } from '../types/index.js';
import type { TmuxManager } from '../tmux/index.js';
import { GenericAgentAdapter, ClaudeCodeAdapter } from './generic.js';
import type { AgentAdapter } from './adapter.js';

/**
 * Factory function to create the appropriate adapter based on config
 */
export function createAdapter(
  role: 'proposer' | 'reviewer',
  config: AgentConfig,
  tmux: TmuxManager
): AgentAdapter {
  const command = config.command.toLowerCase();

  // Use specialized adapter for known agents
  if (command === 'claude' || command.includes('claude')) {
    return new ClaudeCodeAdapter(role, config, tmux);
  }

  // Fall back to generic adapter
  return new GenericAgentAdapter(role, config, tmux);
}
