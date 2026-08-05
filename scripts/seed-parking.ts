/**
 * PlažaInfo — seed najbližeg parkinga po plaži (ROADMAP v2, Faza 5).
 *
 * Za svaku plažu iz `beaches_geo` nađe najbliži OSM parking (amenity=parking) i upiše
 * u `beaches` parking_lat / parking_lng / parking_distance_m (zračna udaljenost, cap ~1500 m).
 *
 * Izvor: OpenStreetMap (Overpass API). Dohvat je CHUNKAN po istim županijskim bbox-ovima
 * kao seed-beaches.ts (da veliki nacionalni upit ne obori Overpass), s retry-em, disk-cacheom
 * i pauzom samo nakon stvarnog mrežnog dohvata. Query: node/way["amenity"="parking"](bbox).
 *
 * Pokretanje (iz .env.local):  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   npx tsx scripts/seed-parking.ts            # preskače plaže koje već imaju parking_distance_m
 *   npx tsx scripts/seed-parking.ts --force    # ponovno izračuna sve
 *
 * IDEMPOTENTNOST: bez --force preskaču se plaže koje već imaju parking_distance_m.
 * IZOLACIJA: piše ISKLJUČIVO u PlazaInfo Supabase projekt (preko env-a) — nikad drugdje.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Učitaj .env.local bez ovisnosti (dotenv nije instaliran) i bez shell sourcinga.
 * Postavlja samo nepostavljene ključeve.
 */
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

// Isti županijski chunkovi kao seed-beaches.ts. bbox: [jug, zapad, sjever, istok].
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

// Najveća zračna udaljenost plaža → parking koja se još smatra „parkingom za plažu".
const MAX_PARKING_DISTANCE_M = 1500;

// Overpass free tier je agresivno rate-limitan — fallback endpointi, backoff, disk-cache po chunku.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const OVERPASS_RETRIES = 4;
const INTER_CHUNK_DELAY_MS = 30000; // razmak NAKON stvarnog mrežnog dohvata (ne nakon cache-hita)
const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'data', 'parking-cache');

type OverpassElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type ParkingPoint = { lat: number; lng: number };

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

