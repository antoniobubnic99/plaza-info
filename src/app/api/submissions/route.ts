import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSupabaseServer } from '@/lib/supabaseServer';

// Prijava nove plaže / parkinga. Upis ide serverski preko service_role (zaobilazi
// RLS), status ostaje 'pending' (čeka moderaciju u adminu). Za razliku od
// recenzija/fotki, prijava TRAŽI prijavljenog korisnika (zaključana odluka
// 2026-07-24): bez sesije → 401. submitted_by se veže uz njegov user_id.
export const runtime = 'nodejs';

// Koordinate grubo omeđene na širu jadransku regiju (odbija očito smeće).
const lat = z.number().min(40).max(49);
const lng = z.number().min(12).max(21);

// Poznati ključevi sadržaja/oznaka (nepoznato se odbacuje — čuva jsonb čistim).
const amenitiesSchema = z
  .object({
    showers: z.boolean().optional(),
    wc: z.boolean().optional(),
    bar: z.boolean().optional(),
    loungers: z.boolean().optional(),
    lifeguard: z.boolean().optional(),
  })
  .strip();
const flagsSchema = z
  .object({
    dogs: z.boolean().optional(),
    nudist: z.boolean().optional(),
    accessible: z.boolean().optional(),
    shade: z.boolean().optional(),
    shallow: z.boolean().optional(),
    sandy: z.boolean().optional(),
  })
  .strip();

const newBeachSchema = z.object({
  kind: z.literal('new_beach'),
  nameHr: z.string().trim().min(2).max(120),
  nameEn: z.string().trim().max(120).optional(),
  lat,
  lng,
  region: z.string().trim().max(80).optional(),
  municipality: z.string().trim().max(80).optional(),
  surface: z.string().trim().max(40).optional(),
  lengthM: z.number().int().min(1).max(50000).optional(),
  descriptionHr: z.string().trim().max(2000).optional(),
  descriptionEn: z.string().trim().max(2000).optional(),
  amenities: amenitiesSchema.optional(),
  flags: flagsSchema.optional(),
  parkingLat: lat.optional(),
  parkingLng: lng.optional(),
  website: z.string().max(200).optional(), // honeypot
});

const parkingSchema = z.object({
  kind: z.literal('parking'),
  targetBeachId: z.string().uuid(),
  parkingLat: lat,
  parkingLng: lng,
  website: z.string().max(200).optional(), // honeypot
});

const bodySchema = z.discriminatedUnion('kind', [newBeachSchema, parkingSchema]);

/** Slug iz naziva: bez dijakritike, samo [a-z0-9-]. */
function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'dj')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

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
  const input = parsed.data;

  // Honeypot: ako je popunjen, glumi uspjeh (ne otkrivaj botu da je odbijeno).
  if (input.website && input.website.trim().length > 0) {
    return NextResponse.json({ ok: true, status: 'pending' }, { status: 201 });
  }

  // Prijava TRAŽI prijavljenog korisnika — čitaj sesiju iz kolačića.
  const sb = await getSupabaseServer();
  const userId = sb ? (await sb.auth.getUser()).data.user?.id ?? null : null;
  if (!userId) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  }

  if (input.kind === 'parking') {
    // Ciljna plaža mora postojati (čista 404 unaprijed umjesto FK greške).
    const { data: beach, error: lookupErr } = await supabaseAdmin
      .from('beaches')
      .select('id')
      .eq('id', input.targetBeachId)
      .maybeSingle();
    if (lookupErr) {
      console.error('[api/submissions] beach lookup:', lookupErr.message);
      return NextResponse.json({ error: 'lookup_failed' }, { status: 500 });
    }
    if (!beach) {
      return NextResponse.json({ error: 'beach_not_found' }, { status: 404 });
    }

    const { error } = await supabaseAdmin.from('beach_submissions').insert({
      kind: 'parking',
      target_beach_id: input.targetBeachId,
      parking_lat: input.parkingLat,
      parking_lng: input.parkingLng,
      submitted_by: userId,
    });
    if (error) {
      console.error('[api/submissions] insert parking:', error.message);
      return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, status: 'pending' }, { status: 201 });
  }

  // Nova plaža.
  const { error } = await supabaseAdmin.from('beach_submissions').insert({
    kind: 'new_beach',
    slug_base: slugify(input.nameHr),
    name_hr: input.nameHr,
    name_en: input.nameEn ?? null,
    lat: input.lat,
    lng: input.lng,
    region: input.region ?? null,
    municipality: input.municipality ?? null,
    surface: input.surface ?? null,
    length_m: input.lengthM ?? null,
    description_hr: input.descriptionHr ?? null,
    description_en: input.descriptionEn ?? null,
    amenities: input.amenities ?? {},
    flags: input.flags ?? {},
    parking_lat: input.parkingLat ?? null,
    parking_lng: input.parkingLng ?? null,
    submitted_by: userId,
  });
  if (error) {
    console.error('[api/submissions] insert beach:', error.message);
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, status: 'pending' }, { status: 201 });
}
