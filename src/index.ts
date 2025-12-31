#!/usr/bin/env node
/**
 * CLI Multi-Agent Debate Tool
 *
 * A command-line tool for orchestrating debates between AI agents.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { Orchestrator } from './orchestrator.js';
import { TmuxManager, listSessions, sessionExists } from './tmux/index.js';
import { createDefaultConfig, DEFAULT_MAX_ROUNDS } from './config/defaults.js';
import { DebateLogger, readLogs } from './logger/index.js';
import type { DebateState, DebateContext, RoundRecord, ConsensusResult } from './types/index.js';

const program = new Command();

program
  .name('debate')
  .description('CLI tool for multi-agent collaboration and debate')
  .version('0.1.0');

// ============ START COMMAND ============
program
  .command('start')
  .description('Start a new debate session')
  .requiredOption('-t, --topic <topic>', 'The topic or question for the debate')
  .option('-r, --max-rounds <number>', 'Maximum number of rounds', String(DEFAULT_MAX_ROUNDS))
  .option('-a, --attach', 'Attach to the session after starting', true)
  .option('--no-attach', 'Start in background without attaching')
  .option('--proposer <command>', 'Command to start the proposer agent', 'claude')
  .option('--reviewer <command>', 'Command to start the reviewer agent', 'claude')
  .option('-o, --output <dir>', 'Output directory for logs', './debate-output')
  .action(async (options) => {
    const spinner = ora('Initializing debate session...').start();

    try {
      // Create config
      const config = createDefaultConfig(options.topic, {
        maxRounds: parseInt(options.maxRounds, 10),
        outputDir: options.output,
        proposer: {
          command: options.proposer,
          promptPattern: '^>\\s*$',
          timeout: 180,
          name: 'Proposer',
        },
        reviewer: {
          command: options.reviewer,
          promptPattern: '^>\\s*$',
          timeout: 180,
          name: 'Reviewer',
        },
      });

      // Create logger
      const logger = new DebateLogger(options.output, config.sessionName!);
      await logger.init();

      // Create orchestrator with event handlers
      const orchestrator = new Orchestrator(config, {
        onStateChange: (from: DebateState, to: DebateState, ctx: DebateContext) => {
          logger.logStateChange(from, to);
          spinner.text = `[${ctx.currentRound}/${ctx.maxRounds}] State: ${to}`;
        },
        onRoundStart: (round: number, maxRounds: number) => {
          spinner.text = `Round ${round}/${maxRounds} starting...`;
        },
        onRoundEnd: (round: number, record: RoundRecord) => {
          logger.logRound(record);
          const agreed = record.consensus?.agreed ? chalk.green('agreed') : chalk.yellow('not agreed');
          spinner.text = `Round ${round} completed - ${agreed}`;
        },
        onConsensus: (result: ConsensusResult) => {
          logger.logConsensus(result);
        },
        onError: (error: Error) => {
          logger.logError(error);
          spinner.fail(chalk.red(`Error: ${error.message}`));
        },
      });

      spinner.succeed(`Session created: ${chalk.cyan(orchestrator.sessionName)}`);

      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.bold('Topic:'), options.topic);
      console.log(chalk.bold('Max Rounds:'), options.maxRounds);
      console.log(chalk.bold('Proposer:'), options.proposer);
      console.log(chalk.bold('Reviewer:'), options.reviewer);
      console.log(chalk.gray('─'.repeat(50)));

      if (options.attach) {
        console.log(chalk.yellow('\nStarting debate and attaching to session...'));
        console.log(chalk.gray('Use Ctrl+b d to detach, `debate attach` to reattach\n'));

        // Run in background and attach
        const runPromise = orchestrator.run().then(async (ctx) => {
          const result = orchestrator.getFinalResult();
          const finalPath = await logger.writeFinal(ctx, result.finalAnswer);

          console.log(chalk.gray('\n' + '─'.repeat(50)));
          if (ctx.consensusReached) {
            console.log(chalk.green.bold('✓ Consensus reached!'));
          } else {
            console.log(chalk.yellow.bold('⚠ No consensus reached'));
          }
          console.log(chalk.gray(`Rounds: ${ctx.currentRound}/${ctx.maxRounds}`));
          console.log(chalk.gray(`Output: ${finalPath}`));
        });

        // Give orchestrator time to initialize before attaching
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Attach to session
        await orchestrator.attach();

        // Wait for completion
        await runPromise;
      } else {
        console.log(chalk.yellow('\nRunning in background...'));
        console.log(chalk.gray(`Use 'debate attach --session ${orchestrator.sessionName}' to view`));

        // Start running in background
        orchestrator.run().catch((err) => {
          console.error(chalk.red('Background error:'), err.message);
        });
      }
    } catch (error) {
      spinner.fail(chalk.red('Failed to start debate'));
      console.error(error);
      process.exit(1);
    }
  });

// ============ ATTACH COMMAND ============
program
  .command('attach')
  .description('Attach to an existing debate session')
  .option('-s, --session <name>', 'Session name to attach to')
  .action(async (options) => {
    try {
      let sessionName = options.session;

      if (!sessionName) {
        // Find existing debate sessions
        const sessions = await listSessions();
        const debateSessions = sessions.filter((s) => s.startsWith('debate-'));

        if (debateSessions.length === 0) {
          console.log(chalk.yellow('No active debate sessions found.'));
          console.log(chalk.gray('Start a new session with: debate start --topic "your topic"'));
          process.exit(0);
        }

        if (debateSessions.length === 1) {
          sessionName = debateSessions[0];
        } else {
          console.log(chalk.yellow('Multiple sessions found:'));
          debateSessions.forEach((s, i) => {
            console.log(`  ${i + 1}. ${s}`);
          });
          console.log(chalk.gray('\nSpecify session with: debate attach --session <name>'));
          process.exit(0);
        }
      }

      // Check if session exists
      if (!(await sessionExists(sessionName))) {
        console.log(chalk.red(`Session '${sessionName}' not found.`));
        process.exit(1);
      }

      console.log(chalk.green(`Attaching to session: ${sessionName}`));
      console.log(chalk.gray('Use Ctrl+b d to detach\n'));

      const tmux = new TmuxManager({ sessionName });
      await tmux.attach();
    } catch (error) {
      console.error(chalk.red('Failed to attach:'), error);
      process.exit(1);
    }
  });

// ============ STATUS COMMAND ============
program
  .command('status')
  .description('Show status of active debate sessions')
  .action(async () => {
    try {
      const sessions = await listSessions();
      const debateSessions = sessions.filter((s) => s.startsWith('debate-'));

      if (debateSessions.length === 0) {
        console.log(chalk.yellow('No active debate sessions.'));
        return;
      }

      console.log(chalk.bold('Active Debate Sessions:\n'));

      for (const session of debateSessions) {
        console.log(chalk.cyan(`  ${session}`));
      }

      console.log(chalk.gray('\nUse `debate attach --session <name>` to view a session'));
    } catch (error) {
      console.error(chalk.red('Failed to get status:'), error);
      process.exit(1);
    }
  });

// ============ STOP COMMAND ============
program
  .command('stop')
  .description('Stop a debate session')
  .option('-s, --session <name>', 'Session name to stop')
  .option('--all', 'Stop all debate sessions')
  .action(async (options) => {
    try {
      const sessions = await listSessions();
      const debateSessions = sessions.filter((s) => s.startsWith('debate-'));

      if (options.all) {
        for (const session of debateSessions) {
          const tmux = new TmuxManager({ sessionName: session });
          await tmux.killSession();
          console.log(chalk.green(`Stopped: ${session}`));
        }
        return;
      }

      let sessionName = options.session;

      if (!sessionName) {
        if (debateSessions.length === 0) {
          console.log(chalk.yellow('No active debate sessions to stop.'));
          return;
        }

        if (debateSessions.length === 1) {
          sessionName = debateSessions[0];
        } else {
          console.log(chalk.yellow('Multiple sessions found. Specify with --session or use --all'));
          debateSessions.forEach((s) => console.log(`  ${s}`));
          return;
        }
      }

      const tmux = new TmuxManager({ sessionName });
      await tmux.killSession();
      console.log(chalk.green(`Stopped session: ${sessionName}`));
    } catch (error) {
      console.error(chalk.red('Failed to stop session:'), error);
      process.exit(1);
    }
  });

// ============ LOGS COMMAND ============
program
  .command('logs')
  .description('View or manage debate logs')
  .option('-s, --session <name>', 'Session name')
  .option('-o, --output <dir>', 'Output directory', './debate-output')
  .option('--path', 'Just print the logs directory path')
  .action(async (options) => {
    const { promises: fs } = await import('fs');
    const { join } = await import('path');

    try {
      const outputDir = options.output;

      if (options.path) {
        console.log(outputDir);
        return;
      }

      // List all session directories
      try {
        const entries = await fs.readdir(outputDir, { withFileTypes: true });
        const sessionDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

        if (sessionDirs.length === 0) {
          console.log(chalk.yellow('No debate logs found.'));
          console.log(chalk.gray(`Output directory: ${outputDir}`));
          return;
        }

        console.log(chalk.bold('Debate Logs:\n'));

        for (const sessionDir of sessionDirs.slice(-10)) {
          // Last 10
          const logPath = join(outputDir, sessionDir, 'rounds.jsonl');
          const logs = await readLogs(logPath);
          const rounds = logs.filter((l) => l.type === 'round').length;

          const finalPath = join(outputDir, sessionDir, 'final.txt');
          const lastPath = join(outputDir, sessionDir, 'last.txt');

          let status = chalk.gray('in progress');
          try {
            await fs.access(finalPath);
            status = chalk.green('agreed');
          } catch {
            try {
              await fs.access(lastPath);
              status = chalk.yellow('no consensus');
            } catch {
              // Still in progress or no output
            }
          }

          console.log(`  ${chalk.cyan(sessionDir)}`);
          console.log(`    Rounds: ${rounds}  Status: ${status}`);
          console.log(`    Path: ${join(outputDir, sessionDir)}`);
          console.log('');
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          console.log(chalk.yellow('No debate logs found.'));
          console.log(chalk.gray(`Output directory: ${outputDir}`));
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error(chalk.red('Failed to read logs:'), error);
      process.exit(1);
    }
  });

// Parse and execute
program.parse();
