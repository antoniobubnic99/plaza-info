/**
 * PlažaInfo — seed sadržaja plaže (tuš, WC, bar, ležaljke, spasilac) iz OpenStreetMapa.
 *
 * ZAŠTO POSTOJI: seed-beaches.ts upisuje `p_amenities: {}` za sve plaže, pa su filteri
 * sadržaja vraćali 0 rezultata. Sadržaji u OSM-u NISU tagovi na poligonu plaže nego zasebne
 * točke u blizini (amenity=toilets, amenity=shower…), pa se traže isto kao parking:
 * najbliži POI unutar radijusa → oznaka na plaži.
 *
 * Izvor: Overpass API, chunkano po istim županijskim bbox-ovima kao seed-parking.ts,
 * s retry-em, disk-cacheom (`data/amenity-cache/`) i pauzom samo nakon mrežnog dohvata.
 *
 * Pokretanje (iz .env.local):  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   npx tsx scripts/seed-amenities.ts --dry     # samo ispis, bez upisa
 *   npx tsx scripts/seed-amenities.ts           # preskače plaže koje već imaju sadržaje
 *   npx tsx scripts/seed-amenities.ts --force   # ponovno izračuna sve
 *
 * NE IZMIŠLJA PODATKE: upisuje `true` samo gdje OSM ima POI u radijusu. Gdje nema, ključ se
 * NE upisuje (ostaje nepoznato) — nikad `false`, jer izostanak POI-ja u OSM-u nije dokaz
 * da sadržaja nema. Postojeće vrijednosti (npr. korisničke) se ČUVAJU, ne gaze.
 * IZOLACIJA: piše ISKLJUČIVO u PlazaInfo Supabase projekt (preko env-a) — nikad drugdje.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/** Učitaj .env.local bez ovisnosti (dotenv nije instaliran). Postavlja samo nepostavljene ključeve. */
function loadEnvLocal(): void {
  const file = join(dirname(fileURLToPath(import.meta.url)), '..', '.env.local');
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
}

// Isti županijski chunkovi kao seed-parking.ts / seed-beaches.ts. bbox: [jug, zapad, sjever, istok].
type Chunk = { name: string; bbox: [number, number, number, number] };
const COAST_CHUNKS: Chunk[] = [
  { name: 'Istra', bbox: [44.65, 13.45, 45.55, 14.35] },
  { name: 'Kvarner', bbox: [44.4, 14.2, 45.45, 15.05] },
  { name: 'Lika-Senj', bbox: [44.2, 14.6, 45.05, 15.5] },
  { name: 'Zadar', bbox: [43.75, 14.75, 44.5, 15.9] },
  { name: 'Šibenik', bbox: [43.35, 15.4, 44.05, 16.35] },
  { name: 'Split', bbox: [42.95, 15.9, 43.75, 17.35] },
  { name: 'Dubrovnik', bbox: [42.3, 17.0, 43.25, 18.65] },
];

/** Sadržaji koje filteri nude (AMENITY_FILTERS u src/lib/beachFilters.ts). */
type AmenityKind = 'showers' | 'wc' | 'bar' | 'loungers' | 'lifeguard';

/**
 * Radijus po vrsti sadržaja. Tuš/WC/spasilac moraju biti NA plaži (uže), bar/ležaljke
 * smiju biti uz plažu (šire). Namjerno konzervativno — bolje propustiti nego lagati.
 */
const RADIUS_M: Record<AmenityKind, number> = {
  showers: 150,
  wc: 200,
  bar: 250,
  loungers: 200,
  lifeguard: 200,
};

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const OVERPASS_RETRIES = 4;
const INTER_CHUNK_DELAY_MS = 30000; // razmak NAKON stvarnog mrežnog dohvata (ne nakon cache-hita)
const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'data', 'amenity-cache');

type OverpassElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type AmenityPoint = { lat: number; lng: number; kind: AmenityKind };

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** OSM tagovi → naša vrsta sadržaja. Vraća null za sve što nas ne zanima. */
function classify(tags: Record<string, string> | undefined): AmenityKind | null {
  if (!tags) return null;
  const amenity = tags.amenity;
  if (amenity === 'shower') return 'showers';
  if (amenity === 'toilets') return 'wc';
  if (amenity === 'bar' || amenity === 'cafe' || amenity === 'restaurant') return 'bar';
  if (amenity === 'lifeguard') return 'lifeguard';
  if (tags.emergency === 'lifeguard_tower' || tags.emergency === 'lifeguard_base') {
    return 'lifeguard';
  }
  if (tags.leisure === 'beach_resort' || tags.leisure === 'sunbeds') return 'loungers';
  return null;
}

async function fetchOverpassNetwork(
  bbox: [number, number, number, number],
): Promise<OverpassElement[]> {
  const [s, w, n, e] = bbox;
  const box = `${s},${w},${n},${e}`;
  // Jedan upit po chunku za sve vrste sadržaja — manje pogodaka u rate-limit nego 5 upita.
  const query = `[out:json][timeout:180];
(
  node["amenity"~"^(shower|toilets|bar|cafe|restaurant|lifeguard)$"](${box});
  way["amenity"~"^(shower|toilets|bar|cafe|restaurant|lifeguard)$"](${box});
  node["emergency"~"^(lifeguard_tower|lifeguard_base)$"](${box});
  way["leisure"~"^(beach_resort|sunbeds)$"](${box});
  node["leisure"~"^(beach_resort|sunbeds)$"](${box});
);
out center tags;`;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= OVERPASS_RETRIES; attempt++) {
    const endpoint = OVERPASS_ENDPOINTS[(attempt - 1) % OVERPASS_ENDPOINTS.length];
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': 'PlazaInfo-seed/1.0 (https://plaza-info; beach amenity seeding)',
        },
        body: 'data=' + encodeURIComponent(query),
      });
      if (!res.ok) throw new Error(`Overpass ${res.status} ${res.statusText}`);
      const json = (await res.json()) as { elements: OverpassElement[] };
      return json.elements ?? [];
    } catch (err) {
      lastErr = err;
      if (attempt < OVERPASS_RETRIES) {
        const backoff = attempt * 20000; // 20s, 40s, 60s
        console.warn(
          `[amenity]   pokušaj ${attempt} (${endpoint}) pao: ${String(err)} — čekam ${backoff}ms`,
        );
        await sleep(backoff);
      }
    }
  }
  throw lastErr;
}

