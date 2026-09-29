import { ModelGateway } from '../src/gateway/model-gateway.js';

async function runGatewayTest() {
  console.log('--- Testing OpenClaw Resilient Model Gateway ---');
  const gw = new ModelGateway();

  console.log('\nConfigured Providers:');
  console.table(gw.getStatuses());

  try {
    console.log('\nSending test prompt: "Say hello in 3 words"...');
    const res = await gw.generate([{ role: 'user', content: 'Say hello in 3 words' }]);
    console.log('\n✅ Gateway Generation Succeeded!');
    console.log('Provider Used:', res.providerUsed.toUpperCase());
    console.log('Model Used:', res.modelUsed);
    console.log('Response Content:', res.content);
    console.log('Latency:', `${res.latencyMs}ms`);
  } catch (err: any) {
    console.error('\n❌ Gateway Generation Failed:', err.message);
  }
}

runGatewayTest();
