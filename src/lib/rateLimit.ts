import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from './supabaseAdmin';

// SERVER ONLY. Brojanje živi u bazi (migracija 0012) jer su Vercel funkcije
// serverless — in-memory brojač ne vidi zahtjeve koji su pali na drugu instancu.

/** Kvote po ruti: koliko zahtjeva po IP-u unutar koliko sekundi. */
export const RATE_LIMITS = {
  crowd: { limit: 20, windowSeconds: 600 },
  reviews: { limit: 5, windowSeconds: 600 },
  photos: { limit: 5, windowSeconds: 1800 },
  submissions: { limit: 5, windowSeconds: 3600 },
  'verify-pin': { limit: 5, windowSeconds: 600 },
} as const;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Pseudonimni identifikator klijenta. Hashira se jer sirovi IP nije potreban za
 * brojanje, a njegovo spremanje bi stvorilo evidenciju posjetitelja.
 */
function identify(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const ip = forwarded.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  return createHash('sha256').update(ip).digest('hex').slice(0, 32);
}

/**
 * Registrira jedan pogodak i kaže smije li zahtjev dalje.
 *
 * Fail-open: ako baza ne odgovori, zahtjev PROLAZI. Rate limit je zaštita od
 * zloupotrebe, a ne dio autentikacije — nedostupna baza ne smije oboriti aplikaciju.
 */
export async function checkRateLimit(
  request: Request,
  bucket: RateLimitBucket,
): Promise<RateLimitResult> {
  const { limit, windowSeconds } = RATE_LIMITS[bucket];
  const pass: RateLimitResult = { allowed: true, remaining: limit, retryAfterSeconds: 0 };

  if (!supabaseAdmin) return pass;

  const { data, error } = await supabaseAdmin.rpc('hit_rate_limit', {
    p_bucket: bucket,
    p_ident: identify(request),
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.error(`[rateLimit] RPC pao za "${bucket}":`, error.message);
    return pass;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return pass;

  const resetAt = new Date(row.reset_at).getTime();
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));

  return {
    allowed: Boolean(row.allowed),
    remaining: Number(row.remaining ?? 0),
    retryAfterSeconds,
  };
}

/** Standardni 429 odgovor. Klijent razlikuje ovo od 400/401 po statusu. */
export function tooManyRequests(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { error: 'rate_limited', retryAfter: result.retryAfterSeconds },
    { status: 429, headers: { 'Retry-After': String(result.retryAfterSeconds) } },
  );
}