/** Overpass element → točka sadržaja (node lat/lon, way center). Bez koordinata/vrste se preskače. */
function toAmenityPoints(els: OverpassElement[]): AmenityPoint[] {
  const points: AmenityPoint[] = [];
  for (const el of els) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null) continue;
    const kind = classify(el.tags);
    if (!kind) continue;
    points.push({ lat, lng, kind });
  }
  return points;
}

/** Dohvati chunk uz disk-cache. Vraća [točke, jeLiBioMrežniDohvat]. */
async function fetchChunkCached(
  name: string,
  bbox: [number, number, number, number],
): Promise<[AmenityPoint[], boolean]> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const file = join(CACHE_DIR, `${name}.json`);
  if (existsSync(file)) {
    const cached = JSON.parse(readFileSync(file, 'utf8')) as AmenityPoint[];
    console.log(`[amenity] ${name}: iz cachea (${cached.length})`);
    return [cached, false];
  }
  const els = await fetchOverpassNetwork(bbox);
  const points = toAmenityPoints(els);
  writeFileSync(file, JSON.stringify(points), 'utf8');
  return [points, true];
}

async function collectAmenities(): Promise<AmenityPoint[]> {
  const all: AmenityPoint[] = [];
  for (const chunk of COAST_CHUNKS) {
    const [points, wasNetwork] = await fetchChunkCached(chunk.name, chunk.bbox);
    all.push(...points);
    console.log(`[amenity] ${chunk.name}: točaka ${points.length} (ukupno ${all.length})`);
    if (wasNetwork) await sleep(INTER_CHUNK_DELAY_MS);
  }
  return all;
}

type BeachAmenities = Record<string, unknown>;
type BeachRow = {
  id: string;
  lat: number;
  lng: number;
  name_hr: string;
  amenities: BeachAmenities | null;
};

/** Koje vrste sadržaja imaju POI unutar svog radijusa od plaže. */
function amenitiesNear(lat: number, lng: number, points: AmenityPoint[]): Set<AmenityKind> {
  const found = new Set<AmenityKind>();
  for (const p of points) {
    if (found.has(p.kind)) continue; // dovoljan je jedan POI po vrsti
    if (haversineM(lat, lng, p.lat, p.lng) <= RADIUS_M[p.kind]) found.add(p.kind);
  }
  return found;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const dry = process.argv.includes('--dry');
  const force = process.argv.includes('--force');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Nedostaje NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  const points = await collectAmenities();
  const byKind = points.reduce<Record<string, number>>((acc, p) => {
    acc[p.kind] = (acc[p.kind] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`[amenity] ukupno POI točaka: ${points.length}`, byKind);

  // Čitanje ide iz `beaches_geo` (view raspakirava PostGIS geografiju u lat/lng —
  // bazna tablica `beaches` te kolone nema), a upis u baznu tablicu `beaches`.
  const { data: beaches, error } = await db
    .from('beaches_geo')
    .select('id,lat,lng,name_hr,amenities')
    .order('name_hr');
  if (error) throw new Error(`Dohvat plaža: ${error.message}`);
  const rows = (beaches ?? []) as BeachRow[];

  let updated = 0;
  let skipped = 0;
  let empty = 0;
  const totals: Record<string, number> = {};

  for (const b of rows) {
    const existing = (b.amenities ?? {}) as BeachAmenities;
    if (Object.keys(existing).length > 0 && !force) {
      skipped++;
      continue;
    }
    const found = amenitiesNear(b.lat, b.lng, points);
    if (found.size === 0) {
      empty++;
      continue;
    }
    // Merge: postojeće vrijednosti (npr. korisničke) ostaju, dodajemo samo nađeno.
    const merged: BeachAmenities = { ...existing };
    for (const kind of found) {
      merged[kind] = true;
      totals[kind] = (totals[kind] ?? 0) + 1;
    }
    if (dry) {
      console.log(`[amenity] (dry) ${b.name_hr} ← ${[...found].join(', ')}`);
      updated++;
      continue;
    }
    const { error: updErr } = await db.from('beaches').update({ amenities: merged }).eq('id', b.id);
    if (updErr) {
      console.error(`[amenity] ${b.name_hr}: upis pao — ${updErr.message}`);
      continue;
    }
    updated++;
    if (updated % 50 === 0) console.log(`[amenity] …upisano ${updated}`);
  }

  console.log(
    `[amenity] Gotovo${dry ? ' (dry-run, ništa nije upisano)' : ''}. ` +
      `Ažurirano: ${updated}, bez ijednog sadržaja: ${empty}, preskočeno (već imaju): ${skipped}.`,
  );
  console.log('[amenity] po vrsti:', totals);
}

main().catch((err) => {
  console.error('[amenity] PAO:', err);
  process.exit(1);
});
