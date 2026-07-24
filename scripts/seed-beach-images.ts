/**
 * PlažaInfo — seed službenih fotki plaža iz slobodnih izvora (ROADMAP v2, Faza 4).
 *
 * Po plaži: 1) Wikimedia Commons geosearch (trajni URL, hotlink dopušten) →
 *           2) fallback Mapillary Graph API (privremeni URL → preuzmi + re-hostaj u Storage).
 * Upis u `photos`: source, attribution, license, status='approved', is_official=true.
 * OBAVEZNO sprema atribuciju/licencu (CC uvjet) — UI je prikazuje (PhotoCredit).
 *
 * Idempotentno: preskače plaže koje već imaju wikimedia/mapillary fotku.
 * Pokretanje (iz .env.local):  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MAPILLARY_TOKEN
 *   set -a && . ./.env.local && set +a && npx tsx scripts/seed-beach-images.ts --limit 20
 *   (bez --limit ide kroz sve plaže; --dry samo ispisuje, bez upisa)
 * IZOLACIJA: piše ISKLJUČIVO u PlazaInfo Supabase projekt (preko env-a).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PHOTO_BUCKET } from '../src/lib/photoConfig';

/**
 * Učitaj .env.local bez ovisnosti (dotenv nije instaliran) i bez shell sourcinga,
 * koji lomi vrijednosti s `|` (npr. MAPILLARY_TOKEN=MLY|…|…). Postavlja samo nepostavljene ključeve.
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

const WIKI_RADIUS_M = 300; // geosearch polumjer oko plaže
const WIKI_CANDIDATES = 8; // koliko najbližih datoteka provjeriti
const MAPILLARY_BBOX_DEG = 0.0035; // ~350 m poluokvir za fallback
const REQUEST_DELAY_MS = 250; // ljubaznost prema Wikimedia/Mapillary API-ju
const USER_AGENT = 'PlazaInfoBot/1.0 (https://plaza-info.vercel.app; kontakt preko GitHuba)';

type BeachGeo = { id: string; lat: number; lng: number; name_hr: string };
type SeededPhoto = {
  url: string;
  source: 'wikimedia' | 'mapillary';
  attribution: string;
  license: string;
};

interface WikiImageInfo {
  url?: string;
  thumburl?: string;
  mime?: string;
  extmetadata?: {
    Artist?: { value?: string };
    LicenseShortName?: { value?: string };
  };
}
interface WikiPage {
  title?: string;
  imageinfo?: WikiImageInfo[];
}
interface WikiGeoResp {
  query?: { geosearch?: { title: string }[] };
}
interface WikiInfoResp {
  query?: { pages?: Record<string, WikiPage> };
}
interface MapillaryResp {
  data?: { id: string; thumb_1024_url?: string; creator?: { username?: string } }[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url.slice(0, 80)}`);
  return res.json();
}

/** Najbliža geolocirana Commons datoteka s upotrebljivom licencom (ili null). */
async function fromWikimedia(beach: BeachGeo): Promise<SeededPhoto | null> {
  const geo = new URL('https://commons.wikimedia.org/w/api.php');
  geo.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    list: 'geosearch',
    gscoord: `${beach.lat}|${beach.lng}`,
    gsradius: String(WIKI_RADIUS_M),
    gslimit: String(WIKI_CANDIDATES),
    gsnamespace: '6', // File:
  }).toString();

  const geoData = (await fetchJson(geo.toString())) as WikiGeoResp;
  const hits: { title: string }[] = geoData.query?.geosearch ?? [];
  if (hits.length === 0) return null;

  const info = new URL('https://commons.wikimedia.org/w/api.php');
  info.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|mime',
    iiurlwidth: '1024',
    titles: hits.map((h) => h.title).join('|'),
  }).toString();

  const infoData = (await fetchJson(info.toString())) as WikiInfoResp;
  const pages: Record<string, WikiPage> = infoData.query?.pages ?? {};

  // Zadrži redoslijed po blizini (geosearch je već sortiran); mapiraj title → page.
  for (const hit of hits) {
    const page = Object.values(pages).find((p) => p.title === hit.title);
    const ii = page?.imageinfo?.[0];
    if (!ii) continue;
    const mime: string = ii.mime ?? '';
    if (!mime.startsWith('image/')) continue; // preskoči SVG/PDF/video
    const meta = ii.extmetadata ?? {};
    const license: string | undefined = meta.LicenseShortName?.value;
    if (!license) continue; // bez jasne licence ne seedamo
    const artist = meta.Artist?.value ? stripHtml(meta.Artist.value) : 'Wikimedia Commons';
    const url: string | undefined = ii.thumburl ?? ii.url;
    if (!url) continue;
    return {
      url,
      source: 'wikimedia',
      attribution: (artist || 'Wikimedia Commons').slice(0, 200),
      license: stripHtml(license).slice(0, 80),
    };
  }
  return null;
}

