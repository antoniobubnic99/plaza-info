import { NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/adminAuth';
import { PHOTO_BUCKET, pathFromPublicUrl } from '@/lib/photoConfig';

// Moderacija fotki. Sve ide preko service_role (zaobilazi RLS), zaštićeno
// PIN-tokenom u `x-admin-token` headeru. Isti obrazac kao /api/admin/reviews.
export const runtime = 'nodejs';

function authed(request: Request): boolean {
  return verifyToken(request.headers.get('x-admin-token'));
}

// GET — fotke na čekanju (najstarije prve), s osnovnim podacima plaže.
export async function GET(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'server_not_configured' }, { status: 503 });
  }
  if (!authed(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('photos')
    .select('id, url, created_at, beach:beaches(slug, name_hr, name_en)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) {
    console.error('[api/admin/photos] list:', error.message);
    return NextResponse.json({ error: 'list_failed' }, { status: 500 });
  }
  return NextResponse.json({ photos: data ?? [] }, { status: 200 });
}

const patchSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
});

// PATCH { id, action } — odobri/odbij jednu fotku (samo iz stanja 'pending').
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
    .from('photos')
    .update({ status })
    .eq('id', id)
    .eq('status', 'pending')
    .select('url, beach:beaches(slug)')
    .maybeSingle();

  if (error) {
    console.error('[api/admin/photos] update:', error.message);
    return NextResponse.json({ error: 'update_failed' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'not_found_or_decided' }, { status: 404 });
  }

  const row = data as { url: string; beach: { slug: string } | { slug: string }[] | null };

  // Pri odbijanju izbriši bajtove iz Storagea (ostaje samo 'rejected' red kao trag).
  if (action === 'reject') {
    const path = pathFromPublicUrl(row.url);
    if (path) {
      const { error: rmErr } = await supabaseAdmin.storage.from(PHOTO_BUCKET).remove([path]);
      if (rmErr) console.error('[api/admin/photos] storage remove:', rmErr.message);
    }
  }

  // Best-effort: osvježi detalj-stranicu odmah nakon odobrenja (inače ISR 1 h).
  const beachRel = row.beach;
  const slug = (Array.isArray(beachRel) ? beachRel[0] : beachRel)?.slug;
  if (slug && action === 'approve') {
    for (const locale of ['hr', 'en']) {
      revalidatePath(`/${locale}/plaza/${slug}`);
    }
  }

  return NextResponse.json({ ok: true, status }, { status: 200 });
}
