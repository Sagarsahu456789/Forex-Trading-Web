import crypto from 'node:crypto';
import path from 'node:path';

// Keep signing secret in process.env or an ephemeral in-memory 256-bit key
const EPHEMERAL_JWT_SECRET = crypto.randomBytes(32).toString('hex');
const EPHEMERAL_PAYMENT_SECRET = crypto.randomBytes(32).toString('hex');

function getJwtSecret(): string {
  return process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 16
    ? process.env.JWT_SECRET.trim()
    : EPHEMERAL_JWT_SECRET;
}

export function getPaymentSecret(): string {
  return process.env.RAZORPAY_WEBHOOK_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET.trim().length >= 8
    ? process.env.RAZORPAY_WEBHOOK_SECRET.trim()
    : EPHEMERAL_PAYMENT_SECRET;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, expectedHex] = storedHash.split(':');
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function verifyAdminPasscodeOverride(candidate: string): boolean {
  const configured = process.env.ADMIN_PASSCODE?.trim();
  if (!configured) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(configured);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export interface TokenPayload {
  sub: number;
  role: 'ADMIN' | 'MENTOR' | 'STUDENT';
  email: string;
  username: string;
  exp: number;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function base64UrlDecode(input: string): string {
  const padded = input.replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((input.length + 3) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

export function signToken(payload: Omit<TokenPayload, 'exp'>, ttlSeconds = 60 * 60 * 12): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const fullPayload: TokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = base64UrlEncode(JSON.stringify(fullPayload));
  const data = `${header}.${body}`;
  const sig = base64UrlEncode(crypto.createHmac('sha256', getJwtSecret()).update(data).digest());
  return `${data}.${sig}`;
}

export function verifyToken(token: string): TokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const data = `${header}.${body}`;
  const expectedSig = base64UrlEncode(crypto.createHmac('sha256', getJwtSecret()).update(data).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const decoded = JSON.parse(base64UrlDecode(body)) as TokenPayload;
    if (!decoded || typeof decoded.sub !== 'number' || typeof decoded.exp !== 'number') return null;
    if (decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function createGatewaySignature(orderId: string, paymentId: string): string {
  return crypto
    .createHmac('sha256', getPaymentSecret())
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

export function verifyGatewaySignature(orderId: string, paymentId: string, signature: string): boolean {
  if (!orderId || !paymentId || !signature) return false;
  const expected = createGatewaySignature(orderId, paymentId);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function generateOneTimePassword(length = 12): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export function sanitizeHttpUrl(rawUrl: string): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function resolveSafeUploadPath(baseDir: string, storedFileName: string): string | null {
  const resolvedBase = path.resolve(baseDir);
  const cleanName = path.basename(storedFileName);
  const candidate = path.resolve(resolvedBase, cleanName);
  if (!candidate.startsWith(resolvedBase + path.sep)) return null;
  return candidate;
}
