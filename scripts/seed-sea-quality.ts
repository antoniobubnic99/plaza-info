/**
 * PlažaInfo — merge IZOR kakvoće mora u tablicu `sea_quality`.
 *
 * Odvojeno od `seed-beaches.ts` (koji ovisi o OSM Overpassu i zna biti nedostupan):
 * ovaj skript čita VEĆ postojeće plaže iz baze i spaja ih s IZOR točkama po blizini (≤200 m).
 * Idempotentno (upsert po beach_id+sampled_at) → pokreni kad god osvježiš `izor-points.json`.
 *
 * Redoslijed:  npx tsx scripts/fetch-izor.ts 2026   →   npx tsx scripts/seed-sea-quality.ts
 * Env (iz .env.local):  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * IZOLACIJA: piše ISKLJUČIVO u PlazaInfo Supabase projekt (preko env-a).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const IZOR_MATCH_RADIUS_M = 200;

type IzorPoint = {
  izorPointId: string;
  lat: number;
  lng: number;
  assessment: 'excellent' | 'good' | 'satisfactory' | 'unsatisfactory';
  sampledAt?: string;
};

type BeachGeo = { id: string; lat: number; lng: number };

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function loadIzorPoints(): IzorPoint[] {
  const file = join(dirname(fileURLToPath(import.meta.url)), 'data', 'izor-points.json');
  if (!existsSync(file)) {
    throw new Error('scripts/data/izor-points.json ne postoji — pokreni prvo: npx tsx scripts/fetch-izor.ts');
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
  if (!url || !key) throw new Error('Postavi NEXT_PUBLIC_SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY.');
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const izorPoints = loadIzorPoints();
  const { data: beaches, error } = await supabase
    .from('beaches_geo')
    .select('id, lat, lng');
  if (error) throw new Error(`beaches_geo: ${error.message}`);

  console.log(`[sea] Plaža: ${(beaches ?? []).length}, IZOR točaka: ${izorPoints.length}`);

  const today = new Date().toISOString().slice(0, 10);
  let matched = 0;
  for (const b of (beaches ?? []) as BeachGeo[]) {
    const izor = nearestIzor(b.lat, b.lng, izorPoints);
    if (!izor) continue;
    const sampledAt = izor.sampledAt ?? today;
    const { error: upErr } = await supabase.from('sea_quality').upsert(
      {
        beach_id: b.id,
        izor_point_id: izor.izorPointId,
        assessment: izor.assessment,
        sampled_at: sampledAt,
        season_year: Number(sampledAt.slice(0, 4)),
        source: 'izor',
      },
      { onConflict: 'beach_id,sampled_at' },
    );
    if (upErr) {
      console.error(`[sea] ${b.id}: ${upErr.message}`);
      continue;
    }
    matched += 1;
  }

  console.log(`[sea] Gotovo. Plaža s kakvoćom mora: ${matched}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
