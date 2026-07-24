# PlažaInfo — Handoff za iduću sesiju (ROADMAP v2, nakon Faze 1+2)

**Datum:** 2026-07-24 · **Grana:** `master` · **Radni dir:** `C:\Users\anton\plaza-info`

---

## Stanje sada (što je gotovo)

### Migracije (Antonio pokrenuo ručno u Supabase SQL Editoru)
- `0005_rating_aggregate.sql` ✅ — `rating_avg` / `rating_count` u `beaches_geo` (agregat odobrenih recenzija).
- `0006_parking.sql` ✅ — `beaches.parking_lat/parking_lng/parking_distance_m` (+ recreate viewa).
- `0007_photos_source.sql` ✅ — `photos.source` (`user|wikimedia|mapillary`), `attribution`, `license`.

### Faza 1 — Google-Maps split layout ✅
- 3 zone u `BeachExplorer.tsx`: **lista | detalj-panel | karta**. Panel = treći stupac (desktop) / `fixed` overlay (mobitel).
- Novi `src/components/beach/BeachDetailPanel.tsx` — zajednički bogati prikaz, koristi ga **i** in-app panel (`variant="panel"`) **i** SSG stranica `plaza/[slug]` (`variant="page"`). Jedan izvor istine.
- `plaza/[slug]/page.tsx` zadržava JSON-LD (sad s `aggregateRating`), h1, hero, hreflang server-side; tijelo delegira panelu. Dodan `dynamicParams=true` + `revalidate=3600` (ISR).
- Obrisan stari `BeachDetail.tsx` (logika preseljena u panel).
- **Shareable URL:** odabir plaže živi u `?plaza=<slug>` preko `window.history.replaceState`; `popstate` + deep-link rade. (Namjerno **nije** intercepting/parallel routes — history-pristup je robustan uz težak MapLibre klijent.)

### Faza 2 — padajući multi-select filteri ✅
- Novi `src/components/beach/FilterDropdown.tsx` (pristupačan checkbox popover, Escape + klik-izvan).
- `FilterBar.tsx`: 4 dropdowna — **Vrsta plaže, Oznake, Sadržaji, Rejting** (min ★).
- `beachFilters.ts`: prošireno stanje (`amenities`, `minRating`), `filterBeaches` + `filtersTo/FromSearchParams`.
- **URL-perzistencija filtera:** `?surface=…&flag=…&amenity=…&rating=4&q=…` (dijeljivo, deep-link).

**Verifikacija:** `tsc --noEmit` ✅ · `eslint` promijenjenih datoteka ✅ · `next build` ✅ (exit 0).

---

## ⚠️ Faza 3 je VEĆ ISPORUČENA (usput, kroz Fazu 1+2)

ROADMAP Faza 3 = „Rejting + komentari + filtriranje po rejtingu". Sve tri stavke su gotove:
1. **Recenzije prominentnije u panelu** ✅ — `BeachDetailPanel` ima ★-sažetak badge + `ReviewsSection` (lista + forma).
2. **Agregat `rating_avg`/`rating_count`** ✅ — migracija `0005` u `beaches_geo`, wired kroz `Beach.ratingAvg/ratingCount` (`beaches.ts`, `queries.ts`), prikaz ★ u listi (`BeachList.tsx`) i panelu, `aggregateRating` u JSON-LD.
3. **Filter „min rejting"** ✅ — dropdown u Fazi 2 koristi `rating_avg`.

**Zaključak:** nema zasebnog Faza-3 posla. Opcionalni sitni polish ako želiš: prebaciti ★-sažetak u header panela (uz ime), umjesto u tijelo.

---

## Preporučeni redoslijed za iduću sesiju

### A) Rupa: filter „Kakvoća mora" ✅ ISPORUČENO (ova sesija, 2026-07-24)
Faza 2 roadmap spominje i taj filter, ali `beaches_geo` **nije** nosio zadnju IZOR ocjenu po plaži. Sad nosi.
- **Migracija `0008_sea_latest.sql`** ✅ napisana — dodaje `sea_assessment` u `beaches_geo` (zadnji `sampled_at` po plaži) preko `left join lateral` na `sea_quality`; drop+create viewa, zadržava rating (0005) + parking (0006).
- `beaches.ts` ✅ — `Beach.seaAssessment: SeaAssessment | null`, `BeachRow.sea_assessment`, `dbToBeach`.
- `queries.ts` ✅ — `sea_assessment` dodan u `BEACH_COLUMNS`.
- `beachFilters.ts` ✅ — `SEA_ASSESSMENTS` const, `seaAssessments` u `BeachFilterState`/`EMPTY_FILTERS`/`hasActiveFilters`/`filterBeaches`; URL param `?sea=…` u `filtersTo/FromSearchParams`.
- `FilterBar.tsx` ✅ — 5. dropdown (label `SeaQuality.heading`, opcije + boje iz `seaQualityColor`); `onToggleSeaAssessment` wired u `BeachExplorer.tsx`.
- Prijevodi: koriste postojeći `SeaQuality` namespace (hr+en) — bez novih ključeva.
- **Verifikacija:** `tsc --noEmit` ✅ · `eslint` ✅ · `next build` ✅ (exit 0, 1685+ SSG str.).

