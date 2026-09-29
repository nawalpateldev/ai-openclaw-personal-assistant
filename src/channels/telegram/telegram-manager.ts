import fs from 'fs';
import path from 'path';
import { AgentRuntime } from '../../runtime/agent-loop.js';
import { ApprovalGate } from '../../capabilities/approval/approval-gate.js';

export interface TelegramBotConfig {
  id: string; // e.g. "telegram_personal", "telegram_sales"
  name: string;
  botUsername: string;
  botToken: string;
  allowedUserIds: string[]; // ["*"] for public or array of user IDs
  enabled: boolean;
  description?: string;
}

export class TelegramChannelManager {
  private accountsFile: string;
  private bots: Map<string, TelegramBotConfig> = new Map();
  private runtime: AgentRuntime;
  private approvalGate: ApprovalGate;
  private activePolling: Map<string, boolean> = new Map();
  private lastUpdateIds: Map<string, number> = new Map();

  constructor(
    runtime: AgentRuntime,
    approvalGate: ApprovalGate,
    accountsFile: string = './config/telegram-accounts.json'
  ) {
    this.runtime = runtime;
    this.approvalGate = approvalGate;
    this.accountsFile = path.resolve(accountsFile);
    this.loadBots();
  }

  private loadBots(): void {
    try {
      if (fs.existsSync(this.accountsFile)) {
        const raw = fs.readFileSync(this.accountsFile, 'utf-8');
        const list: TelegramBotConfig[] = JSON.parse(raw);
        for (const bot of list) {
          this.bots.set(bot.id, bot);
        }
      }
    } catch (err) {
      console.error('[TelegramChannelManager] Failed to load bots configuration:', err);
    }
  }

  listBots(): TelegramBotConfig[] {
    return Array.from(this.bots.values()).map((b) => ({
      ...b,
      botToken: b.botToken ? '••••••••••••••••' : '',
    }));
  }

  getBot(id: string): TelegramBotConfig | undefined {
    return this.bots.get(id);
  }

  /**
   * Send a reply message directly to a Telegram chat
   */
  async sendMessage(botToken: string, chatId: number, text: string): Promise<boolean> {
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown',
        }),
      });
      return res.ok;
    } catch (err) {
      console.error('[Telegram] Failed to send message:', err);
      return false;
    }
  }

  /**
   * Handle an inbound Telegram update
   */
  async handleInboundMessage(botId: string, message: {
    message_id: number;
    from: { id: number; username?: string; first_name?: string };
    chat: { id: number };
    text?: string;
  }): Promise<{ replyText: string }> {
    const bot = this.bots.get(botId);
    if (!bot || !bot.enabled) {
      throw new Error(`Telegram bot '${botId}' not found or disabled`);
    }

    const senderId = String(message.from.id);
    const isAllowed = bot.allowedUserIds.includes('*') || bot.allowedUserIds.includes(senderId);

    if (!isAllowed) {
      console.warn(
        `[Telegram] Unauthorized access attempt from Telegram user ID: ${senderId} (@${message.from.username || 'unknown'}) on bot @${bot.botUsername}`
      );
      return {
        replyText: `⛔ *Access Denied*\nYour Telegram account is not paired with OpenClaw.\nYour Telegram User ID is: \`${senderId}\`\n\nTo grant access, add \`"${senderId}"\` (or \`"*"\` for all) to \`allowedUserIds\` in \`config/telegram-accounts.json\`.`,
      };
    }

    const text = message.text?.trim() || '';

    // Handle approval commands
    if (text.startsWith('/approve ')) {
      const id = text.split(' ')[1];
      const res = await this.approvalGate.approve(id, `telegram:${senderId}`);
      return {
        replyText: res.success ? `✅ Approved and executed ticket \`${id}\`` : `❌ Approval failed: ${res.error}`,
      };
    }

    if (text.startsWith('/reject ')) {
      const id = text.split(' ')[1];
      const ok = this.approvalGate.reject(id, 'Rejected via Telegram', `telegram:${senderId}`);
      return {
        replyText: ok ? `🚫 Rejected ticket \`${id}\`` : `❌ Ticket not found`,
      };
    }

    if (text === '/start' || text === '/help') {
      return {
        replyText: `🦞 *OpenClaw Assistant Connected*\n\nHello ${message.from.first_name || 'there'}! I am OpenClaw, your intelligent personal and business assistant.\n\nCommands:\n• \`/status\` - View system status\n• \`/approvals\` - Check pending tickets\n• Or just ask me anything!`,
      };
    }

    // Agent response
    const conversationId = `tg_${botId}_${message.chat.id}`;
    const result = await this.runtime.run(text, [], conversationId);

    let reply = result.response;
    if (result.approvalRequired) {
      reply += `\n\n🛡️ *Tier-2 Human Approval Ticket Created*\nTicket ID: \`${result.approvalRequired.id}\`\nAction: ${result.approvalRequired.title}\nReply \`/approve ${result.approvalRequired.id}\` to execute.`;
    }

    return { replyText: reply };
  }

  /**
   * Start long-polling for a specific bot
   */
  startPolling(botId: string): void {
    const bot = this.bots.get(botId);
    if (!bot || !bot.enabled || !bot.botToken) {
      return;
    }

    if (this.activePolling.get(botId)) {
      return;
    }

    this.activePolling.set(botId, true);
    console.log(`[Telegram] Starting live polling for @${bot.botUsername} (${bot.name})...`);

    const poll = async () => {
      while (this.activePolling.get(botId)) {
        try {
          const offset = this.lastUpdateIds.get(botId) || 0;
          const url = `https://api.telegram.org/bot${bot.botToken}/getUpdates?offset=${offset}&timeout=20`;
          const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
          
          if (res.ok) {
            const data: any = await res.json();
            if (data.ok && Array.isArray(data.result)) {
              for (const update of data.result) {
                this.lastUpdateIds.set(botId, update.update_id + 1);
                if (update.message && update.message.text) {
                  const reply = await this.handleInboundMessage(botId, update.message);
                  await this.sendMessage(bot.botToken, update.message.chat.id, reply.replyText);
                }
              }
            }
          }
        } catch (err: any) {
          // Network hiccup or timeout, pause briefly before retrying
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
    };

    poll().catch((err) => console.error(`[Telegram] Polling crashed for bot ${botId}:`, err));
  }

  /**
   * Start polling on all enabled bots
   */
  startAll(): void {
    for (const [botId, bot] of this.bots.entries()) {
      if (bot.enabled && bot.botToken) {
        this.startPolling(botId);
      }
    }
  }

  stopAll(): void {
    for (const botId of this.activePolling.keys()) {
      this.activePolling.set(botId, false);
    }
  }
}
