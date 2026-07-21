/**
 * PlažaInfo — dohvat službene kakvoće mora s IZOR "Vrtlac" portala.
 *
 * Izvor (javni JSON koji koristi službeni SPA vrtlac.izor.hr/kakvoca):
 *   https://vrtlac.izor.hr/ords/kakvoca/kakvoce_sve_json?p_jezik=hr&p_god=<godina>
 *
 * Polja markera: lat, lng, lsta (ID točke), locj (ocjena 1–4), lkad (datum),
 *   lpla (naziv), lgrad (grad). `locj` je službena redna ljestvica (EU/nacionalna uredba):
 *   1=izvrsna, 2=dobra, 3=zadovoljavajuća, 4=nezadovoljavajuća.
 *
 * Filtrira na pilot-bbox (Srednja Dalmacija / Split) i zapisuje `scripts/data/izor-points.json`
 * u formatu koji čita `seed-beaches.ts` (merge po blizini ≤200 m u tablicu `sea_quality`).
 *
 * Pokretanje:  npx tsx scripts/fetch-izor.ts [godina]   (default: tekuća godina)
 * IZOLACIJA: samo čita s IZOR-a i piše lokalnu JSON datoteku; ne dira nijednu bazu.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Pilot regija: Srednja Dalmacija (Split i okolica). [jug, zapad, sjever, istok] — isto kao u seed-u.
const PILOT_BBOX: [number, number, number, number] = [43.35, 16.2, 43.62, 16.75];

type IzorAssessment = 'excellent' | 'good' | 'satisfactory' | 'unsatisfactory';

const ASSESSMENT_BY_LOCJ: Record<number, IzorAssessment> = {
  1: 'excellent',
  2: 'good',
  3: 'satisfactory',
  4: 'unsatisfactory',
};

type IzorMarker = {
  lat: number;
  lng: number;
  lsta: number; // ID mjerne točke
  locj: number; // ocjena 1–4
  lkad: string; // datum ("14.07.2026. 11:10") ili godina ("2025")
  lpla?: string;
  lgrad?: string;
};

type IzorPoint = {
  izorPointId: string;
  lat: number;
  lng: number;
  assessment: IzorAssessment;
  sampledAt: string; // YYYY-MM-DD
  name?: string;
};

function inBbox(lat: number, lng: number): boolean {
  const [s, w, n, e] = PILOT_BBOX;
  return lat >= s && lat <= n && lng >= w && lng <= e;
}

/** "14.07.2026. 11:10" → "2026-07-14"; ako je samo godina, vrati "<god>-09-15" (kraj sezone). */
function parseSampledAt(lkad: string, year: number): string {
  const m = lkad.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return `${year}-09-15`;
}

async function main(): Promise<void> {
  const year = Number(process.argv[2]) || new Date().getFullYear();
  const url = `https://vrtlac.izor.hr/ords/kakvoca/kakvoce_sve_json?p_jezik=hr&p_god=${year}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'PlazaInfo-seed/1.0 (beach data; kakvoca mora)',
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`IZOR ${res.status} ${res.statusText}`);
  const json = (await res.json()) as { markers?: IzorMarker[] };
  const markers = json.markers ?? [];
  console.log(`[izor] Ukupno mjernih točaka (${year}): ${markers.length}`);

  const points: IzorPoint[] = [];
  for (const m of markers) {
    if (typeof m.lat !== 'number' || typeof m.lng !== 'number') continue;
    if (!inBbox(m.lat, m.lng)) continue;
    const assessment = ASSESSMENT_BY_LOCJ[m.locj];
    if (!assessment) continue; // preskoči nepoznate/neispitane (locj izvan 1–4)
    points.push({
      izorPointId: String(m.lsta),
      lat: m.lat,
      lng: m.lng,
      assessment,
      sampledAt: parseSampledAt(m.lkad, year),
      name: m.lpla,
    });
  }

  const dir = join(dirname(fileURLToPath(import.meta.url)), 'data');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'izor-points.json');
  writeFileSync(file, JSON.stringify(points, null, 2) + '\n', 'utf8');

  const byAssessment = points.reduce<Record<string, number>>((acc, p) => {
    acc[p.assessment] = (acc[p.assessment] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`[izor] Pilot-bbox točaka: ${points.length}`, byAssessment);
  console.log(`[izor] Zapisano: ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
