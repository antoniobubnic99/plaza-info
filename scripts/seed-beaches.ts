/**
 * PlažaInfo — seed plaža za pilot regiju (Faza 1).
 *
 * Pokretanje (kad Supabase projekt PlazaInfo zaživi i env je postavljen):
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-beaches.ts
 *
 * Izvori:
 *   1. OpenStreetMap (Overpass API) — geometrija plaža + osnovni tagovi.
 *   2. IZOR mjerne točke — coords + zadnja službena ocjena kakvoće mora.
 *      Popuni `scripts/data/izor-points.json` (niz objekata:
 *      { izorPointId, lat, lng, assessment }) iz IZOR izvora.
 *   3. Merge po blizini → upsert u `beaches` preko RPC-a `upsert_beach`.
 *
 * IZOLACIJA: piše ISKLJUČIVO u PlazaInfo Supabase projekt (preko env-a) — nikad drugdje.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Pilot regija: Srednja Dalmacija (Split i okolica). bbox: [jug, zapad, sjever, istok].
const PILOT_BBOX: [number, number, number, number] = [43.35, 16.2, 43.62, 16.75];
const IZOR_MATCH_RADIUS_M = 200;

type OverpassElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type IzorPoint = {
  izorPointId: string;
  lat: number;
  lng: number;
  assessment?: 'excellent' | 'good' | 'satisfactory' | 'unsatisfactory';
  sampledAt?: string; // YYYY-MM-DD (stvarni datum IZOR uzorkovanja); popuni scripts/fetch-izor.ts
};

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function mapSurface(tags: Record<string, string>): 'sand' | 'pebble' | 'rock' | 'concrete' | null {
  const s = tags.surface;
  if (!s) return null;
  if (/sand/.test(s)) return 'sand';
  if (/pebble|gravel/.test(s)) return 'pebble';
  if (/rock|stone/.test(s)) return 'rock';
  if (/concrete|paving/.test(s)) return 'concrete';
  return null;
}

function mapFlags(tags: Record<string, string>): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  if (tags.dog === 'yes') flags.dogs = true;
  if (tags.naturism === 'yes' || tags.nudism === 'yes') flags.nudist = true;
  if (tags.wheelchair === 'yes') flags.accessible = true;
  return flags;
}

async function fetchOverpassBeaches(
  bbox: [number, number, number, number],
): Promise<OverpassElement[]> {
  const [s, w, n, e] = bbox;
  const query = `[out:json][timeout:60];
(
  node["natural"="beach"](${s},${w},${n},${e});
  way["natural"="beach"](${s},${w},${n},${e});
);
out center tags;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': 'PlazaInfo-seed/1.0 (https://plaza-info; beach data seeding)',
    },
    body: 'data=' + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status} ${res.statusText}`);
  const json = (await res.json()) as { elements: OverpassElement[] };
  return json.elements ?? [];
}

function loadIzorPoints(): IzorPoint[] {
  const dir = dirname(fileURLToPath(import.meta.url));
  const file = join(dir, 'data', 'izor-points.json');
  if (!existsSync(file)) {
    console.warn('[seed] scripts/data/izor-points.json ne postoji — preskačem IZOR merge.');
    return [];
  }
  return JSON.parse(readFileSync(file, 'utf8')) as IzorPoint[];
}

function nearestIzor(lat: number, lng: number, points: IzorPoint[]): IzorPoint | null {
  let best: IzorPoint | null = null;
  let bestD = Infinity;
  for (const p of points) {
    const d = haversineM(lat, lng, p.lat, p.lng);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best && bestD <= IZOR_MATCH_RADIUS_M ? best : null;
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Postavi NEXT_PUBLIC_SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY.');
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const elements = await fetchOverpassBeaches(PILOT_BBOX);
  const izorPoints = loadIzorPoints();
  console.log(`[seed] Overpass plaža: ${elements.length}, IZOR točaka: ${izorPoints.length}`);

  const seenSlugs = new Set<string>();
  let upserted = 0;

  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    const tags = el.tags ?? {};
    const name = tags.name?.trim();
    if (lat == null || lng == null || !name) continue;

    let slug = slugify(name) || `beach-${el.type}-${el.id}`;
    if (seenSlugs.has(slug)) slug = `${slug}-${el.id}`;
    seenSlugs.add(slug);

    const izor = nearestIzor(lat, lng, izorPoints);

    const { data, error } = await supabase.rpc('upsert_beach', {
      p_slug: slug,
      p_name_hr: name,
      p_name_en: null,
      p_lat: lat,
      p_lng: lng,
      p_region: 'Srednja Dalmacija',
      p_municipality: null,
      p_surface: mapSurface(tags),
      p_izor_point_id: izor?.izorPointId ?? null,
      p_osm_id: `${el.type}/${el.id}`,
      p_amenities: {},
      p_flags: mapFlags(tags),
    });
    if (error) {
      console.error(`[seed] ${slug}: ${error.message}`);
      continue;
    }

    if (izor?.assessment && data) {
      const sampledAt = izor.sampledAt ?? new Date().toISOString().slice(0, 10);
      await supabase.from('sea_quality').upsert(
        {
          beach_id: data as string,
          izor_point_id: izor.izorPointId,
          assessment: izor.assessment,
          sampled_at: sampledAt,
          season_year: Number(sampledAt.slice(0, 4)),
          source: 'izor',
        },
        { onConflict: 'beach_id,sampled_at' },
      );
    }
    upserted += 1;
  }

  console.log(`[seed] Gotovo. Upsertano plaža: ${upserted}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
