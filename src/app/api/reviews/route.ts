import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Recenzije se unose anonimno (PlažaInfo još nema auth). RLS na `reviews` traži
// auth.uid() = user_id, pa upis ide serverski preko service_role (zaobilazi RLS).
// Status ostaje 'pending' — javno se prikazuju tek nakon moderacije (odobrenja).
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

  const { error } = await supabaseAdmin.from('reviews').insert({
    beach_id: beachId,
    rating,
    body: body && body.length > 0 ? body : null,
    // user_id ostaje null (anonimno), status default 'pending' — čeka moderaciju.
  });

  if (error) {
    console.error('[api/reviews] insert:', error.message);
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: 'pending' }, { status: 201 });
}
