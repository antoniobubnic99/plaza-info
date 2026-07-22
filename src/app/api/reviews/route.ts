import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSupabaseServer } from '@/lib/supabaseServer';

// Upis ide serverski preko service_role (zaobilazi RLS), status ostaje 'pending'
// (javno se prikazuje tek nakon moderacije). ADITIVNI AUTH: ako je korisnik
// prijavljen (Google, sesija u kolačiću), unos se veže uz njegov user_id;
// anonimni unos (user_id = null) i dalje radi kad korisnik nije prijavljen.
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

  // Aditivna atribucija: pročitaj prijavljenog korisnika iz kolačić-sesije (ako ga ima).
  let userId: string | null = null;
  const sb = await getSupabaseServer();
  if (sb) {
    const { data } = await sb.auth.getUser();
    userId = data.user?.id ?? null;
  }

  const { error } = await supabaseAdmin.from('reviews').insert({
    beach_id: beachId,
    rating,
    body: body && body.length > 0 ? body : null,
    user_id: userId, // null ako anonimno; status default 'pending' — čeka moderaciju.
  });

  if (error) {
    console.error('[api/reviews] insert:', error.message);
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: 'pending' }, { status: 201 });
}
