# PlažaInfo — Handoff za sljedeću sesiju

Zadnje ažurirano: **2026-07-22**. Grana: **`master`** (ne `main`). Radni dir: `C:\Users\anton\plaza-info`.

Aplikacija je **LIVE u produkciji:** **https://plaza-info.vercel.app/**

> **Ažuriranje 2026-07-22 (`ead313c`):** OSM seed proširen izvan Split pilota na **844 plaže (cijela obala)** — `scripts/seed-beaches.ts` (prošireni bbox) + `scripts/fetch-izor.ts`/`izor-points.json` (prošireni IZOR skup). `scripts/data/osm-cache/` dodан u `.gitignore` (regenerabilni Overpass keš). Lokalni `npm run build` **zelen: 1701 statičkih stranica** (844 plaže × 2 lokala + landing). Pushано na `master` → Vercel auto-deploy. (Napomena: brojke "71 plaža / 155 str." niže u §1–§6 su iz pilot-faze i sada su zastarjele.)

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
- **Admin / moderacija recenzija — ✅ LIVE U PRODUKCIJI** (`cbdac2a`, pushano `53564e8`): PIN-auth (stateless HMAC token, `ADMIN_PIN` kao ključ, TTL 12h) → `/api/admin/verify-pin`. `/api/admin/reviews` GET pending (+join plaže) i PATCH approve/reject preko service_role, zaštićeno `x-admin-token`, idempotentno (samo iz `pending`), `revalidatePath` na odobrenje. UI: **`https://plaza-info.vercel.app/hr/admin`** (force-dynamic + noindex) — `AdminPanel.tsx` (login PIN → lista pending → approve/reject). Klijent: `src/lib/adminApi.ts` (token u localStorage `pi_admin_token`). i18n namespace `Admin` (hr/en). E2E lokalno + produkcijski verificirano (login/401/approve/idempotent/cleanup; prod: `/hr/admin` 200, admin API 401 bez tokena, krivi PIN 401 → `ADMIN_PIN` postavljen u Vercelu). Lokalni dev PIN u `.env.local` (gitignored).

`npm run build` zelen (153 stranice), `eslint` čist.

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

### A. Admin / moderacija UI  ✅ GOTOVO I DEPLOYANO (`cbdac2a`+`53564e8`)
- Odabrana opcija **(1) PIN-admin** (stateless HMAC token). Live: **`https://plaza-info.vercel.app/hr/admin`**. `ADMIN_PIN` postavljen i u Vercelu i u `.env.local`. Vidi § 1 za detalje.
- Opcija (2) Supabase Auth (prijavljene recenzije, `user_id` ≠ null, RLS bez service_role) ostaje moguća buduća nadogradnja.

### B. Fotke plaža  ✅ GOTOVO (E2E verificirano lokalno protiv produkcijske baze)
- **Storage bucket** `beach-photos` (public, ≤5 MB, jpeg/png/webp) stvoren preko service_role Storage API-ja. Skripta: `scripts/ensure-photo-bucket.ts` (idempotentna). Dijeljene konstante: `src/lib/photoConfig.ts` (bucket, limit, MIME→ext, `pathFromPublicUrl`).
- **Upload:** `POST /api/photos` (multipart `beachId`+`file`, Node runtime). Validira MIME/veličinu, provjeri postoji li plaža, upload u Storage `{beachId}/{uuid}.{ext}` preko service_role, insert red `status='pending'` (`user_id=null`). Osiroćeni objekt se briše ako insert padne. Klijent: `src/lib/photos.ts` (`submitPhoto`, predprovjera tipa/veličine).
- **Prikaz:** galerija odobrenih na detalj-stranici — `src/components/beach/PhotosSection.tsx` (grid + upload forma), `queries.getBeachPhotos` (anon čita samo `approved` — RLS). Uvezano u `plaza/[slug]/page.tsx`. Plain `<img loading=lazy>` (bez next/image, da ne troši Vercel optimizacijsku kvotu). i18n namespace `Photos` (hr/en).
- **Moderacija:** `GET/PATCH /api/admin/photos` (isti PIN-token obrazac kao recenzije; idempotentno; `revalidatePath` na approve; **reject briše bajtove iz Storagea**). AdminPanel sada ima **tabove Recenzije | Fotografije** (`src/components/admin/AdminPanel.tsx`, `adminApi.fetchPendingPhotos`/`moderatePhoto`). Admin namespace proširen (`tabReviews`, `tabPhotos`, `emptyPhotos`, `title`→"Moderacija").
- **E2E test (lokalni dev protiv prod baze):** upload 201 / unsupported 415 / bad-uuid 400; RLS skriva pending od anona; admin GET lista + 401 bez tokena; approve 200 + re-approve 404 (idempotent) + anon vidi approved; reject briše Storage objekt (potvrđeno praznim `object/list`). Sve testne zapise/objekte počišćeno.
- `npm run build` zelen (155 stranica), `eslint` čist.
- *Preostalo (opcionalno):* ~~prva odobrena fotka kao OG/hero slika~~ ✅ GOTOVO (`f5f99c4`, vidi §E); Supabase Auth (prijavljeni uploadi bez service_role).

