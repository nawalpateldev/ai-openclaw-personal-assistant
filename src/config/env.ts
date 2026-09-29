import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',

  // Security
  dashboardPassword: process.env.DASHBOARD_PASSWORD || 'ChangeThisSecurePassword123!',
  jwtSecret: process.env.JWT_SECRET || 'openclaw_super_secure_jwt_secret_key_random_string_987654321',
  maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10),
  lockoutMinutes: parseInt(process.env.LOCKOUT_MINUTES || '15', 10),
  captchaDifficulty: (process.env.CAPTCHA_DIFFICULTY || 'medium') as 'easy' | 'medium' | 'hard',
  disableAuth: process.env.DISABLE_AUTH === 'true',

  // Models
  models: {
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || '',
      model: process.env.GEMINI_MODEL || 'gemini-flash-latest',
      enabled: Boolean(process.env.GEMINI_API_KEY),
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      enabled: Boolean(process.env.OPENAI_API_KEY),
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
      enabled: Boolean(process.env.ANTHROPIC_API_KEY),
    },
    ollama: {
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
      model: process.env.OLLAMA_MODEL || 'llama3.2',
      enabled: process.env.OLLAMA_ENABLED !== 'false',
    },
  },

  // Dynamic Email Configuration
  emailAccountsFile: path.resolve(process.env.EMAIL_ACCOUNTS_FILE || './config/email-accounts.json'),
  defaultEmailAccountId: process.env.DEFAULT_EMAIL_ACCOUNT_ID || 'personal',

  // Storage
  dataDir: path.resolve(process.env.DATA_DIR || './data'),

  // Channels
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    allowedUserIds: (process.env.TELEGRAM_ALLOWED_USER_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
  whatsapp: {
    apiToken: process.env.WHATSAPP_API_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    allowedNumbers: (process.env.WHATSAPP_ALLOWED_NUMBERS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
};
