import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { checkRateLimit, tooManyRequests } from '@/lib/rateLimit';

// Upis ide serverski preko service_role (zaobilazi RLS), status ostaje 'pending'
// (javno se prikazuje tek nakon moderacije). PRIJAVA JE OBAVEZNA (odluka
// 2026-07-31): bez sesije u kolačiću vraćamo 401 i recenzija se ne upisuje — tako
// svaka nova recenzija ima autora i spam ima cijenu. Gužva ostaje anonimna.
// `reviews.user_id` ostaje nullable zbog ranijih anonimnih recenzija.
export const runtime = 'nodejs';

const bodySchema = z.object({
  beachId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(1000).optional(),
});

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'server_not_configured' }, { status: 503 });
  }

  const rl = await checkRateLimit(request, 'reviews');
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
  const { beachId, rating, body } = parsed.data;

  // Recenzija TRAŽI prijavljenog korisnika — čitaj sesiju iz kolačića.
  const sb = await getSupabaseServer();
  const userId = sb ? (await sb.auth.getUser()).data.user?.id ?? null : null;
  if (!userId) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  }

  const { error } = await supabaseAdmin.from('reviews').insert({
    beach_id: beachId,
    rating,
    body: body && body.length > 0 ? body : null,
    user_id: userId, // status default 'pending' — čeka moderaciju.
  });

  if (error) {
    console.error('[api/reviews] insert:', error.message);
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: 'pending' }, { status: 201 });
}
