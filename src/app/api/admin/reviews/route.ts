import { NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/adminAuth';

// Moderacija recenzija. Sve ide preko service_role (zaobilazi RLS), zaštićeno
// PIN-tokenom u `x-admin-token` headeru.
export const runtime = 'nodejs';

function authed(request: Request): boolean {
  return verifyToken(request.headers.get('x-admin-token'));
}

// GET — recenzije na čekanju (najstarije prve), s osnovnim podacima plaže.
export async function GET(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'server_not_configured' }, { status: 503 });
  }
  if (!authed(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('reviews')
    .select('id, rating, body, created_at, beach:beaches(slug, name_hr, name_en)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) {
    console.error('[api/admin/reviews] list:', error.message);
    return NextResponse.json({ error: 'list_failed' }, { status: 500 });
  }
  return NextResponse.json({ reviews: data ?? [] }, { status: 200 });
}

const patchSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
});

// PATCH { id, action } — odobri/odbij jednu recenziju (samo iz stanja 'pending').
export async function PATCH(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'server_not_configured' }, { status: 503 });
  }
  if (!authed(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const { id, action } = parsed.data;
  const status = action === 'approve' ? 'approved' : 'rejected';

  // `eq('status','pending')` čini operaciju idempotentnom: već odlučene se ne diraju.
  const { data, error } = await supabaseAdmin
    .from('reviews')
    .update({ status })
    .eq('id', id)
    .eq('status', 'pending')
    .select('beach:beaches(slug)')
    .maybeSingle();

  if (error) {
    console.error('[api/admin/reviews] update:', error.message);
    return NextResponse.json({ error: 'update_failed' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'not_found_or_decided' }, { status: 404 });
  }

  // Best-effort: osvježi detalj-stranicu odmah nakon odobrenja (inače ISR 1 h).
  // PostgREST vraća objekt (many-to-one), ali supabase-js ga tipizira kao niz — pokrij oba.
  const beachRel = (data as { beach: { slug: string } | { slug: string }[] | null }).beach;
  const slug = (Array.isArray(beachRel) ? beachRel[0] : beachRel)?.slug;
  if (slug && action === 'approve') {
    for (const locale of ['hr', 'en']) {
      revalidatePath(`/${locale}/plaza/${slug}`);
    }
  }

  return NextResponse.json({ ok: true, status }, { status: 200 });
}
