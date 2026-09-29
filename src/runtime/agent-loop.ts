import { ModelGateway } from '../gateway/model-gateway.js';
import { EmailManager } from '../capabilities/email/email-manager.js';
import { CalendarManager } from '../capabilities/calendar/calendar-manager.js';
import { ApprovalGate } from '../capabilities/approval/approval-gate.js';
import { AgentRunResult, ModelMessage, ToolDefinition } from '../types/index.js';

export class AgentRuntime {
  private gateway: ModelGateway;
  private emailManager: EmailManager;
  private calendarManager: CalendarManager;
  private approvalGate: ApprovalGate;

  constructor(
    gateway: ModelGateway,
    emailManager: EmailManager,
    calendarManager: CalendarManager,
    approvalGate: ApprovalGate
  ) {
    this.gateway = gateway;
    this.emailManager = emailManager;
    this.calendarManager = calendarManager;
    this.approvalGate = approvalGate;

    // Register email sending handler with the ApprovalGate
    this.approvalGate.registerHandler('send_email', async (payload) => {
      return await this.emailManager.sendEmailDirect(payload);
    });
  }

  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'list_email_accounts',
        description: 'List all dynamic email inboxes and accounts configured in OpenClaw',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'fetch_recent_emails',
        description: 'Fetch recent email headers from a specific account inbox',
        parameters: {
          type: 'object',
          properties: {
            accountId: { type: 'string', description: 'The account ID (e.g. personal, sales, business)' },
            limit: { type: 'number', description: 'Maximum emails to fetch (default: 5)' },
          },
          required: ['accountId'],
        },
      },
      {
        name: 'read_email',
        description: 'Read the full text body and details of an email by message UID',
        parameters: {
          type: 'object',
          properties: {
            accountId: { type: 'string', description: 'The account ID' },
            uid: { type: 'number', description: 'The email message UID' },
          },
          required: ['accountId', 'uid'],
        },
      },
      {
        name: 'send_email',
        description: 'Request to send an email from a specific account. NOTE: Consequential action, requires user approval.',
        parameters: {
          type: 'object',
          properties: {
            accountId: { type: 'string', description: 'Sender account ID' },
            to: { type: 'array', items: { type: 'string' }, description: 'Recipient email addresses' },
            subject: { type: 'string', description: 'Email subject' },
            bodyText: { type: 'string', description: 'Plain text email body' },
          },
          required: ['accountId', 'to', 'subject', 'bodyText'],
        },
      },
      {
        name: 'list_calendar_events',
        description: 'List upcoming events and meetings on the calendar',
        parameters: {
          type: 'object',
          properties: {
            daysAhead: { type: 'number', description: 'Number of days ahead to look (default 7)' },
          },
        },
      },
      {
        name: 'create_calendar_event',
        description: 'Schedule a new calendar event or meeting',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Event title' },
            startTime: { type: 'string', description: 'Start time ISO string (e.g. 2026-09-30T10:00:00Z)' },
            endTime: { type: 'string', description: 'End time ISO string' },
            description: { type: 'string', description: 'Optional details' },
          },
          required: ['title', 'startTime', 'endTime'],
        },
      },
    ];
  }

  async run(
    userMessage: string,
    history: ModelMessage[] = [],
    conversationId: string = 'default'
  ): Promise<AgentRunResult> {
    const runId = `run_${Date.now()}`;
    const tools = this.getToolDefinitions();

    const systemPrompt: ModelMessage = {
      role: 'system',
      content: `You are OpenClaw, an autonomous, smart, robust, and trusted personal & business assistant.
You possess access to multiple dynamic email inboxes (personal, business, sales, etc.) and calendar management capabilities.
Follow these security & operational principles:
1. Always be helpful, concise, and proactive.
2. When asked about emails, list or query the appropriate account.
3. High-consequence actions (e.g. sending an email) will be submitted to the user as an approval request.
4. When drafting emails, specify clear subject and body text.`,
    };

    const messages: ModelMessage[] = [
      systemPrompt,
      ...history,
      { role: 'user', content: userMessage },
    ];

    // Query model gateway
    const modelResponse = await this.gateway.generate(messages, tools);

    let finalResponse = modelResponse.content;
    let approvalRequest = undefined;

    // Check if user requested an email sending action in natural language or if parsed
    const sendMatch = userMessage.match(/send email to\s+([\w.@+-]+)\s+saying\s+(.+)/i);
    if (sendMatch) {
      const toRecipient = sendMatch[1];
      const body = sendMatch[2];
      approvalRequest = this.approvalGate.requestApproval(
        'send_email',
        `Send email to ${toRecipient}`,
        `Draft: "${body}"`,
        {
          accountId: 'personal',
          to: [toRecipient],
          subject: 'Message from OpenClaw Assistant',
          bodyText: body,
        }
      );
      finalResponse += `\n\n🛡️ **Safety Gate Triggered**: I have staged an approval ticket (**${approvalRequest.id}**) to send an email to **${toRecipient}**. Please review and approve it on the Web Dashboard or reply to confirm.`;
    }

    return {
      runId,
      conversationId,
      response: finalResponse,
      providerUsed: modelResponse.providerUsed,
      modelUsed: modelResponse.modelUsed,
      stepsCount: 1,
      approvalRequired: approvalRequest,
    };
  }
}
