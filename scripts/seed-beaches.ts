/**
 * PlažaInfo — seed plaža za cijelu hrvatsku obalu (Istra → Dubrovnik + otoci).
 *
 * Pokretanje (kad Supabase projekt PlazaInfo zaživi i env je postavljen):
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-beaches.ts
 *
 * Izvori:
 *   1. OpenStreetMap (Overpass API) — geometrija plaža + osnovni tagovi. Dohvat je CHUNKAN
 *      po županijama (bbox po bbox) da veliki nacionalni upit ne obori Overpass (504/timeout);
 *      svaki chunk ima retry. Rezultati se agregiraju i dedupliciraju po osm_id.
 *   2. IZOR mjerne točke — coords + zadnja službena ocjena kakvoće mora.
 *      Popuni `scripts/data/izor-points.json` prije seed-a: `npx tsx scripts/fetch-izor.ts <god>`.
 *   3. Merge po blizini → upsert u `beaches` preko RPC-a `upsert_beach` (konflikt po `slug`).
 *
 * IDEMPOTENTNOST / OČUVANJE SLUGOVA: `upsert_beach` radi `on conflict (slug)`. Da re-run NE
 * promijeni slug postojećim plažama (na koje su vezane recenzije/fotke preko beach_id), učitavamo
 * postojeći `osm_id → slug` iz baze i ZADRŽAVAMO ga; nove plaže dobiju svjež jedinstven slug.
 *
 * IZOLACIJA: piše ISKLJUČIVO u PlazaInfo Supabase projekt (preko env-a) — nikad drugdje.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Županijski chunkovi obale. bbox: [jug, zapad, sjever, istok]. Preklapanja su bezopasna
// (dedup po osm_id; regija = prvi chunk koji sadrži plažu, redom sjever → jug).
type Chunk = { name: string; region: string; bbox: [number, number, number, number] };
const COAST_CHUNKS: Chunk[] = [
  { name: 'Istra', region: 'Istarska županija', bbox: [44.65, 13.45, 45.55, 14.35] },
  { name: 'Kvarner', region: 'Primorsko-goranska županija', bbox: [44.4, 14.2, 45.45, 15.05] },
  { name: 'Lika-Senj', region: 'Ličko-senjska županija', bbox: [44.2, 14.6, 45.05, 15.5] },
  { name: 'Zadar', region: 'Zadarska županija', bbox: [43.75, 14.75, 44.5, 15.9] },
  { name: 'Šibenik', region: 'Šibensko-kninska županija', bbox: [43.35, 15.4, 44.05, 16.35] },
  { name: 'Split', region: 'Splitsko-dalmatinska županija', bbox: [42.95, 15.9, 43.75, 17.35] },
  { name: 'Dubrovnik', region: 'Dubrovačko-neretvanska županija', bbox: [42.3, 17.0, 43.25, 18.65] },
];

const IZOR_MATCH_RADIUS_M = 200;
// Overpass free tier je agresivno rate-limitan (429/504) na uzastopne velike upite.
// Zato: (a) više endpointa kao fallback, (b) dug razmak i backoff, (c) disk-cache po chunku
// (re-run preskoči već dohvaćene chunkove → nema ponovnog hameranja Overpassa).
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const OVERPASS_RETRIES = 4;
const INTER_CHUNK_DELAY_MS = 30000; // razmak NAKON stvarnog mrežnog dohvata (ne nakon cache-hita)
const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'data', 'osm-cache');

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

/** Element + regija chunka iz kojeg je prvi put viđen. */
type EnrichedElement = { el: OverpassElement; region: string };

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchOverpassNetwork(
  bbox: [number, number, number, number],
): Promise<OverpassElement[]> {
  const [s, w, n, e] = bbox;
  const query = `[out:json][timeout:180];
(
  node["natural"="beach"](${s},${w},${n},${e});
  way["natural"="beach"](${s},${w},${n},${e});
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
          'User-Agent': 'PlazaInfo-seed/1.0 (https://plaza-info; beach data seeding)',
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
          `[seed]   pokušaj ${attempt} (${endpoint}) pao: ${String(err)} — čekam ${backoff}ms`,
        );
        await sleep(backoff);
      }
    }
  }
  throw lastErr;
}

/**
 * Dohvati chunk uz disk-cache. Ako `data/osm-cache/<name>.json` postoji, čita ga (bez mreže);
 * inače dohvati s mreže i spremi. Vraća [elementi, jeLiBioMrežniDohvat].
 */
async function fetchChunkCached(
  name: string,
  bbox: [number, number, number, number],
): Promise<[OverpassElement[], boolean]> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const file = join(CACHE_DIR, `${name}.json`);
  if (existsSync(file)) {
    const cached = JSON.parse(readFileSync(file, 'utf8')) as OverpassElement[];
    console.log(`[seed] ${name}: iz cachea (${cached.length})`);
    return [cached, false];
  }
  const els = await fetchOverpassNetwork(bbox);
  writeFileSync(file, JSON.stringify(els), 'utf8');
  return [els, true];
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

const osmKey = (el: OverpassElement) => `${el.type}/${el.id}`;

/** Dohvati sve chunkove, dedupliciraj po osm_id (prvi viđeni chunk daje regiju). */
async function collectElements(): Promise<EnrichedElement[]> {
  const byOsm = new Map<string, EnrichedElement>();
  for (const chunk of COAST_CHUNKS) {
    const [els, wasNetwork] = await fetchChunkCached(chunk.name, chunk.bbox);
    let added = 0;
    for (const el of els) {
      const key = osmKey(el);
      if (byOsm.has(key)) continue;
      byOsm.set(key, { el, region: chunk.region });
      added += 1;
    }
    console.log(`[seed] ${chunk.name}: Overpass ${els.length}, novih ${added}`);
    // Pauziraj samo nakon stvarnog mrežnog dohvata (cache-hit ne treba pauzu).
    if (wasNetwork) await sleep(INTER_CHUNK_DELAY_MS);
  }
  return [...byOsm.values()];
}

/**
 * Dodijeli slug svakom elementu, čuvajući postojeće (osm_id → slug iz baze).
 * Nove plaže dobiju jedinstven slug; kolizija baznog sluga → sufiks `-<osmId>`.
 */
function assignSlugs(
  enriched: EnrichedElement[],
  existingByOsm: Map<string, string>,
  existingSlugs: Set<string>,
): Map<string, string> {
  const used = new Set(existingSlugs);
  const slugByOsm = new Map<string, string>();
  // Stabilan redoslijed (po osm_id) → reproducibilna dodjela slugova između pokretanja.
  const ordered = [...enriched].sort((a, b) => osmKey(a.el).localeCompare(osmKey(b.el)));
  for (const { el } of ordered) {
    const key = osmKey(el);
    const preserved = existingByOsm.get(key);
    if (preserved) {
      slugByOsm.set(key, preserved);
      continue;
    }
    const name = el.tags?.name?.trim();
    if (!name) continue; // bezimene preskačemo (kao i prije)
    const base = slugify(name) || `beach-${el.type}-${el.id}`;
    let slug = base;
    if (used.has(slug)) slug = `${base}-${el.id}`;
    let n = 2;
    while (used.has(slug)) slug = `${base}-${el.id}-${n++}`;
    used.add(slug);
    slugByOsm.set(key, slug);
  }
  return slugByOsm;
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Postavi NEXT_PUBLIC_SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY.');
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Postojeće plaže → očuvanje slugova.
  const { data: existing, error: exErr } = await supabase.from('beaches').select('slug, osm_id');
  if (exErr) throw new Error(`beaches (postojeće): ${exErr.message}`);
  const existingByOsm = new Map<string, string>();
  const existingSlugs = new Set<string>();
  for (const row of (existing ?? []) as { slug: string; osm_id: string | null }[]) {
    existingSlugs.add(row.slug);
    if (row.osm_id) existingByOsm.set(row.osm_id, row.slug);
  }
  console.log(`[seed] Postojećih plaža u bazi: ${existingSlugs.size}`);

  const enriched = await collectElements();
  const izorPoints = loadIzorPoints();
  console.log(
    `[seed] Ukupno jedinstvenih Overpass plaža: ${enriched.length}, IZOR točaka: ${izorPoints.length}`,
  );

  const slugByOsm = assignSlugs(enriched, existingByOsm, existingSlugs);

  let upserted = 0;
  let seaMerged = 0;
  for (const { el, region } of enriched) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    const tags = el.tags ?? {};
    const name = tags.name?.trim();
    if (lat == null || lng == null || !name) continue;

    const slug = slugByOsm.get(osmKey(el));
    if (!slug) continue;

    const izor = nearestIzor(lat, lng, izorPoints);

    const { data, error } = await supabase.rpc('upsert_beach', {
      p_slug: slug,
      p_name_hr: name,
      p_name_en: null,
      p_lat: lat,
      p_lng: lng,
      p_region: region,
      p_municipality: null,
      p_surface: mapSurface(tags),
      p_izor_point_id: izor?.izorPointId ?? null,
      p_osm_id: osmKey(el),
      p_amenities: {},
      p_flags: mapFlags(tags),
    });
    if (error) {
      console.error(`[seed] ${slug}: ${error.message}`);
      continue;
    }

    if (izor?.assessment && data) {
      const sampledAt = izor.sampledAt ?? new Date().toISOString().slice(0, 10);
      const { error: seaErr } = await supabase.from('sea_quality').upsert(
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
      if (!seaErr) seaMerged += 1;
    }
    upserted += 1;
  }

  console.log(`[seed] Gotovo. Upsertano plaža: ${upserted}. S kakvoćom mora: ${seaMerged}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