### C. Sezonsko osvježavanje IZOR kakvoće mora  *(periodički, ne razvoj)* — zadnji refresh **2026-07-22** (nakon 844-seed: **304/844 plaže** imaju kakvoću mora; `izor-points.json` = 1145 točaka)
```bash
npx tsx scripts/fetch-izor.ts 2026        # -> scripts/data/izor-points.json
set -a && . ./.env.local && set +a && npx tsx scripts/seed-sea-quality.ts
```
Decoupled od Overpassa (ne pada ako OSM 504). Sezona 1.6.–15.9. Zadnje: 87 pilot-bbox točaka → 32/71 plaža ima kakvoću mora (pokrivenost je geografski ograničena ≤200 m, ne mijenja se re-runom). Najnoviji uzorak u bazi `2026-07-20`. Ponovi po potrebi tijekom sezone.

### E. Hero + OG/Twitter slika  ✅ GOTOVO (`f5f99c4`)
- Najnovija **odobrena** fotka plaže sada je (a) hero-baner na vrhu detalj-stranice i (b) OpenGraph + Twitter `summary_large_image` slika za dijeljenje. `queries.getBeachHeroPhoto()` (limit 1) za `generateMetadata`; body koristi `photos[0]`. Plain `<img>` + apsolutni Storage URL → **bez next/image, bez `next.config` `remotePatterns`, bez Vercel opt-kvote**. i18n `Beach.heroAlt` (hr/en). Uvjetno: ne prikazuje se dok plaža nema odobrenu fotku (trenutno nijedna nema nakon §6-B cleanupa → dormant dok se ne odobri prva). Build zelen (155), eslint čist. **Live pozitivni put VERIFICIRAN (2026-07-22):** privremeni odobreni red za "Prve Lučice" → lokalni render potvrdio hero `<img>` + `og:image` (1200×630) + `twitter:image` + `twitter:card=summary_large_image`; testni red počišćen (0 zaostalih).

### D. Sitno / opcionalno
- **Širenje izvan pilot regije (Split)** — ✅ GOTOVO (`ead313c`): prošireni bbox → **844 plaže (cijela obala)**, build 1701 str.
- Obrisati suvišni `NEXT_PUBLIC_MAP_STYLE_URL` env u Vercelu — **ostaje ručno preko Vercel dashboarda** (Vercel MCP nema env-CRUD alat; bezopasno jer kod validira http(s), samo uredno). Koraci: Vercel → projekt `plaza-info` → Settings → Environment Variables → obriši `NEXT_PUBLIC_MAP_STYLE_URL`.
- Custom domena umjesto `plaza-info.vercel.app` (Vercel dashboard → Domains) — **traži kupnju/posjedovanje domene (odluka korisnika)**.
- **Google prijava (Supabase Auth)** — ✅ KOD GOTOV I DEPLOYAN (aditivno, ne lomi anonimni unos): `@supabase/ssr`, browser/server klijenti, `/auth/callback`, `AuthButton` u formama recenzija/fotki, `/api/reviews`+`/api/photos` vežu `user_id` kad je korisnik prijavljen. RLS već podržava (`0002_rls.sql`). **Preostaju 2 ručna dashboard koraka** (Google Cloud OAuth creds + Supabase provider enable) — vidi **`docs/AUTH-SETUP.md`**. Do tada prijava tiho ne radi, anonimni unos normalan. Opcija „obavezan login" = mala kasnija izmjena.

---

## 7. Korisni podsjetnici (kod)
- Domenski tipovi/mapperi: `src/lib/beaches.ts`. Čisti filteri/boje: `src/lib/beachFilters.ts` (`surfaceColor`, `crowdColor`, `seaQualityColor`, `markerColor`).
- Server/klijent dohvat (anon): `src/lib/queries.ts`. Server-only upis (service_role): `src/lib/supabaseAdmin.ts`.
- Karta: `src/components/beach/MapView.tsx` (dynamic `ssr:false`). Orkestracija stanja: `BeachExplorer.tsx`.
- API rute (Node runtime, service_role): `src/app/api/crowd/route.ts`, `src/app/api/reviews/route.ts`.
- i18n poruke: `messages/hr.json` + `messages/en.json` (namespaces: Map, Surface, Flags, Crowd, SeaQuality, Reviews, Beach, Amenities, NotFound…). Učitava `src/i18n/request.ts`.
- Puni plan Faze 3: `C:\Users\anton\.claude\plans\mogu-li-vidjeti-aplikaciju-declarative-kazoo.md`.
