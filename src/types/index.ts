/**
 * OpenClaw Canonical Type Definitions & Contracts
 */

export type ModelProviderName = 'gemini' | 'openai' | 'anthropic' | 'ollama';

export interface ModelConfig {
  provider: ModelProviderName;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  enabled: boolean;
}

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ModelResponse {
  content: string;
  toolCalls?: ToolCall[];
  providerUsed: ModelProviderName;
  modelUsed: string;
  tokensUsed?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  latencyMs: number;
  fallbackOccurred?: boolean;
  requestedProvider?: ModelProviderName;
  failedProviders?: { provider: string; error: string }[];
}

// -----------------------------------------------------------------------------
// Dynamic Multi-Account Email Types
// -----------------------------------------------------------------------------

export interface EmailAccountConfig {
  id: string; // e.g. "personal", "sales", "support-lead", "investors"
  name: string; // Friendly display name
  email: string; // e.g. "sales@company.com"
  appPassword?: string; // App-specific password or token
  imapHost: string; // e.g. "imap.gmail.com"
  imapPort: number; // e.g. 993
  smtpHost: string; // e.g. "smtp.gmail.com"
  smtpPort: number; // e.g. 465
  secure: boolean; // SSL/TLS
  enabled: boolean;
  tags?: string[]; // e.g. ["sales", "inbound", "priority"]
  createdAt?: string;
  updatedAt?: string;
}

export interface EmailSummary {
  id: string;
  accountId: string;
  accountEmail: string;
  seqNumber?: number;
  uid?: number;
  date: Date | string;
  from: string;
  to: string[];
  subject: string;
  snippet?: string;
  unread: boolean;
  hasAttachments?: boolean;
}

export interface EmailDetail extends EmailSummary {
  bodyText?: string;
  bodyHtml?: string;
  attachments?: {
    filename: string;
    contentType: string;
    size: number;
  }[];
}

export interface SendEmailPayload {
  accountId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  inReplyTo?: string;
}

// -----------------------------------------------------------------------------
// Human-In-The-Loop (HITL) Tier-2 Approval
// -----------------------------------------------------------------------------

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface ApprovalRequest {
  id: string;
  actionType: 'send_email' | 'delete_email' | 'calendar_cancel' | 'shell_exec';
  title: string;
  description: string;
  payload: any;
  status: ApprovalStatus;
  requestedAt: string;
  resolvedAt?: string;
  resolvedBy?: string; // e.g. "dashboard-admin", "cli", "telegram"
  rejectionReason?: string;
}

// -----------------------------------------------------------------------------
// Dashboard Authentication, Security & CAPTCHA
// -----------------------------------------------------------------------------

export interface CaptchaChallenge {
  challengeId: string;
  svg: string;
  expiresAt: number;
}

export interface LoginAttemptRecord {
  ip: string;
  failedCount: number;
  lockedUntil?: number;
  lastAttemptAt: number;
}

export interface AuthSession {
  sessionId: string;
  username: string;
  role: 'admin' | 'viewer';
  createdAt: number;
  expiresAt: number;
}

// -----------------------------------------------------------------------------
// Channel Ingress & Canonical Envelope
// -----------------------------------------------------------------------------

export interface CanonicalEnvelope {
  eventId: string;
  channel: 'cli' | 'dashboard' | 'telegram' | 'whatsapp';
  senderId: string;
  conversationId: string;
  timestamp: string;
  content: string;
  attachments?: any[];
  metadata?: Record<string, any>;
}

export interface AgentRunResult {
  runId: string;
  conversationId: string;
  response: string;
  providerUsed: ModelProviderName;
  modelUsed: string;
  stepsCount: number;
  approvalRequired?: ApprovalRequest;
  fallbackOccurred?: boolean;
  requestedProvider?: ModelProviderName;
  fallbackNotice?: string;
}
