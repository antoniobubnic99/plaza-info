/**
 * PlažaInfo — backfill naplate parkinga iz OpenStreetMapa (stavka 5).
 *
 * Za svaku plažu koja već ima parking (`parking_lat/lng` iz seed-parking.ts) traži
 * OSM parking s tagom `fee` na istoj točki i upisuje `parking_fee_status`
 * ('free' | 'paid') te — ako OSM ima `charge` — `parking_price_text`.
 *
 * ZAŠTO ZASEBAN DOHVAT: `scripts/data/parking-cache/*.json` čuva SAMO {lat,lng}
 * (seed-parking.ts odbacuje tagove), pa se naplata iz njega ne može pročitati.
 * Ovaj upit je uži od seedova — traži samo parkinge KOJI IMAJU `fee` tag.
 *
 * BEZ IZMIŠLJANJA: mapira se isključivo `fee=no` → free i `fee=yes` → paid.
 * Sve ostalo (`customers`, `interval`, bez taga) ostaje 'unknown' dok korisnik
 * ne prijavi stvarno stanje kroz formu.
 *
 * Pokretanje (iz .env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   npx tsx scripts/backfill-parking-fee.ts --dry    # samo ispiši što bi upisao
 *   npx tsx scripts/backfill-parking-fee.ts          # upiši (samo 'unknown' plaže)
 *   npx tsx scripts/backfill-parking-fee.ts --force  # ponovno prođi i one koje već imaju status
 *
 * IDEMPOTENTNOST: bez --force dira samo plaže sa statusom 'unknown'.
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

// Isti županijski chunkovi kao seed-parking.ts. bbox: [jug, zapad, sjever, istok].
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

// Koliko smije odstupati OSM točka od one spremljene u bazi da se smatra ISTIM parkingom.
// Obje dolaze iz istog OSM-a; tolerancija pokriva pomak težišta way-a između dohvata.
const MATCH_TOLERANCE_M = 30;

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const OVERPASS_RETRIES = 4;
const INTER_CHUNK_DELAY_MS = 30000; // pauza SAMO nakon stvarnog mrežnog dohvata
const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'data', 'parking-fee-cache');

type OverpassElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

/** Parking s poznatom naplatom (`fee` tag) + neobavezni OSM `charge` (iznos). */
type FeePoint = { lat: number; lng: number; fee: string; charge?: string };

type FeeStatus = 'free' | 'paid';

/** OSM `fee` → naš status. Sve osim jasnog da/ne ostaje nepoznato (null). */
function toFeeStatus(fee: string): FeeStatus | null {
  const v = fee.trim().toLowerCase();
  if (v === 'no' || v === 'false') return 'free';
  if (v === 'yes' || v === 'true') return 'paid';
  return null;
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchOverpassNetwork(
  bbox: [number, number, number, number],
): Promise<OverpassElement[]> {
  const [s, w, n, e] = bbox;
  // Uži upit od seedova: samo parkinzi koji IMAJU `fee` tag.
  const query = `[out:json][timeout:180];
(
  node["amenity"="parking"]["fee"](${s},${w},${n},${e});
  way["amenity"="parking"]["fee"](${s},${w},${n},${e});
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
          'User-Agent': 'PlazaInfo-seed/1.0 (https://plaza-info; parking fee backfill)',
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
          `[fee]   pokušaj ${attempt} (${endpoint}) pao: ${String(err)} — čekam ${backoff}ms`,
        );
        await sleep(backoff);
      }
    }
  }
  throw lastErr;
}

/** Overpass element → točka s naplatom. Bez koordinata ili bez `fee` taga se preskače. */
function toFeePoints(els: OverpassElement[]): FeePoint[] {
  const points: FeePoint[] = [];
  for (const el of els) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    const fee = el.tags?.fee;
    if (lat == null || lng == null || !fee) continue;
    points.push({ lat, lng, fee, charge: el.tags?.charge });
  }
  return points;
}

/**
 * Dohvati chunk uz disk-cache. Ako `data/parking-fee-cache/<name>.json` postoji, čita ga
 * (bez mreže); inače dohvati i spremi. Vraća [točke, jeLiBioMrežniDohvat].
 */
async function fetchChunkCached(
  name: string,
  bbox: [number, number, number, number],
): Promise<[FeePoint[], boolean]> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const file = join(CACHE_DIR, `${name}.json`);
  if (existsSync(file)) {
    const cached = JSON.parse(readFileSync(file, 'utf8')) as FeePoint[];
    console.log(`[fee] ${name}: iz cachea (${cached.length})`);
    return [cached, false];
  }
  const els = await fetchOverpassNetwork(bbox);
  const points = toFeePoints(els);
  writeFileSync(file, JSON.stringify(points), 'utf8');
  return [points, true];
}

/**
 * Spoji duplikate iz preklapajućih županijskih bboxeva u jedan zapis po parkingu.
 *
 * Ključ je koordinata (5 decimala, ~1 m) PLUS `fee` — namjerno ne samo koordinata:
 * spajanje po samoj koordinati bi zadržalo prvu kopiju i bacilo `charge` one druge,
 * što je točno kvar popravljen u `92db3d3` (Velika Raduča je izgubila cijenu). Ovako se
 * `charge` prenosi na spojeni zapis, a proturječne `fee` vrijednosti na istoj točki
 * ostaju odvojene — `matchFee()` ih dalje razrješava po blizini, bez izmišljanja.
 */
function dedupeFeePoints(points: FeePoint[]): FeePoint[] {
  const byKey = new Map<string, FeePoint>();
  for (const p of points) {
    const key = `${p.lat.toFixed(5)},${p.lng.toFixed(5)},${p.fee.trim().toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...p });
      continue;
    }
    if (!existing.charge && p.charge) existing.charge = p.charge;
  }
  return [...byKey.values()];
}

