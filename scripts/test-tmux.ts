/**
 * Quick test script to verify tmux integration works
 *
 * Run with: npx tsx scripts/test-tmux.ts
 */

import { TmuxManager, generateSessionName, isTmuxAvailable } from '../src/tmux/index.js';

async function main() {
  console.log('🧪 Testing tmux integration...\n');

  // 1. Check tmux availability
  console.log('1. Checking tmux availability...');
  const available = await isTmuxAvailable();
  if (!available) {
    console.error('❌ tmux is not installed. Please install with: brew install tmux');
    process.exit(1);
  }
  console.log('✅ tmux is available\n');

  // 2. Create a test session
  console.log('2. Creating test session...');
  const sessionName = generateSessionName('test');
  const tmux = new TmuxManager({ sessionName });

  try {
    await tmux.createSession();
    console.log(`✅ Session created: ${sessionName}\n`);

    // 3. Send some text to panes
    console.log('3. Testing send-keys...');
    await tmux.sendKeys('proposer', 'echo "Hello from Proposer pane"');
    await tmux.sendKeys('reviewer', 'echo "Hello from Reviewer pane"');
    console.log('✅ Send-keys working\n');

    // Wait a moment
    await new Promise(r => setTimeout(r, 1000));

    // 4. Capture pane content
    console.log('4. Testing capture-pane...');
    const proposerContent = await tmux.capturePane('proposer');
    const reviewerContent = await tmux.capturePane('reviewer');
    console.log('Proposer pane content (last 3 lines):');
    console.log(proposerContent.split('\n').slice(-5).join('\n'));
    console.log('\nReviewer pane content (last 3 lines):');
    console.log(reviewerContent.split('\n').slice(-5).join('\n'));
    console.log('✅ Capture-pane working\n');

    // 5. Update status bar
    console.log('5. Testing status bar...');
    await tmux.updateStatusBar('Test Status | Round 1/10');
    console.log('✅ Status bar updated\n');

    console.log('─'.repeat(50));
    console.log('All tests passed! 🎉');
    console.log(`\nTo view the session, run:`);
    console.log(`  tmux attach -t ${sessionName}`);
    console.log(`\nTo kill the session, run:`);
    console.log(`  tmux kill-session -t ${sessionName}`);
    console.log('─'.repeat(50));

  } catch (error) {
    console.error('❌ Test failed:', error);
    await tmux.killSession().catch(() => {});
    process.exit(1);
  }
}

main();
