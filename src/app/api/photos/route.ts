import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { checkRateLimit, tooManyRequests } from '@/lib/rateLimit';
import {
  PHOTO_BUCKET,
  MAX_PHOTO_BYTES,
  ALLOWED_PHOTO_TYPES,
  isAllowedPhotoType,
} from '@/lib/photoConfig';

// Upload ide serverski preko service_role (zaobilazi RLS): bajtovi u javni Storage
// bucket, red u tablicu sa status='pending' (čeka moderaciju). PRIJAVA JE OBAVEZNA
// (odluka 2026-07-31): bez sesije u kolačiću vraćamo 401 PRIJE nego što išta ode u
// Storage — inače bi neprijavljeni posjetitelj trošio prostor uploadom koji ionako
// propada. Gužva ostaje anonimna.
export const runtime = 'nodejs';

const beachIdSchema = z.string().uuid();
// Vrsta fotke (0010). Nepoznata/izostavljena vrijednost pada na 'beach' — stariji
// klijenti koji ne šalju polje i dalje rade, a galerija plaže ostaje netaknuta.
const kindSchema = z.enum(['beach', 'parking']).catch('beach');

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'server_not_configured' }, { status: 503 });
  }

  // Kvota ide prije sesije i prije bajtova — odbijen pokušaj ne smije ništa uploadati.
  const rl = await checkRateLimit(request, 'photos');
  if (!rl.allowed) return tooManyRequests(rl);

  // Fotka TRAŽI prijavljenog korisnika — sesija iz kolačića, prije čitanja bajtova.
  const sb = await getSupabaseServer();
  const userId = sb ? (await sb.auth.getUser()).data.user?.id ?? null : null;
  if (!userId) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'invalid_form' }, { status: 400 });
  }

  const parsedBeach = beachIdSchema.safeParse(form.get('beachId'));
  if (!parsedBeach.success) {
    return NextResponse.json({ error: 'invalid_beach_id' }, { status: 400 });
  }
  const beachId = parsedBeach.data;
  const kind = kindSchema.parse(form.get('kind') ?? 'beach');

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'missing_file' }, { status: 400 });
  }
  if (!isAllowedPhotoType(file.type)) {
    return NextResponse.json({ error: 'unsupported_type' }, { status: 415 });
  }
  if (file.size === 0 || file.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: 'file_too_large' }, { status: 413 });
  }

  // Beach mora postojati (FK bi ionako pao, ali javljamo čistu 404 unaprijed).
  const { data: beach, error: beachErr } = await supabaseAdmin
    .from('beaches')
    .select('id')
    .eq('id', beachId)
    .maybeSingle();
  if (beachErr) {
    console.error('[api/photos] beach lookup:', beachErr.message);
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 });
  }
  if (!beach) {
    return NextResponse.json({ error: 'beach_not_found' }, { status: 404 });
  }

  const ext = ALLOWED_PHOTO_TYPES[file.type];
  const path = `${beachId}/${randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(PHOTO_BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (uploadErr) {
    console.error('[api/photos] upload:', uploadErr.message);
    return NextResponse.json({ error: 'upload_failed' }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from(PHOTO_BUCKET).getPublicUrl(path);

  const { error: insertErr } = await supabaseAdmin.from('photos').insert({
    beach_id: beachId,
    url: publicUrl,
    kind, // 'beach' (galerija) ili 'parking' (panel parkinga)
    user_id: userId, // is_official false, status default 'pending'.
  });
  if (insertErr) {
    // Počisti osiroćeni objekt da Storage ne nakuplja neuvezane bajtove.
    await supabaseAdmin.storage.from(PHOTO_BUCKET).remove([path]);
    console.error('[api/photos] insert:', insertErr.message);
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: 'pending' }, { status: 201 });
}
