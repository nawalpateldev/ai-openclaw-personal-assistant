import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config/env.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    username: string;
    role: string;
  };
}

export function generateToken(username: string = 'admin'): string {
  return jwt.sign(
    {
      username,
      role: 'admin',
    },
    config.jwtSecret,
    { expiresIn: '7d' }
  );
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.cookies && req.cookies.openclaw_token) {
    token = req.cookies.openclaw_token;
  }

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication token required to access this resource.',
    });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as any;
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired session token. Please log in again.',
    });
  }
}
