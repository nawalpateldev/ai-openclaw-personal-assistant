import fs from 'fs';
import path from 'path';

async function runTelegramTest() {
  console.log('--- Testing OpenClaw Telegram Bot Connectivity ---');
  const configPath = path.resolve('./config/telegram-accounts.json');

  if (!fs.existsSync(configPath)) {
    console.error(`Config file not found at ${configPath}`);
    return;
  }

  const bots = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  console.log(`Found ${bots.length} Telegram bot configuration(s):`);

  for (const bot of bots) {
    console.log(`\nTesting Bot: @${bot.botUsername} (${bot.name})...`);
    if (!bot.botToken) {
      console.warn('⚠️ No bot token configured.');
      continue;
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${bot.botToken}/getMe`);
      const data: any = await res.json();
      if (data.ok) {
        console.log('✅ Telegram API Verified Successfully!');
        console.log('Bot ID:', data.result.id);
        console.log('Bot Username:', `@${data.result.username}`);
        console.log('First Name:', data.result.first_name);
        console.log('Allowed User Whitelist:', bot.allowedUserIds?.length ? bot.allowedUserIds : '⚠️ Empty');
      } else {
        console.error('❌ Telegram API Error:', data.description);
      }
    } catch (err: any) {
      console.error('Network Error connecting to Telegram API:', err.message);
    }
  }
}

runTelegramTest();