async function fetchOverpassNetwork(
  bbox: [number, number, number, number],
): Promise<OverpassElement[]> {
  const [s, w, n, e] = bbox;
  const query = `[out:json][timeout:180];
(
  node["amenity"="parking"](${s},${w},${n},${e});
  way["amenity"="parking"](${s},${w},${n},${e});
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
          'User-Agent': 'PlazaInfo-seed/1.0 (https://plaza-info; parking data seeding)',
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
          `[parking]   pokušaj ${attempt} (${endpoint}) pao: ${String(err)} — čekam ${backoff}ms`,
        );
        await sleep(backoff);
      }
    }
  }
  throw lastErr;
}

/** Overpass element → parking točka (node lat/lon, way center). Bez koordinata se preskače. */
function toParkingPoints(els: OverpassElement[]): ParkingPoint[] {
  const points: ParkingPoint[] = [];
  for (const el of els) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null) continue;
    points.push({ lat, lng });
  }
  return points;
}

/**
 * Dohvati chunk uz disk-cache. Ako `data/parking-cache/<name>.json` postoji, čita ga (bez mreže);
 * inače dohvati s mreže i spremi. Vraća [parking točke, jeLiBioMrežniDohvat].
 */
async function fetchChunkCached(
  name: string,
  bbox: [number, number, number, number],
): Promise<[ParkingPoint[], boolean]> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const file = join(CACHE_DIR, `${name}.json`);
  if (existsSync(file)) {
    const cached = JSON.parse(readFileSync(file, 'utf8')) as ParkingPoint[];
    console.log(`[parking] ${name}: iz cachea (${cached.length})`);
    return [cached, false];
  }
  const els = await fetchOverpassNetwork(bbox);
  const points = toParkingPoints(els);
  writeFileSync(file, JSON.stringify(points), 'utf8');
  return [points, true];
}

/**
 * Ukloni duplikate iz preklapajućih županijskih bboxeva.
 *
 * ZAŠTO: susjedni chunkovi se namjerno preklapaju da nijedna plaža ne ispadne (npr.
 * Šibenik i Split oba pokrivaju Raduču), pa isti OSM parking uđe u zbroj dva-tri puta.
 * Cache čuva samo {lat,lng} (bez OSM id-a), pa je koordinata zaokružena na 5 decimala
 * (~1 m) jedini raspoloživi identitet. Ishod seedanja je isti — najbliži parking ostaje
 * najbliži — ali brojke u logu prestaju lagati, a pretraga radi nad manjim skupom.
 */
function dedupePoints(points: ParkingPoint[]): ParkingPoint[] {
  const seen = new Set<string>();
  return points.filter((p) => {
    const key = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Dohvati sve chunkove i agregiraj parking točke cijele obale (bez duplikata). */
async function collectParking(): Promise<ParkingPoint[]> {
  const all: ParkingPoint[] = [];
  for (const chunk of COAST_CHUNKS) {
    const [points, wasNetwork] = await fetchChunkCached(chunk.name, chunk.bbox);
    all.push(...points);
    console.log(`[parking] ${chunk.name}: parkinga ${points.length} (ukupno ${all.length})`);
    if (wasNetwork) await sleep(INTER_CHUNK_DELAY_MS);
  }
  const unique = dedupePoints(all);
  console.log(`[parking] Nakon deduplikacije: ${unique.length} (od ${all.length}).`);
  return unique;
}

type BeachRow = {
  id: string;
  lat: number;
  lng: number;
  name_hr: string;
  parking_distance_m: number | null;
};

/** Najbliži parking plaži (brute-force haversine) ili null iznad cap-a. */
function nearestParking(
  lat: number,
  lng: number,
  parkings: ParkingPoint[],
): { point: ParkingPoint; distanceM: number } | null {
  let best: ParkingPoint | null = null;
  let bestD = Infinity;
  for (const p of parkings) {
    const d = haversineM(lat, lng, p.lat, p.lng);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best && bestD <= MAX_PARKING_DISTANCE_M
    ? { point: best, distanceM: Math.round(bestD) }
    : null;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Postavi NEXT_PUBLIC_SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY.');
  }
  const force = process.argv.slice(2).includes('--force');
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: beaches, error } = await supabase
    .from('beaches_geo')
    .select('id, lat, lng, name_hr, parking_distance_m')
    .order('name_hr', { ascending: true });
  if (error) throw new Error(`beaches_geo: ${error.message}`);

  let todo = (beaches ?? []) as BeachRow[];
  if (!force) todo = todo.filter((b) => b.parking_distance_m == null);

  console.log(
    `[parking] Plaža ukupno: ${(beaches ?? []).length}, za obradu: ${todo.length}` +
      `${force ? ' (--force)' : ''}.`,
  );
  if (todo.length === 0) {
    console.log('[parking] Nema plaža za obradu — gotovo.');
    return;
  }

  const parkings = await collectParking();
  console.log(`[parking] Ukupno parking točaka: ${parkings.length}.`);
  if (parkings.length === 0) {
    throw new Error('Nijedan parking nije dohvaćen — provjeri Overpass / cache.');
  }

  let matched = 0;
  let none = 0;
  for (const b of todo) {
    const near = nearestParking(b.lat, b.lng, parkings);
    if (!near) {
      none += 1;
      continue;
    }
    const { error: upErr } = await supabase
      .from('beaches')
      .update({
        parking_lat: near.point.lat,
        parking_lng: near.point.lng,
        parking_distance_m: near.distanceM,
      })
      .eq('id', b.id);
    if (upErr) {
      console.error(`[parking] ${b.name_hr}: update: ${upErr.message}`);
      continue;
    }
    matched += 1;
  }

  console.log(
    `[parking] Gotovo. S parkingom: ${matched}, bez (iznad ${MAX_PARKING_DISTANCE_M} m): ${none}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
