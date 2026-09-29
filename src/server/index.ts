import express from 'express';
import http from 'http';
import path from 'path';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from '../config/env.js';
import { CaptchaService } from './middleware/captcha.js';
import { loginSecurity } from './middleware/rate-limiter.js';
import { generateToken, requireAuth, AuthenticatedRequest } from './middleware/auth.js';
import { ModelGateway } from '../gateway/model-gateway.js';
import { EmailManager } from '../capabilities/email/email-manager.js';
import { CalendarManager } from '../capabilities/calendar/calendar-manager.js';
import { ApprovalGate } from '../capabilities/approval/approval-gate.js';
import { AgentRuntime } from '../runtime/agent-loop.js';
import { TelegramChannelManager } from '../channels/telegram/telegram-manager.js';
import { WhatsAppChannelManager } from '../channels/whatsapp/whatsapp-manager.js';

export function createServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  // Initialize Core Capabilities & Runtime
  const modelGateway = new ModelGateway();
  const emailManager = new EmailManager();
  const calendarManager = new CalendarManager();
  const approvalGate = new ApprovalGate();
  const agentRuntime = new AgentRuntime(modelGateway, emailManager, calendarManager, approvalGate);

  // Initialize Ingress Channels
  const telegramManager = new TelegramChannelManager(agentRuntime, approvalGate);
  telegramManager.startAll();
  const whatsappManager = new WhatsAppChannelManager(agentRuntime, approvalGate);

  // Broadcast approval notifications to connected dashboard clients
  approvalGate.onApprovalCreated((approval) => {
    const payload = JSON.stringify({ type: 'APPROVAL_CREATED', data: approval });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  });

  // Middleware
  app.use(cors({ origin: true, credentials: true }));
  app.use(cookieParser());
  app.use(express.json());

  // Static files for Web UI
  const publicDir = path.resolve('public');
  app.use(express.static(publicDir));

  // ---------------------------------------------------------------------------
  // Public Security & Auth Routes
  // ---------------------------------------------------------------------------

  // 1. Get fresh SVG CAPTCHA challenge
  app.get('/api/auth/captcha', (req, res) => {
    const challenge = CaptchaService.generate();
    res.json(challenge);
  });

  // 2. Login with Password, Lockout & CAPTCHA validation
  app.post('/api/auth/login', loginSecurity.middleware, async (req, res) => {
    const { password, captchaId, captchaAnswer } = req.body;
    const clientIp = req.socket.remoteAddress || '127.0.0.1';

    // Verify Captcha
    if (!CaptchaService.verify(captchaId, captchaAnswer)) {
      loginSecurity.recordFailure(clientIp);
      return res.status(400).json({
        error: 'Invalid CAPTCHA',
        message: 'The CAPTCHA answer is incorrect or has expired. Please try again.',
      });
    }

    // Verify Password (constant-time equivalent / direct match against configured master password)
    if (password !== config.dashboardPassword) {
      const rec = loginSecurity.recordFailure(clientIp);
      return res.status(401).json({
        error: 'Invalid Credentials',
        message: 'Incorrect dashboard password.',
        remainingAttempts: Math.max(0, config.maxLoginAttempts - rec.failedCount),
      });
    }

    // Login Success: Reset failed attempts and issue signed JWT
    loginSecurity.recordSuccess(clientIp);
    const token = generateToken('admin');

    res.cookie('openclaw_token', token, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      token,
      user: { username: 'admin', role: 'admin' },
    });
  });

  // 3. Logout
  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('openclaw_token');
    res.json({ success: true });
  });

  // 4. Session Verification
  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ authenticated: true, user: req.user });
  });

  // ---------------------------------------------------------------------------
  // Protected Agent & Dashboard Routes
  // ---------------------------------------------------------------------------

  // System Health & Providers
  app.get('/api/status', requireAuth, (req, res) => {
    res.json({
      status: 'online',
      version: '1.0.0',
      uptime: process.uptime(),
      providers: modelGateway.getStatuses(),
      emailAccountsCount: emailManager.listAccounts().length,
      pendingApprovalsCount: approvalGate.listPending().length,
      telegramBotsCount: telegramManager.listBots().length,
      whatsappNumbersCount: whatsappManager.listNumbers().length,
    });
  });

  // Channel status routes
  app.get('/api/channels/telegram/bots', requireAuth, (req, res) => {
    res.json(telegramManager.listBots());
  });

  app.get('/api/channels/whatsapp/numbers', requireAuth, (req, res) => {
    res.json(whatsappManager.listNumbers());
  });

  // Configure Provider state
  app.post('/api/gateway/provider', requireAuth, (req, res) => {
    const { provider, enabled, setPrimary } = req.body;
    if (provider) {
      if (typeof enabled === 'boolean') {
        modelGateway.setProviderEnabled(provider, enabled);
      }
      if (setPrimary) {
        modelGateway.setPrimaryProvider(provider);
      }
    }
    res.json({ success: true, providers: modelGateway.getStatuses() });
  });

  // Chat with Agent
  app.post('/api/agent/chat', requireAuth, async (req, res) => {
    try {
      const { message, conversationId } = req.body;
      if (!message) {
        return res.status(400).json({ error: 'Message is required' });
      }
      const result = await agentRuntime.run(message, [], conversationId || 'dashboard');
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Agent execution failed' });
    }
  });

  // Dynamic Email Accounts Management
  app.get('/api/email/accounts', requireAuth, (req, res) => {
    res.json(emailManager.listAccounts());
  });

  app.post('/api/email/accounts', requireAuth, (req, res) => {
    const account = req.body;
    if (!account.id || !account.email) {
      return res.status(400).json({ error: 'Account ID and Email are required' });
    }
    emailManager.saveAccount(account);
    res.json({ success: true, accounts: emailManager.listAccounts() });
  });

  app.delete('/api/email/accounts/:id', requireAuth, (req, res) => {
    const deleted = emailManager.deleteAccount(req.params.id);
    res.json({ success: deleted, accounts: emailManager.listAccounts() });
  });

  app.post('/api/email/accounts/:id/test', requireAuth, async (req, res) => {
    try {
      const result = await emailManager.testConnection(req.params.id);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/email/accounts/:id/messages', requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 10;
      const emails = await emailManager.fetchRecentEmails(req.params.id, limit);
      res.json(emails);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/email/accounts/:id/messages/:uid', requireAuth, async (req, res) => {
    try {
      const uid = parseInt(req.params.uid, 10);
      const email = await emailManager.readEmail(req.params.id, uid);
      res.json(email);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Calendar Management
  app.get('/api/calendar/events', requireAuth, (req, res) => {
    res.json(calendarManager.listEvents());
  });

  app.post('/api/calendar/events', requireAuth, (req, res) => {
    const { title, startTime, endTime, description, category } = req.body;
    if (!title || !startTime || !endTime) {
      return res.status(400).json({ error: 'Title, startTime, and endTime are required' });
    }
    const event = calendarManager.createEvent({ title, startTime, endTime, description, category });
    res.json({ success: true, event });
  });

  // Human-In-The-Loop Approvals
  app.get('/api/approvals', requireAuth, (req, res) => {
    res.json({
      pending: approvalGate.listPending(),
      all: approvalGate.listAll(),
    });
  });

  app.post('/api/approvals/:id/approve', requireAuth, async (req, res) => {
    const result = await approvalGate.approve(req.params.id, 'dashboard-admin');
    res.json(result);
  });

  app.post('/api/approvals/:id/reject', requireAuth, (req, res) => {
    const { reason } = req.body;
    const success = approvalGate.reject(req.params.id, reason, 'dashboard-admin');
    res.json({ success });
  });

  // Fallback to index.html for single-page dashboard app
  app.get('*', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  return { app, server, modelGateway, emailManager, calendarManager, approvalGate, agentRuntime };
}
