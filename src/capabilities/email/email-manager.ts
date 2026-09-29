import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import { EmailAccountConfig, EmailDetail, EmailSummary, SendEmailPayload } from '../../types/index.js';
import { config } from '../../config/env.js';

export class EmailManager {
  private accountsFile: string;
  private accounts: Map<string, EmailAccountConfig> = new Map();

  constructor(accountsFile: string = config.emailAccountsFile) {
    this.accountsFile = accountsFile;
    this.loadAccounts();
  }

  /**
   * Load accounts from the JSON configuration file or seed defaults
   */
  private loadAccounts(): void {
    try {
      const dir = path.dirname(this.accountsFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.accountsFile)) {
        const raw = fs.readFileSync(this.accountsFile, 'utf-8');
        const list: EmailAccountConfig[] = JSON.parse(raw);
        for (const acc of list) {
          this.accounts.set(acc.id, acc);
        }
      } else {
        // If file doesn't exist yet, seed with sample template
        const sampleAccounts: EmailAccountConfig[] = [
          {
            id: 'personal',
            name: 'Personal Main',
            email: 'personal@gmail.com',
            appPassword: '',
            imapHost: 'imap.gmail.com',
            imapPort: 993,
            smtpHost: 'smtp.gmail.com',
            smtpPort: 465,
            secure: true,
            enabled: false,
            tags: ['personal'],
          },
          {
            id: 'business',
            name: 'Business Support',
            email: 'business@gmail.com',
            appPassword: '',
            imapHost: 'imap.gmail.com',
            imapPort: 993,
            smtpHost: 'smtp.gmail.com',
            smtpPort: 465,
            secure: true,
            enabled: false,
            tags: ['business'],
          },
        ];
        fs.writeFileSync(this.accountsFile, JSON.stringify(sampleAccounts, null, 2), 'utf-8');
        for (const acc of sampleAccounts) {
          this.accounts.set(acc.id, acc);
        }
      }
    } catch (err) {
      console.error(`[EmailManager] Failed to load accounts file:`, err);
    }
  }

  private saveAccounts(): void {
    try {
      const list = Array.from(this.accounts.values());
      fs.writeFileSync(this.accountsFile, JSON.stringify(list, null, 2), 'utf-8');
    } catch (err) {
      console.error(`[EmailManager] Failed to save accounts file:`, err);
    }
  }

  listAccounts(): EmailAccountConfig[] {
    // Redact appPassword in list view for security
    return Array.from(this.accounts.values()).map((acc) => ({
      ...acc,
      appPassword: acc.appPassword ? '••••••••••••••••' : '',
    }));
  }

  getAccount(id: string): EmailAccountConfig | undefined {
    return this.accounts.get(id);
  }

  saveAccount(account: EmailAccountConfig): void {
    // If updating and appPassword wasn't provided or was redacted, keep old password
    const existing = this.accounts.get(account.id);
    if (existing && (!account.appPassword || account.appPassword.includes('••••'))) {
      account.appPassword = existing.appPassword;
    }
    this.accounts.set(account.id, account);
    this.saveAccounts();
  }

  deleteAccount(id: string): boolean {
    const deleted = this.accounts.delete(id);
    if (deleted) {
      this.saveAccounts();
    }
    return deleted;
  }

  /**
   * Test IMAP & SMTP connectivity for a given account
   */
  async testConnection(accountId: string): Promise<{ imap: boolean; smtp: boolean; message: string }> {
    const account = this.getAccount(accountId);
    if (!account) {
      return { imap: false, smtp: false, message: `Account '${accountId}' not found` };
    }
    if (!account.appPassword) {
      return { imap: false, smtp: false, message: `No password configured for '${accountId}'` };
    }

    let imapOk = false;
    let smtpOk = false;
    const errors: string[] = [];

    // Test IMAP
    try {
      const imapConfig: imaps.ImapSimpleOptions = {
        imap: {
          user: account.email,
          password: account.appPassword,
          host: account.imapHost,
          port: account.imapPort,
          tls: account.secure,
          authTimeout: 5000,
        },
      };
      const connection = await imaps.connect(imapConfig);
      await connection.end();
      imapOk = true;
    } catch (err: any) {
      errors.push(`IMAP error: ${err.message}`);
    }

    // Test SMTP
    try {
      const transporter = nodemailer.createTransport({
        host: account.smtpHost,
        port: account.smtpPort,
        secure: account.secure,
        auth: {
          user: account.email,
          pass: account.appPassword,
        },
      });
      await transporter.verify();
      smtpOk = true;
    } catch (err: any) {
      errors.push(`SMTP error: ${err.message}`);
    }

    return {
      imap: imapOk,
      smtp: smtpOk,
      message: imapOk && smtpOk ? 'Both IMAP & SMTP connected successfully!' : errors.join('; '),
    };
  }

  /**
   * Fetch recent emails from a specific account's inbox
   */
  async fetchRecentEmails(
    accountId: string,
    limit: number = 10,
    folder: string = 'INBOX'
  ): Promise<EmailSummary[]> {
    const account = this.getAccount(accountId);
    if (!account) {
      throw new Error(`Email account '${accountId}' not found`);
    }
    if (!account.appPassword) {
      throw new Error(`Email account '${accountId}' has no password/credentials configured`);
    }

    const imapConfig: imaps.ImapSimpleOptions = {
      imap: {
        user: account.email,
        password: account.appPassword,
        host: account.imapHost,
        port: account.imapPort,
        tls: account.secure,
        authTimeout: 10000,
      },
    };

    const connection = await imaps.connect(imapConfig);
    try {
      await connection.openBox(folder);

      const searchCriteria = ['ALL'];
      const fetchOptions = {
        bodies: ['HEADER'],
        markSeen: false,
        struct: true,
      };

      const messages = await connection.search(searchCriteria, fetchOptions);
      // Sort messages descending by UID (newest first)
      messages.sort((a, b) => b.attributes.uid - a.attributes.uid);
      const topMessages = messages.slice(0, limit);

      const results: EmailSummary[] = [];

      for (const msg of topMessages) {
        const headerPart = msg.parts.find((p) => p.which === 'HEADER');
        const header = headerPart ? headerPart.body : {};
        const subject = Array.isArray(header.subject) ? header.subject[0] : header.subject || '(No Subject)';
        const from = Array.isArray(header.from) ? header.from[0] : header.from || '';
        const to = Array.isArray(header.to) ? header.to : [header.to || ''];
        const date = header.date ? new Date(header.date[0]) : new Date();
        const unread = !msg.attributes.flags.includes('\\Seen');

        results.push({
          id: `${accountId}:${msg.attributes.uid}`,
          accountId: account.id,
          accountEmail: account.email,
          uid: msg.attributes.uid,
          date,
          from,
          to,
          subject,
          unread,
        });
      }

      return results;
    } finally {
      await connection.end();
    }
  }

  /**
   * Fetch full email content for a given account and message UID
   */
  async readEmail(accountId: string, uid: number): Promise<EmailDetail> {
    const account = this.getAccount(accountId);
    if (!account || !account.appPassword) {
      throw new Error(`Account '${accountId}' not found or credentials missing`);
    }

    const imapConfig: imaps.ImapSimpleOptions = {
      imap: {
        user: account.email,
        password: account.appPassword,
        host: account.imapHost,
        port: account.imapPort,
        tls: account.secure,
        authTimeout: 10000,
      },
    };

    const connection = await imaps.connect(imapConfig);
    try {
      await connection.openBox('INBOX');
      const messages = await connection.search([['UID', uid]], {
        bodies: [''],
        markSeen: false,
      });

      if (!messages || messages.length === 0) {
        throw new Error(`Email with UID ${uid} not found in account '${accountId}'`);
      }

      const rawPart = messages[0].parts.find((p) => p.which === '');
      const rawSource = rawPart ? rawPart.body : '';
      const parsed = await simpleParser(rawSource);

      return {
        id: `${accountId}:${uid}`,
        accountId,
        accountEmail: account.email,
        uid,
        date: parsed.date || new Date(),
        from: parsed.from?.text || '',
        to: Array.isArray(parsed.to) ? parsed.to.map((t) => t.text) : [parsed.to?.text || ''],
        subject: parsed.subject || '(No Subject)',
        snippet: parsed.text?.slice(0, 200),
        bodyText: parsed.text || '',
        bodyHtml: parsed.html || '',
        unread: !messages[0].attributes.flags.includes('\\Seen'),
        hasAttachments: Boolean(parsed.attachments && parsed.attachments.length > 0),
        attachments: parsed.attachments?.map((a) => ({
          filename: a.filename || 'attachment',
          contentType: a.contentType,
          size: a.size,
        })),
      };
    } finally {
      await connection.end();
    }
  }

  /**
   * Send an email directly via the configured account's SMTP
   */
  async sendEmailDirect(payload: SendEmailPayload): Promise<{ success: boolean; messageId: string }> {
    const account = this.getAccount(payload.accountId);
    if (!account) {
      throw new Error(`Email account '${payload.accountId}' not found`);
    }
    if (!account.appPassword) {
      throw new Error(`Account '${payload.accountId}' credentials missing`);
    }

    const transporter = nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.secure,
      auth: {
        user: account.email,
        pass: account.appPassword,
      },
    });

    const info = await transporter.sendMail({
      from: `"${account.name}" <${account.email}>`,
      to: payload.to.join(', '),
      cc: payload.cc?.join(', '),
      bcc: payload.bcc?.join(', '),
      subject: payload.subject,
      text: payload.bodyText,
      html: payload.bodyHtml,
      inReplyTo: payload.inReplyTo,
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  }
}
