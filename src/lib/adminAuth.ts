import { createHmac, timingSafeEqual } from 'crypto';

// SERVER ONLY — PIN-admin auth bez baze/sesija (isti obrazac kao meridijan).
// Token je stateless: `${expMs}.${HMAC_SHA256(expMs, ADMIN_PIN)}`. Bez ADMIN_PIN-a
// (tajna) nitko ne može kovati važeći token. TTL 12 h.
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function secret(): string | null {
  return process.env.ADMIN_PIN || null;
}

/** Konstantno-vremenska usporedba (izbjegava timing napade na PIN/HMAC). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function sign(exp: string, key: string): string {
  return createHmac('sha256', key).update(exp).digest('hex');
}

/** True ako uneseni PIN odgovara ADMIN_PIN-u. False ako PIN nije konfiguriran. */
export function verifyPin(pin: string): boolean {
  const s = secret();
  if (!s) return false;
  return safeEqual(pin, s);
}

/** Izdaje potpisan token s rokom trajanja. Null ako ADMIN_PIN nije konfiguriran. */
export function issueToken(): string | null {
  const key = secret();
  if (!key) return null;
  const exp = String(Date.now() + TOKEN_TTL_MS);
  return `${exp}.${sign(exp, key)}`;
}

/** Provjerava potpis i rok trajanja tokena. */
export function verifyToken(token: string | null | undefined): boolean {
  const key = secret();
  if (!key || !token) return false;
  const dot = token.indexOf('.');
  if (dot < 0) return false;
  const exp = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!safeEqual(mac, sign(exp, key))) return false;
  const expMs = Number(exp);
  return Number.isFinite(expMs) && expMs > Date.now();
}
