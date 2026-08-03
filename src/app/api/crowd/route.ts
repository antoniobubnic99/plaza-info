import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { checkRateLimit, tooManyRequests } from '@/lib/rateLimit';

// Prijava gužve MORA ići serverski: crowd_reports nema anon/authenticated grant,
// pa upis ide preko service_role (supabaseAdmin zaobilazi RLS).
export const runtime = 'nodejs';

const bodySchema = z.object({
  beachId: z.string().uuid(),
  level: z.enum(['empty', 'moderate', 'packed']),
  deviceHash: z.string().min(8).max(128).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'server_not_configured' }, { status: 503 });
  }

  // Anoniman endpoint koji piše u bazu — kvota ide PRIJE parsiranja tijela.
  const rl = await checkRateLimit(request, 'crowd');
  if (!rl.allowed) return tooManyRequests(rl);

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { beachId, level, deviceHash, lat, lng } = parsed.data;

  const { error } = await supabaseAdmin.from('crowd_reports').insert({
    beach_id: beachId,
    level,
    device_hash: deviceHash ?? null,
    report_lat: lat ?? null,
    report_lng: lng ?? null,
  });

  if (error) {
    console.error('[api/crowd] insert:', error.message);
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