> ⚠️ **PREREKVIZIT PRIJE DEPLOYA (Antonio):** pokreni `0008_sea_latest.sql` u Supabase SQL Editoru **PRIJE** nego kod ode u produkciju. `BEACH_COLUMNS` sad selektira `sea_assessment`; ako kolona ne postoji, `getBeaches` baca grešku i lista padne na prazno. Migracija + kod idu zajedno.

### B) Faza 4 — Slike plaža (Wikimedia + Mapillary) ✅ ISPORUČENO (ova sesija, 2026-07-24)
Migracija `0007` **već** primijenjena. `MAPILLARY_TOKEN` postavljen (Antonio, `.env.local` + Vercel).
- `scripts/seed-beach-images.ts` ✅ — po plaži Wikimedia Commons geosearch (`imageinfo`+`extmetadata` → autor/licenca, filtrira ne-slike i bez-licence) → fallback Mapillary Graph API (privremeni URL → **preuzme i re-hosta u `beach-photos` bucket** jer Mapillary URL istječe). Upis u `photos`: `source`, `attribution`, `license`, `status='approved'`, `is_official=true`. Idempotentno (preskače plaže s postojećom wikimedia/mapillary fotkom). Args: `--limit N`, `--dry`. Sam učitava `.env.local` (tokeni s `|` ne trpe shell sourcing).
- UI atribucija ✅ — novi `PhotoCredit.tsx` (`overlay` na hero, `caption` u galeriji); `queries.ts` `BeachPhoto` sad nosi `source/attribution/license` (`PHOTO_COLUMNS`, `rowToPhoto`), oba upita (`getBeachPhotos`, `getBeachHeroPhoto`) ih vraćaju. Ne prikazuje ništa za korisničke fotke (bez atribucije).
- **Verifikacija:** `tsc` ✅ · `eslint` ✅ · `next build` ✅ · **dry-run** ✅ (5 plaža: 1 Wikimedia + 3 Mapillary + 1 bez slike, sve s atribucijom).

> ⚠️ **AKCIJA (Antonio) za popuniti slike:** pokreni seed kad poželiš (piše u bazu, hotlinkano/re-hostano):
> ```
> npx tsx scripts/seed-beach-images.ts --limit 20      # test na 20 plaža
> npx tsx scripts/seed-beach-images.ts                 # sve 844 (~7-10 min zbog delaya)
> ```
> Idempotentno je — može se pokretati više puta; obrađuje samo plaže bez seedane fotke.
> (Napomena: `.env.local` je token bolje staviti u navodnike: `MAPILLARY_TOKEN="MLY|…|…"` — skripta radi i bez toga, ali Next/ostali alati vole navodnike uz `|`.)

### C) Faza 5 — Parking točke  `[M]`
Migracija `0006` je **već** primijenjena. Preostaje:
- `scripts/seed-parking.ts`: Overpass `amenity=parking` u bbox → po plaži najbliži + zračna udaljenost → upis u `beaches.parking_*`.
- `Beach` type + `BEACH_COLUMNS` + `dbToBeach` za parking polja.
- Panel: „Najbliži parking: ~350 m" + gumb upute; `MapView` parking marker.

### D) Faza 6 (jezici DE/IT/FR) i Faza 7 (Google rating) — kasnije, vidi `docs/ROADMAP-v2.md`.

---

## Gotcha bilješke
- **GateGuard** traži „facts" pri prvom Write/Edit po datoteci i prvom Bash-u — retry prolazi. Za dužu sesiju razmisli o `ECC_GATEGUARD=off`.
- Sve slike plain `<img>` (bez `next/image`) — ne trošiti Vercel optimizacijsku kvotu.
- `beaches_geo` je `select b.*` → svaka nova kolona na `beaches` traži **drop+create** viewa (ne `create or replace`, jer b.* umeće kolone u sredinu).
- `PhotosSection`/`ReviewsSection` prikazuju **samo** `initial*` (ne dohvaćaju sami) — panel im mora dati podatke (u `panel` varijanti ih panel sam dohvati; u `page` varijanti dolaze SSR-om).
