import { Request, Response, NextFunction } from 'express';
import { config } from '../../config/env.js';
import { LoginAttemptRecord } from '../../types/index.js';

class LoginSecurityManager {
  private attempts: Map<string, LoginAttemptRecord> = new Map();

  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress || '127.0.0.1';
  }

  getRecord(ip: string): LoginAttemptRecord {
    let rec = this.attempts.get(ip);
    if (!rec) {
      rec = { ip, failedCount: 0, lastAttemptAt: Date.now() };
      this.attempts.set(ip, rec);
    }
    return rec;
  }

  isLocked(ip: string): { locked: boolean; remainingSeconds?: number } {
    const rec = this.attempts.get(ip);
    if (!rec || !rec.lockedUntil) return { locked: false };

    const now = Date.now();
    if (now < rec.lockedUntil) {
      return {
        locked: true,
        remainingSeconds: Math.ceil((rec.lockedUntil - now) / 1000),
      };
    }

    // Lockout expired, reset
    rec.lockedUntil = undefined;
    rec.failedCount = 0;
    return { locked: false };
  }

  recordFailure(ip: string): LoginAttemptRecord {
    const rec = this.getRecord(ip);
    rec.failedCount += 1;
    rec.lastAttemptAt = Date.now();

    if (rec.failedCount >= config.maxLoginAttempts) {
      rec.lockedUntil = Date.now() + config.lockoutMinutes * 60 * 1000;
      console.warn(
        `[Security] IP ${ip} exceeded maximum login attempts (${rec.failedCount}). Locked out for ${config.lockoutMinutes} minutes.`
      );
    }
    return rec;
  }

  recordSuccess(ip: string): void {
    this.attempts.delete(ip);
  }

  middleware = async (req: Request, res: Response, next: NextFunction) => {
    const ip = this.getClientIp(req);
    const lock = this.isLocked(ip);

    if (lock.locked) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: `Too many failed login attempts. IP temporarily locked. Please retry in ${lock.remainingSeconds} seconds.`,
        locked: true,
        remainingSeconds: lock.remainingSeconds,
      });
    }

    const rec = this.getRecord(ip);
    // Progressive delay after 3 failed attempts
    if (rec.failedCount >= 3) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    next();
  };
}

export const loginSecurity = new LoginSecurityManager();
