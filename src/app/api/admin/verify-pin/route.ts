import { NextResponse } from 'next/server';
import { z } from 'zod';
import { issueToken, verifyPin } from '@/lib/adminAuth';
import { checkRateLimit, tooManyRequests } from '@/lib/rateLimit';

// POST { pin } -> { token } | 401. Token ide u `x-admin-token` header za admin API.
export const runtime = 'nodejs';

const bodySchema = z.object({ pin: z.string().min(1).max(64) });

export async function POST(request: Request) {
  if (!process.env.ADMIN_PIN) {
    return NextResponse.json({ error: 'server_not_configured' }, { status: 503 });
  }

  // 4-znamenkasti PIN ima mali prostor pretrage; timing-safe usporedba štiti od
  // side-channela, ali NE od brute-forcea. Kvota je ta zaštita.
  const rl = await checkRateLimit(request, 'verify-pin');
  if (!rl.allowed) return tooManyRequests(rl);

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (!verifyPin(parsed.data.pin)) {
    return NextResponse.json({ error: 'invalid_pin' }, { status: 401 });
  }

  const token = issueToken();
  if (!token) {
    return NextResponse.json({ error: 'server_not_configured' }, { status: 503 });
  }
  return NextResponse.json({ token }, { status: 200 });
}
