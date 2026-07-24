import { NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/adminAuth';

// Moderacija prijava (nova plaža / parking). Sve ide preko service_role (zaobilazi
// RLS), zaštićeno PIN-tokenom u `x-admin-token`. Isti obrazac kao /api/admin/reviews.
// Approve poziva SQL `apply_beach_submission` (atomarno ubaci plažu ili ažurira parking).
export const runtime = 'nodejs';

function authed(request: Request): boolean {
  return verifyToken(request.headers.get('x-admin-token'));
}

// GET — prijave na čekanju (najstarije prve), s nazivom ciljne plaže za parking-prijave.
export async function GET(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'server_not_configured' }, { status: 503 });
  }
  if (!authed(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('beach_submissions')
    .select(
      'id, kind, name_hr, name_en, lat, lng, region, municipality, surface, length_m, ' +
        'description_hr, description_en, amenities, flags, parking_lat, parking_lng, ' +
        'created_at, beach:beaches!target_beach_id(slug, name_hr, name_en)',
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) {
    console.error('[api/admin/submissions] list:', error.message);
    return NextResponse.json({ error: 'list_failed' }, { status: 500 });
  }
  return NextResponse.json({ submissions: data ?? [] }, { status: 200 });
}

const patchSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
});

// PATCH { id, action } — odobri (ubaci/ažuriraj) ili odbij prijavu (samo iz 'pending').
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

  if (action === 'reject') {
    // Idempotentno: već odlučene se ne diraju.
    const { data, error } = await supabaseAdmin
      .from('beach_submissions')
      .update({ status: 'rejected' })
      .eq('id', id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (error) {
      console.error('[api/admin/submissions] reject:', error.message);
      return NextResponse.json({ error: 'update_failed' }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'not_found_or_decided' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, status: 'rejected' }, { status: 200 });
  }

  // Approve — atomarno u bazi (ubaci novu plažu ili ažuriraj parking + označi approved).
  const { data: beachId, error } = await supabaseAdmin.rpc('apply_beach_submission', {
    p_id: id,
  });
  if (error) {
    console.error('[api/admin/submissions] approve:', error.message);
    return NextResponse.json({ error: 'approve_failed' }, { status: 500 });
  }
  if (!beachId) {
    // RPC vratio null → prijava ne postoji ili je već odlučena.
    return NextResponse.json({ error: 'not_found_or_decided' }, { status: 404 });
  }

  // Best-effort: osvježi početnu listu (nova plaža / promjena parkinga se odmah vidi).
  for (const locale of ['hr', 'en']) {
    revalidatePath(`/${locale}`);
  }

  return NextResponse.json({ ok: true, status: 'approved' }, { status: 200 });
}
