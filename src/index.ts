import { createServer } from './server/index.js';
import { config } from './config/env.js';

const { server, modelGateway, emailManager } = createServer();

server.listen(config.port, config.host, () => {
  console.log(`\n======================================================`);
  console.log(`🦞  OPENCLAW ENGINE ACTIVE`);
  console.log(`======================================================`);
  console.log(`🌐  Dashboard & API: http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
  console.log(`🔒  Security Mode: Password Protected + Failed Login Lockout + Offline SVG CAPTCHA`);
  console.log(`🤖  Primary LLM: Gemini (${config.models.gemini.model}) with auto-fallback to OpenAI/Anthropic/Ollama`);
  console.log(`✉️   Dynamic Email Accounts: ${emailManager.listAccounts().length} configured`);
  console.log(`======================================================\n`);
});
