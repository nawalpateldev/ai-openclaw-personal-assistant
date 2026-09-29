import { ModelGateway } from '../src/gateway/model-gateway.js';
import { EmailManager } from '../src/capabilities/email/email-manager.js';
import { CalendarManager } from '../src/capabilities/calendar/calendar-manager.js';
import { ApprovalGate } from '../src/capabilities/approval/approval-gate.js';
import { AgentRuntime } from '../src/runtime/agent-loop.js';

async function runAgentTest() {
  console.log('--- Testing OpenClaw Agent Loop & Runtime ---');
  const gateway = new ModelGateway();
  const emailManager = new EmailManager();
  const calendarManager = new CalendarManager();
  const approvalGate = new ApprovalGate();
  const runtime = new AgentRuntime(gateway, emailManager, calendarManager, approvalGate);

  // Test 1: Telegram Status Query
  console.log('\n[Test 1] Prompt: "check telegram"');
  try {
    const res1 = await runtime.run('check telegram');
    console.log('Provider:', res1.providerUsed);
    console.log('Response:\n', res1.response);
  } catch (err: any) {
    console.error('Test 1 Failed:', err.message);
  }

  // Test 2: Draft Email (Security Safety Gate Trigger)
  console.log('\n[Test 2] Prompt: "send email to partner@example.com saying Meeting confirmed for 3 PM"');
  try {
    const res2 = await runtime.run('send email to partner@example.com saying Meeting confirmed for 3 PM');
    console.log('Response:\n', res2.response);
    if (res2.approvalRequired) {
      console.log('✅ Safety Gate Caught Action!');
      console.log('Approval Ticket ID:', res2.approvalRequired.id);
      console.log('Approval Title:', res2.approvalRequired.title);
      console.log('Content Hash:', res2.approvalRequired.payload._contentHash);
    } else {
      console.warn('⚠️ Expected approval gate to trigger.');
    }
  } catch (err: any) {
    console.error('Test 2 Failed:', err.message);
  }
}

runAgentTest();
