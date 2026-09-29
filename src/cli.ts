import readline from 'readline';
import { ModelGateway } from './gateway/model-gateway.js';
import { EmailManager } from './capabilities/email/email-manager.js';
import { CalendarManager } from './capabilities/calendar/calendar-manager.js';
import { ApprovalGate } from './capabilities/approval/approval-gate.js';
import { AgentRuntime } from './runtime/agent-loop.js';

async function startCli() {
  console.log(`\n======================================================`);
  console.log(`🦞  OPENCLAW: AUTONOMOUS PERSONAL & BUSINESS ASSISTANT`);
  console.log(`    Smart • Secure • Robust • Trusted`);
  console.log(`======================================================\n`);

  const gateway = new ModelGateway();
  const emailManager = new EmailManager();
  const calendarManager = new CalendarManager();
  const approvalGate = new ApprovalGate();
  const runtime = new AgentRuntime(gateway, emailManager, calendarManager, approvalGate);

  // Status check
  const statuses = gateway.getStatuses();
  console.log(`[Model Gateway Status]:`);
  for (const st of statuses) {
    const icon = st.configured && st.enabled ? '🟢' : '⚪';
    console.log(`  ${icon} ${st.provider.toUpperCase().padEnd(10)} [Model: ${st.model}] (Configured: ${st.configured}, Enabled: ${st.enabled})`);
  }

  const emailAccounts = emailManager.listAccounts();
  console.log(`\n[Dynamic Email Inboxes]: ${emailAccounts.length} accounts loaded`);
  for (const acc of emailAccounts) {
    console.log(`  ✉️  [${acc.id}] ${acc.name} <${acc.email}>`);
  }

  console.log(`\nCommands:`);
  console.log(`  /status     - View provider and queue status`);
  console.log(`  /approvals  - View and act on pending approval tickets`);
  console.log(`  /accounts   - List configured dynamic email accounts`);
  console.log(`  /exit       - Quit OpenClaw CLI\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\nOpenClaw ❯ ',
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    if (input === '/exit') {
      console.log('Shutting down OpenClaw...');
      process.exit(0);
    }

    if (input === '/status') {
      console.table(gateway.getStatuses());
      rl.prompt();
      return;
    }

    if (input === '/accounts') {
      console.table(emailManager.listAccounts());
      rl.prompt();
      return;
    }

    if (input === '/approvals') {
      const pending = approvalGate.listPending();
      if (pending.length === 0) {
        console.log('No pending approval requests.');
      } else {
        console.log(`\nPending Approvals (${pending.length}):`);
        for (const apr of pending) {
          console.log(`  [ID: ${apr.id}] ${apr.title}`);
          console.log(`     Description: ${apr.description}`);
          console.log(`     Type: ${apr.actionType}`);
        }
        console.log(`\nTo resolve, type: /approve <id>  or  /reject <id>`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('/approve ')) {
      const id = input.split(' ')[1];
      const res = await approvalGate.approve(id, 'cli');
      console.log(res.success ? `✅ Approved and executed ticket ${id}` : `❌ Failed: ${res.error}`);
      rl.prompt();
      return;
    }

    if (input.startsWith('/reject ')) {
      const id = input.split(' ')[1];
      const ok = approvalGate.reject(id, 'Rejected via CLI', 'cli');
      console.log(ok ? `🚫 Rejected ticket ${id}` : `❌ Ticket not found`);
      rl.prompt();
      return;
    }

    // Agent conversation run
    try {
      process.stdout.write('Thinking...\r');
      const result = await runtime.run(input, [], 'cli-session');
      console.log(`\n🤖 OpenClaw [via ${result.providerUsed.toUpperCase()}:${result.modelUsed}]:`);
      console.log(result.response);

      if (result.approvalRequired) {
        console.log(`\n⚠️  Tier-2 Human Approval Ticket Created:`);
        console.log(`    Ticket ID: ${result.approvalRequired.id}`);
        console.log(`    Action: ${result.approvalRequired.title}`);
        console.log(`    Run "/approve ${result.approvalRequired.id}" to confirm execution.`);
      }
    } catch (err: any) {
      console.error(`\n❌ Error:`, err.message || err);
    }

    rl.prompt();
  });
}

startCli().catch((err) => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
