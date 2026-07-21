# PlažaInfo — Handoff za sljedeću sesiju

Zadnje ažurirano: **2026-07-21**. Grana: **`master`** (ne `main`). Radni dir: `C:\Users\anton\plaza-info`.

Aplikacija je **LIVE u produkciji:** **https://plaza-info.vercel.app/**

---

## 1. Što je gotovo (kronološki, s commitima)

- **Faza 0–2** (`9133f2d`): Next.js 16 (App Router) + next-intl (HR default + EN, rute `/hr` `/en`), Tailwind v4, Supabase schema + seed (**71 plaža** iz OSM-a, pilot bbox Split), MapLibre karta (OpenFreeMap, besplatno bez ključa), chip-filteri (podloga/zastavice), pretraga, near-me (geolokacija + haversine).
- **Faza 3.1 — gužva uživo** (`775250c`): `/api/crowd` (POST, Zod, upis preko service_role), `lib/crowd.ts`, `queries.getLatestCrowdLevels()`, one-tap gumbi u kartici plaže, bojanje markera po gužvi, osvježavanje svakih 60 s.
- **Detalj-stranica plaže** (`42b7ab8`): `src/app/[locale]/plaza/[slug]/page.tsx` (SSG, 71×2=142 puta, revalidate 1h). `generateMetadata` (title, ICU opis, canonical + hreflang, OpenGraph), JSON-LD schema.org `Beach`. `BeachDetail.tsx` (mini-karta + gužva uživo).
- **IZOR kakvoća mora** (`4562de0` + `166c69d`): prikaz badge + datum na detalj-stranici; `scripts/fetch-izor.ts` + `scripts/seed-sea-quality.ts` (decoupled merge ≤200 m). Pilot: 32/71 plaža ima kakvoću mora.
- **Deploy na Vercel — LIVE** (put GitHub + dashboard): GitHub repo **github.com/antoniobubnic99/plaza-info** (PRIVATNI, `master`), Vercel projekt na računu `antoniobubnic99's projects` (`team_lmfacKfUUd5siJiwyLySUtZs`). Svaki `git push` na `master` = auto-deploy.
- **Fix bijele karte** (`62ed8b8`): vidi § 4.
- **Badge kakvoće mora u panelu karte** (`1f4befc`): `BeachExplorer` panel odabrane plaže prikazuje IZOR ocjenu (boja + temp + datum), dohvat po odabiru uz cache.
- **Korisničke recenzije** (`b3f8ca7`): vidi § 5.

`npm run build` zelen (149 stranica), `eslint` čist.

---

## 2. Pokretanje / provjera

```bash
cd C:\Users\anton\plaza-info
npm run dev              # http://localhost:3000 -> /hr
npm run build && npm start
npx eslint "src/**/*.{ts,tsx}"
```

**Vizualna provjera karte (headless, bez ručnog otvaranja preglednika):** vidi § 4 (tehnika s Playwrightom). Korisno kad "izgleda ok" ali nešto se ne iscrtava.

---

## 3. Okruženje i ključne činjenice (VAŽNO)