async function collectFeePoints(): Promise<FeePoint[]> {
  const all: FeePoint[] = [];
  for (const chunk of COAST_CHUNKS) {
    const [points, wasNetwork] = await fetchChunkCached(chunk.name, chunk.bbox);
    all.push(...points);
    console.log(`[fee] ${chunk.name}: s naplatom ${points.length} (ukupno ${all.length})`);
    if (wasNetwork) await sleep(INTER_CHUNK_DELAY_MS);
  }
  const unique = dedupeFeePoints(all);
  console.log(`[fee] Nakon deduplikacije: ${unique.length} (od ${all.length}).`);
  return unique;
}

type BeachRow = {
  id: string;
  name_hr: string;
  parking_lat: number | null;
  parking_lng: number | null;
  parking_fee_status: string | null;
};

/** Naplata i (neobavezni) iznos za jedan parking; `status: null` = nepoznato. */
type FeeMatch = { status: FeeStatus | null; charge?: string };

/**
 * Spoji spremljeni parking na OSM točke unutar tolerancije.
 *
 * ZAŠTO NE SAMO „najbliža točka": županijski bboxevi se PREKLAPAJU (npr. Šibenik i
 * Split oba pokrivaju Raduču), pa isti parking uđe u cache dvaput — i te kopije ne
 * moraju nositi iste tagove. Kad obje leže na 0 m, čista „najbliža" logika daje pobjedu
 * onoj koja je slučajno prva u nizu, pa je kopija BEZ `charge` znala pregaziti onu s
 * cijenom (potvrđeno na Velikoj Raduči). Zato se status i iznos biraju odvojeno.
 */
function matchFee(lat: number, lng: number, points: FeePoint[]): FeeMatch {
  const near = points
    .map((p) => ({ p, d: haversineM(lat, lng, p.lat, p.lng) }))
    .filter((x) => x.d <= MATCH_TOLERANCE_M)
    .sort((a, b) => a.d - b.d);
  if (near.length === 0) return { status: null };

  // Status: najbliža točka — nepromijenjena semantika. Duplikati istog parkinga nose
  // isti `fee`, pa izjednačenje ne mijenja ishod (sort je stabilan → isti redoslijed
  // chunkova uvijek daje isti rezultat).
  const status = toFeeStatus(near[0].p.fee);
  if (!status) return { status: null };

  // Iznos: najbliža točka koja UOPĆE ima `charge` i slaže se sa statusom. Time se
  // cijena više ne gubi zbog duplikata bez tagova. Ako dvije kopije nose RAZLIČITE
  // iznose, OSM je proturječan — uzima se najbliža i ništa se ne izmišlja.
  const priced = near.find((x) => x.p.charge && toFeeStatus(x.p.fee) === status);
  return { status, charge: priced?.p.charge };
}

async function main(): Promise<void> {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Postavi NEXT_PUBLIC_SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY.');
  }
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const force = args.includes('--force');
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from('beaches_geo')
    .select('id, name_hr, parking_lat, parking_lng, parking_fee_status')
    .not('parking_lat', 'is', null)
    .order('name_hr', { ascending: true });
  if (error) throw new Error(`beaches_geo: ${error.message}`);

  let todo = (data ?? []) as BeachRow[];
  if (!force) todo = todo.filter((b) => (b.parking_fee_status ?? 'unknown') === 'unknown');

  console.log(
    `[fee] Plaža s parkingom: ${(data ?? []).length}, za obradu: ${todo.length}` +
      `${force ? ' (--force)' : ''}${dry ? ' (--dry)' : ''}.`,
  );
  if (todo.length === 0) {
    console.log('[fee] Nema plaža za obradu — gotovo.');
    return;
  }

  const points = await collectFeePoints();
  console.log(`[fee] Ukupno OSM parkinga s poznatom naplatom: ${points.length}.`);
  if (points.length === 0) {
    throw new Error('Nijedna točka s naplatom nije dohvaćena — provjeri Overpass / cache.');
  }

  let free = 0;
  let paid = 0;
  let withPrice = 0;
  let unknown = 0;

  for (const b of todo) {
    const { status, charge } = matchFee(
      b.parking_lat as number,
      b.parking_lng as number,
      points,
    );
    if (!status) {
      unknown += 1;
      continue;
    }

    const patch: { parking_fee_status: FeeStatus; parking_price_text?: string } = {
      parking_fee_status: status,
    };
    // OSM `charge` je stvaran iznos iz baze (npr. „2 EUR/hour") — prenosi se doslovno,
    // bez preračunavanja i samo kad se stvarno naplaćuje.
    if (status === 'paid' && charge) {
      patch.parking_price_text = charge.slice(0, 120);
      withPrice += 1;
    }

    if (!dry) {
      const { error: upErr } = await supabase.from('beaches').update(patch).eq('id', b.id);
      if (upErr) {
        console.error(`[fee] ${b.name_hr}: update: ${upErr.message}`);
        continue;
      }
    }
    if (status === 'free') free += 1;
    else paid += 1;
  }

  console.log(
    `[fee] Gotovo${dry ? ' (DRY — ništa nije upisano)' : ''}. ` +
      `Besplatan: ${free}, naplata: ${paid} (od toga s iznosom: ${withPrice}), ` +
      `ostaje nepoznato: ${unknown}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
