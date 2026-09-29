import svgCaptcha from 'svg-captcha';
import crypto from 'crypto';
import { config } from '../../config/env.js';
import { CaptchaChallenge } from '../../types/index.js';

export class CaptchaService {
  /**
   * Generate an offline SVG captcha challenge with an HMAC-signed token
   */
  static generate(): CaptchaChallenge {
    // Generate text or math puzzle based on configuration
    const captcha = svgCaptcha.create({
      size: 4,
      noise: 3,
      color: true,
      background: '#1a1d24',
      width: 150,
      height: 48,
      fontSize: 42,
    });

    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minute validity
    const challengeText = captcha.text.toLowerCase().trim();

    // Create tamper-proof HMAC payload
    const payload = `${challengeText}:${expiresAt}`;
    const hmac = crypto
      .createHmac('sha256', config.jwtSecret)
      .update(payload)
      .digest('hex');

    const challengeId = Buffer.from(`${payload}:${hmac}`).toString('base64url');

    return {
      challengeId,
      svg: captcha.data,
      expiresAt,
    };
  }

  /**
   * Verify captcha input against the signed challenge token
   */
  static verify(challengeId: string, userInput: string): boolean {
    if (!challengeId || !userInput) return false;

    try {
      const decoded = Buffer.from(challengeId, 'base64url').toString('utf-8');
      const parts = decoded.split(':');
      if (parts.length !== 3) return false;

      const [expectedText, expiresAtStr, receivedHmac] = parts;
      const expiresAt = parseInt(expiresAtStr, 10);

      // Check expiration
      if (Date.now() > expiresAt) {
        return false;
      }

      // Verify HMAC integrity
      const payload = `${expectedText}:${expiresAt}`;
      const expectedHmac = crypto
        .createHmac('sha256', config.jwtSecret)
        .update(payload)
        .digest('hex');

      if (!crypto.timingSafeEqual(Buffer.from(receivedHmac), Buffer.from(expectedHmac))) {
        return false;
      }

      // Verify matching answer (case-insensitive)
      return userInput.toLowerCase().trim() === expectedText;
    } catch (err) {
      return false;
    }
  }
}
