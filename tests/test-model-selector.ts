import { ModelGateway } from '../src/gateway/model-gateway.js';
import { AgentRuntime } from '../src/runtime/agent-loop.js';
import { EmailManager } from '../src/capabilities/email/email-manager.js';
import { CalendarManager } from '../src/capabilities/calendar/calendar-manager.js';
import { ApprovalGate } from '../src/capabilities/approval/approval-gate.js';

async function testModelSelector() {
  console.log('--- Testing Primary LLM Selector & Fallback Notification ---\n');

  const gateway = new ModelGateway();
  const emailManager = new EmailManager();
  const calendarManager = new CalendarManager();
  const approvalGate = new ApprovalGate();
  const runtime = new AgentRuntime(gateway, emailManager, calendarManager, approvalGate);

  // 1. Test selecting Ollama as primary
  console.log('[Test 1] Primary requested: "ollama"');
  const resOllama = await runtime.run('Reply with the word "OLLAMA_CONFIRMED"', [], 'test_ollama', 'ollama');
  console.log('Provider used:', resOllama.providerUsed);
  console.log('Model used:', resOllama.modelUsed);
  console.log('Fallback occurred:', resOllama.fallbackOccurred);
  console.log('Response preview:', resOllama.response.trim().substring(0, 100));
  console.log('-----------------------------------------------------\n');

  // 2. Test selecting Gemini as primary
  console.log('[Test 2] Primary requested: "gemini"');
  const resGemini = await runtime.run('Reply with the word "GEMINI_CONFIRMED"', [], 'test_gemini', 'gemini');
  console.log('Provider used:', resGemini.providerUsed);
  console.log('Model used:', resGemini.modelUsed);
  console.log('Fallback occurred:', resGemini.fallbackOccurred);
  console.log('Response preview:', resGemini.response.trim().substring(0, 100));
  console.log('-----------------------------------------------------\n');

  // 3. Test selecting an unavailable provider (e.g. OpenAI without API key)
  console.log('[Test 3] Primary requested: "openai" (Not configured -> Should trigger fallback with notification)');
  const resFallback = await runtime.run('Say "Fallback success" in 3 words', [], 'test_fallback', 'openai');
  console.log('Provider used:', resFallback.providerUsed);
  console.log('Model used:', resFallback.modelUsed);
  console.log('Fallback occurred:', resFallback.fallbackOccurred);
  console.log('Requested provider:', resFallback.requestedProvider);
  console.log('Fallback notice attached:', resFallback.response.includes('⚠️ *Notice: Primary LLM (OpenAI) is currently not available'));
  console.log('Full response output:\n', resFallback.response);
  console.log('-----------------------------------------------------\n');

  console.log('✅ ALL MODEL SELECTOR & FALLBACK TESTS COMPLETED SUCCESSFULLY!');
}

testModelSelector().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
