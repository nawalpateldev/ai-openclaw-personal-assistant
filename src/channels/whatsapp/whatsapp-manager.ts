import fs from 'fs';
import path from 'path';
import { AgentRuntime } from '../../runtime/agent-loop.js';
import { ApprovalGate } from '../../capabilities/approval/approval-gate.js';

export interface WhatsAppNumberConfig {
  id: string; // e.g. "whatsapp_personal", "whatsapp_business"
  name: string;
  phoneNumber: string;
  phoneNumberId: string;
  apiToken: string;
  verifyToken: string;
  allowedPhoneNumbers: string[]; // ["*"] or list of permitted sender numbers
  enabled: boolean;
  description?: string;
}

export class WhatsAppChannelManager {
  private accountsFile: string;
  private numbers: Map<string, WhatsAppNumberConfig> = new Map();
  private runtime: AgentRuntime;
  private approvalGate: ApprovalGate;

  constructor(
    runtime: AgentRuntime,
    approvalGate: ApprovalGate,
    accountsFile: string = './config/whatsapp-accounts.json'
  ) {
    this.runtime = runtime;
    this.approvalGate = approvalGate;
    this.accountsFile = path.resolve(accountsFile);
    this.loadNumbers();
  }

  private loadNumbers(): void {
    try {
      if (fs.existsSync(this.accountsFile)) {
        const raw = fs.readFileSync(this.accountsFile, 'utf-8');
        const list: WhatsAppNumberConfig[] = JSON.parse(raw);
        for (const num of list) {
          this.numbers.set(num.id, num);
        }
      }
    } catch (err) {
      console.error('[WhatsAppChannelManager] Failed to load numbers config:', err);
    }
  }

  listNumbers(): WhatsAppNumberConfig[] {
    return Array.from(this.numbers.values()).map((n) => ({
      ...n,
      apiToken: n.apiToken ? '••••••••••••••••' : '',
    }));
  }

  /**
   * Handle an inbound WhatsApp webhook message
   */
  async handleInboundMessage(numberId: string, fromNumber: string, messageText: string): Promise<string> {
    const config = this.numbers.get(numberId);
    if (!config || !config.enabled) {
      throw new Error(`WhatsApp line '${numberId}' not found or disabled`);
    }

    const isAllowed = config.allowedPhoneNumbers.includes('*') || config.allowedPhoneNumbers.includes(fromNumber);
    if (!isAllowed) {
      console.warn(`[WhatsApp] Unauthorized message from ${fromNumber} on line ${config.phoneNumber}`);
      return '⛔ Unauthorized. Your number is not registered with this OpenClaw line.';
    }

    const text = messageText.trim();

    // Check approvals
    if (text.startsWith('/approve ')) {
      const id = text.split(' ')[1];
      const res = await this.approvalGate.approve(id, `whatsapp:${fromNumber}`);
      return res.success ? `✅ Approved and executed ticket ${id}` : `❌ Failed: ${res.error}`;
    }

    if (text.startsWith('/reject ')) {
      const id = text.split(' ')[1];
      const ok = this.approvalGate.reject(id, 'Rejected via WhatsApp', `whatsapp:${fromNumber}`);
      return ok ? `🚫 Rejected ticket ${id}` : `❌ Ticket not found`;
    }

    // Run agent
    const conversationId = `wa_${numberId}_${fromNumber}`;
    const result = await this.runtime.run(text, [], conversationId);

    let reply = result.response;
    if (result.approvalRequired) {
      reply += `\n\n🛡️ *Tier-2 Human Approval Ticket Created*\nTicket ID: ${result.approvalRequired.id}\nAction: ${result.approvalRequired.title}\nReply "/approve ${result.approvalRequired.id}" to confirm execution.`;
    }

    return reply;
  }
}