- **Izolacija (tvrdo pravilo):** PlažaInfo je potpuno odvojen projekt — nikakvih veza/importa s drugim projektima (meridijan-vijesti, prijave-app…). Vlastiti Supabase/Vercel/GitHub.
- **Supabase projekt:** `qlcukvafzdttjqfpjypl` (drugi račun, "btoni159@gmail.com's Org", FREE). Ključevi u `.env.local` (gitignored): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable), `SUPABASE_SERVICE_ROLE_KEY` (server-only tajna).
- **Nema DB passworda/connection stringa** → DDL (nove migracije) se NE mogu pushati iz koda; samo SQL Editor ili CLI. Migracije 0001–0004 su VEĆ primijenjene. Seed i REST rade preko supabase-js (anon/service_role).
- **Supabase MCP je spojen na PRVI račun** → NE vidi ovaj projekt. Za ovu bazu koristi REST/curl s ključevima iz `.env.local` (učitaj ih: `set -a && . ./.env.local && set +a`).
- **Vercel env varijable** (dashboard): 5 kao u `.env.local`. `SUPABASE_SERVICE_ROLE_KEY` je server-only. `NEXT_PUBLIC_MAP_STYLE_URL` treba biti **prazno ILI stvarni http(s) URL** — ne label (vidi § 4). **VAŽNO:** stranice su SSG i čitaju Supabase u build-time → env mora postojati prije builda.
- **Commitanje dozvoljeno tijekom testiranja** (korisnik odobrio). CRLF upozorenja bezopasna.
- **GateGuard hook** blokira prvi Write/Edit po datoteci i traži "facts" — normalno; iznesi činjenice i retry prolazi.
- **Win-testiranje:** `pkill`/Bash ne gasi pouzdano `next-server` na portu 3000 → curl protiv `npm start` može dati STALE stranicu; gasi node preko PowerShell `Stop-Process` ili provjeravaj built HTML u `.next/server/app/**/*.html`.

---

## 4. Karta / MapLibre (naučeno na teži način)

- Stil: `src/lib/mapStyle.ts` → default `https://tiles.openfreemap.org/styles/liberty` (besplatno, bez ključa). Override preko env `NEXT_PUBLIC_MAP_STYLE_URL`.
- **Footgun riješen (`62ed8b8`):** ako je env postavljen na ne-URL (npr. label `OpenFreeMap`), MapLibre ga tretira kao relativni URL → 404 → **bijela karta s markerima** (markeri su DOM overlay pa se vide, bazne vektorske pločice ne). `getMapStyleUrl()` sada koristi override **samo ako počinje s `http(s)`**, inače default. **Pravilo:** env vrijednosti = stvarni URL-ovi; upute korisniku piši nedvosmisleno.
- **Dijagnostika u pregledniku bez ručnog klikanja** (Playwright headless):
  ```bash
  npm i --no-save playwright        # binarni chromium: npx playwright install chromium
  # skripta: page.on('console'|'pageerror'|'response') -> ispiši greške + openfreemap/*.pbf statuse
  ```
  Ovako je uhvaćen točan 404 URL (`/hr/OpenFreeMap`). Ista tehnika za buduće "ne iscrtava se" bugove.

---

## 5. Recenzije (trenutno stanje + kako se moderira)

- **Tok:** `/api/reviews` POST (Zod: `beachId` uuid, `rating` 1–5, `body?` ≤1000) → upis preko **service_role** (RLS traži auth, a app još nema auth), `user_id = null`, `status` default **`pending`**.
- **Datoteke:** `src/app/api/reviews/route.ts`, `src/lib/reviews.ts` (`submitReview`), `queries.getBeachReviews` (anon čita **samo `approved`** — RLS policy), `src/components/beach/ReviewsSection.tsx` (prikaz + forma), uvezano u `plaza/[slug]/page.tsx`. i18n namespace `Reviews` (hr/en).
- **Recenzije su sigurne dok su `pending`** — javno se NE prikazuju do odobrenja.
- **MODERACIJA (ručno, dok nema admin UI):** odobri preko REST/SQL sa service_role ključem:
  ```bash
  set -a && . ./.env.local && set +a
  # popis pending:
  curl -sS "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/reviews?select=id,beach_id,rating,body,created_at&status=eq.pending" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
  # odobri jednu:
  curl -sS -X PATCH "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/reviews?id=eq.<UUID>" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" -H "Prefer: return=minimal" \
    -d '{"status":"approved"}'
  ```
  (ili SQL Editor: `update reviews set status='approved' where id='…';`). Nakon odobrenja recenzija se pojavi na detalj-stranici (SSG revalidate 1h — ili redeploy za odmah).