/** Mapillary fallback: dohvati sliku u okviru, preuzmi i re-hostaj u Storage (URL trajan). */
async function fromMapillary(
  beach: BeachGeo,
  token: string,
  admin: SupabaseClient,
  supabaseUrl: string,
  dry: boolean,
): Promise<SeededPhoto | null> {
  const d = MAPILLARY_BBOX_DEG;
  const bbox = `${beach.lng - d},${beach.lat - d},${beach.lng + d},${beach.lat + d}`;
  const api = new URL('https://graph.mapillary.com/images');
  api.search = new URLSearchParams({
    access_token: token,
    fields: 'id,thumb_1024_url,creator',
    bbox,
    limit: '1',
  }).toString();

  const data = (await fetchJson(api.toString())) as MapillaryResp;
  const img = data.data?.[0];
  if (!img?.thumb_1024_url) return null;

  const username: string | undefined = img.creator?.username;
  const attribution = username ? `${username} / Mapillary` : 'Mapillary';
  const license = 'CC BY-SA 4.0'; // Mapillary slike su CC BY-SA 4.0

  if (dry) {
    return { url: img.thumb_1024_url, source: 'mapillary', attribution, license };
  }

  // Privremeni Mapillary URL → preuzmi i spremi trajno u javni bucket.
  const imgRes = await fetch(img.thumb_1024_url, { headers: { 'User-Agent': USER_AGENT } });
  if (!imgRes.ok) return null;
  const buffer = Buffer.from(await imgRes.arrayBuffer());
  const path = `seed/mapillary-${beach.id}-${img.id}.jpg`;
  const { error: upErr } = await admin.storage
    .from(PHOTO_BUCKET)
    .upload(path, buffer, { contentType: 'image/jpeg', upsert: true });
  if (upErr) {
    console.error(`[img] ${beach.name_hr}: Storage upload: ${upErr.message}`);
    return null;
  }
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${PHOTO_BUCKET}/${path}`;
  return { url: publicUrl, source: 'mapillary', attribution, license };
}

function parseArgs(argv: string[]): { limit: number; dry: boolean } {
  let limit = 0;
  const idx = argv.indexOf('--limit');
  if (idx !== -1 && argv[idx + 1]) limit = Number(argv[idx + 1]) || 0;
  return { limit, dry: argv.includes('--dry') };
}

async function main(): Promise<void> {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const mapillaryToken = process.env.MAPILLARY_TOKEN;
  if (!url || !key) throw new Error('Postavi NEXT_PUBLIC_SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY.');
  if (!mapillaryToken) console.warn('[img] MAPILLARY_TOKEN nije postavljen — fallback isključen.');

  const { limit, dry } = parseArgs(process.argv.slice(2));
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: beaches, error } = await admin
    .from('beaches_geo')
    .select('id, lat, lng, name_hr')
    .order('name_hr', { ascending: true });
  if (error) throw new Error(`beaches_geo: ${error.message}`);

  // Idempotencija: plaže koje već imaju seedanu (wikimedia/mapillary) fotku.
  const { data: existing } = await admin
    .from('photos')
    .select('beach_id')
    .in('source', ['wikimedia', 'mapillary']);
  const seeded = new Set((existing ?? []).map((r: { beach_id: string }) => r.beach_id));

  let todo = (beaches ?? []).filter((b: BeachGeo) => !seeded.has(b.id));
  if (limit > 0) todo = todo.slice(0, limit);

  console.log(
    `[img] Plaža ukupno: ${(beaches ?? []).length}, već seedano: ${seeded.size}, ` +
      `za obradu: ${todo.length}${dry ? ' (DRY)' : ''}.`,
  );

  let wiki = 0;
  let mapi = 0;
  let none = 0;
  for (const b of todo as BeachGeo[]) {
    let photo: SeededPhoto | null = null;
    try {
      photo = await fromWikimedia(b);
      if (!photo && mapillaryToken) {
        await sleep(REQUEST_DELAY_MS);
        photo = await fromMapillary(b, mapillaryToken, admin, url, dry);
      }
    } catch (err) {
      console.error(`[img] ${b.name_hr}: ${(err as Error).message}`);
    }

    if (!photo) {
      none += 1;
    } else {
      if (photo.source === 'wikimedia') wiki += 1;
      else mapi += 1;
      console.log(`[img] ${b.name_hr} ← ${photo.source}: © ${photo.attribution} · ${photo.license}`);
      if (!dry) {
        const { error: insErr } = await admin.from('photos').insert({
          beach_id: b.id,
          url: photo.url,
          source: photo.source,
          attribution: photo.attribution,
          license: photo.license,
          status: 'approved',
          is_official: true,
        });
        if (insErr) console.error(`[img] ${b.name_hr}: insert: ${insErr.message}`);
      }
    }
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`[img] Gotovo. Wikimedia: ${wiki}, Mapillary: ${mapi}, bez slike: ${none}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
