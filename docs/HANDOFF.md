# PlažaInfo — Handoff za sljedeću sesiju

Zadnje ažurirano: 2026-07-20. Grana: **`master`** (ne `main`). Radni dir: `C:\Users\anton\plaza-info`.

## Gdje smo stali

Gotovo i commitano:
- **Faza 0–2** (`9133f2d`): Next.js 16 + next-intl (HR default + EN), Tailwind v4, Supabase schema + seed (**71 plaža** iz OSM-a), MapLibre karta (OpenFreeMap), chip-filteri (podloga/zastavice), pretraga, near-me (geolokacija + haversine).
- **Faza 3.1 — gužva uživo** (`775250c`): `/api/crowd` (POST, Zod, upis preko service_role), `lib/crowd.ts`, `queries.getLatestCrowdLevels()`, one-tap gumbi u kartici plaže, bojanje markera po gužvi, osvježavanje svakih 60 s. E2e provjereno protiv baze.

`npm run build` zelen, `eslint` čist.

## Pokretanje / provjera

```bash
cd C:\Users\anton\plaza-info
npm run dev            # http://localhost:3000 -> /hr
# build/prod:
npm run build && npm run start
npx eslint "src/**/*.{ts,tsx}"
```

## Okruženje i ključne činjenice (VAŽNO)

- **Supabase projekt:** `qlcukvafzdttjqfpjypl` (drugi račun, "btoni159@gmail.com's Org"). Ključevi u `.env.local` (gitignored): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable), `SUPABASE_SERVICE_ROLE_KEY`.
- **Nema DB passworda/connection stringa** → DDL (migracije) se NE mogu pushati iz koda; samo SQL Editor ili CLI. Migracije 0001–0004 su VEĆ primijenjene. Seed i REST rade jer koriste supabase-js + service_role/anon.
- **Supabase MCP je spojen na PRVI račun** → NE vidi ovaj projekt. Ne oslanjati se na MCP za ovu bazu; koristi REST/curl s ključevima iz `.env.local`.
- **Commitanje je dozvoljeno tijekom testiranja** (korisnik odobrio). Grana `master`. CRLF upozorenja su bezopasna.
- **GateGuard hook** blokira prvi Write/Edit po datoteci uz traženje "facts" — normalno, retry prolazi.
- **Izolacija (tvrdo pravilo):** nikakvih veza/importa s drugim projektima (meridijan, prijave-app…). Vlastiti Supabase/Vercel/git.

## Sljedeći zadaci (redom)

### 1. Detalj-stranica plaže (`/[locale]/plaza/[slug]`) — SEO prioritet
- Novi `src/app/[locale]/plaza/[slug]/page.tsx`, SSG + `generateStaticParams` iz slugova (`getBeaches()` u `src/lib/queries.ts`).
- Prikaz: naziv, podloga, zastavice, upute (Google Maps link), mini-karta (može reuse `MapView` ili statični marker), gužva (`getLatestCrowdLevels` ili novi `beach_crowd_summary` RPC), kakvoća mora (kad bude — vidi #2).
- `generateMetadata` po plaži (title/description/OG) za SEO.
- Dodati link s liste/kartice (`BeachList`/`BeachExplorer`) na detalj (`Link` iz `@/i18n/navigation`).
- i18n: novi namespace `Beach` u `messages/hr.json` + `messages/en.json`.

### 2. IZOR kakvoća mora
- Popuniti `scripts/data/izor-points.json` — niz `{ izorPointId, lat, lng, assessment }` (assessment ∈ `excellent|good|satisfactory|unsatisfactory`) iz IZOR "Vrtlac" izvora (vrtlac.izor.hr). Sezona 1.6.–15.9., ~2 tj. razmak, NIJE real-time.
- Re-run seed: `set -a && . ./.env.local && set +a && npx tsx scripts/seed-beaches.ts` (merge po blizini ≤200 m → tablica `sea_quality`; helper već postoji u seedu).
- `queries.getBeachSeaQuality(beachId)` (zadnji uzorak) → badge u kartici/detalju. Jasno označiti "službeno, nije real-time".

### 3. Deploy na Vercel
- Vlastiti Vercel projekt (izolacija). Env varijable iz `.env.local` u Vercel dashboard (uklj. `SUPABASE_SERVICE_ROLE_KEY` kao server-only).
- Provjeriti `middleware.ts` (next-intl) na Vercelu i da se OpenFreeMap pločice učitavaju (ako se doda CSP → `connect-src`/`img-src` za tiles.openfreemap.org).
- `/api/crowd` je dinamički route (Node runtime) — radi na Vercelu bez problema; nema Hobby limita relevantnog ovdje (to je meridijanov projekt, ne ovaj).

## Korisni podsjetnici (kod)
- Domenski tipovi/mapperi: `src/lib/beaches.ts`. Čisti filteri/boje: `src/lib/beachFilters.ts`.
- Server/klijent dohvat: `src/lib/queries.ts` (anon). Server-only upis: `src/lib/supabaseAdmin.ts`.
- Karta: `src/components/beach/MapView.tsx` (dynamic `ssr:false`). Orkestracija stanja: `BeachExplorer.tsx`.
- Puni plan Faze 3: `C:\Users\anton\.claude\plans\mogu-li-vidjeti-aplikaciju-declarative-kazoo.md`.