- **Test API-ja na produkciji** (uvijek počisti `__TEST__` zapise preko service_role DELETE nakon):
  ```bash
  curl -X POST -H "Content-Type: application/json" \
    -d '{"beachId":"<real-uuid>","rating":5,"body":"__TEST__"}' https://plaza-info.vercel.app/api/reviews
  ```

---

## 6. Sljedeći zadaci (redom) — ODAVDE PREUZIMA IDUĆA SESIJA

### A. Admin / moderacija UI  *(preporučeno prvo — recenzije čekaju ručnu moderaciju)*
- Cilj: iz aplikacije odobravati/odbijati recenzije (i kasnije fotke) umjesto ručnog REST-a.
- Auth opcije: **(1)** PIN-admin (env `ADMIN_PIN` već predviđen — kao meridijan: `/api/admin/verify-pin` → token → `x-admin-token` header), ili **(2)** Supabase Auth (uvodi i "prijavljene recenzije" pa `user_id` više nije null i RLS radi bez service_role).
- Minimum: stranica `/[locale]/admin` (lazy) + `/api/admin/reviews` (GET pending, PATCH approve/reject) preko service_role, zaštićeno tokenom.
- Nakon odobrenja: `revalidatePath` detalj-stranice ili osloni se na ISR 1h.

### B. Fotke plaža  *(veća infra runda; tablica `photos` postoji, `url` NOT NULL)*
- Treba **Supabase Storage bucket** (npr. `beach-photos`, javno-čitljiv) + upload. Bucket se može stvoriti preko service_role Storage API-ja (nema DDL problema): `POST /storage/v1/bucket`.
- Tok: klijent upload u Storage (potpisani URL ili preko `/api/photos` servera), spremi `url` + `beach_id`, `status='pending'` (kao recenzije), moderacija u istom admin UI (A).
- RLS već postoji: `photos read approved or is_official`, `photos insert own` (za auth); za anon ide preko service_role kao recenzije.
- Prikaz: galerija na detalj-stranici (+ eventualno prva odobrena kao OG/hero slika).

### C. Sezonsko osvježavanje IZOR kakvoće mora  *(periodički, ne razvoj)*
```bash
npx tsx scripts/fetch-izor.ts 2026        # -> scripts/data/izor-points.json
set -a && . ./.env.local && set +a && npx tsx scripts/seed-sea-quality.ts
```
Decoupled od Overpassa (ne pada ako OSM 504). Sezona 1.6.–15.9.

### D. Sitno / opcionalno
- Obrisati suvišni `NEXT_PUBLIC_MAP_STYLE_URL` env u Vercelu (bezopasan otkad kod validira, ali uredno).
- Custom domena umjesto `plaza-info.vercel.app` (Vercel dashboard → Domains).
- Širenje izvan pilot regije (Split) — proširiti seed bbox u `scripts/seed-beaches.ts` + re-seed.

---

## 7. Korisni podsjetnici (kod)
- Domenski tipovi/mapperi: `src/lib/beaches.ts`. Čisti filteri/boje: `src/lib/beachFilters.ts` (`surfaceColor`, `crowdColor`, `seaQualityColor`, `markerColor`).
- Server/klijent dohvat (anon): `src/lib/queries.ts`. Server-only upis (service_role): `src/lib/supabaseAdmin.ts`.
- Karta: `src/components/beach/MapView.tsx` (dynamic `ssr:false`). Orkestracija stanja: `BeachExplorer.tsx`.
- API rute (Node runtime, service_role): `src/app/api/crowd/route.ts`, `src/app/api/reviews/route.ts`.
- i18n poruke: `messages/hr.json` + `messages/en.json` (namespaces: Map, Surface, Flags, Crowd, SeaQuality, Reviews, Beach, Amenities, NotFound…). Učitava `src/i18n/request.ts`.
- Puni plan Faze 3: `C:\Users\anton\.claude\plans\mogu-li-vidjeti-aplikaciju-declarative-kazoo.md`.
