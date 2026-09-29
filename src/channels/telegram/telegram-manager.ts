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

  /**
   * Handle an inbound Telegram webhook or polling update
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
      console.warn(`[Telegram] Unauthorized access attempt from user ID ${senderId} on bot ${bot.botUsername}`);
      return {
        replyText: '⛔ Unauthorized. Your Telegram account is not paired with this OpenClaw bot.',
      };
    }

    const text = message.text?.trim() || '';

    // Handle approval commands
    if (text.startsWith('/approve ')) {
      const id = text.split(' ')[1];
      const res = await this.approvalGate.approve(id, `telegram:${senderId}`);
      return {
        replyText: res.success ? `✅ Approved and executed ticket ${id}` : `❌ Failed: ${res.error}`,
      };
    }

    if (text.startsWith('/reject ')) {
      const id = text.split(' ')[1];
      const ok = this.approvalGate.reject(id, 'Rejected via Telegram', `telegram:${senderId}`);
      return {
        replyText: ok ? `🚫 Rejected ticket ${id}` : `❌ Ticket not found`,
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
}
