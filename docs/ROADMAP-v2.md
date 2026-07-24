# PlažaInfo — ROADMAP v2 (Google-Maps redizajn + feature-i)

Grana `master`. Radni dir `C:\Users\anton\plaza-info`. Definirano 2026-07-22 s Antonijem.

## Zaključane odluke
- **Google recenzije:** samo **agregatni broj** (npr. „Google 4.3★ (128) ↗") uz link, bez teksta recenzija (ToS: ne spremamo tekst). Traži Google API ključ + billing → **Faza 7, opcionalno/kasnije**.
- **Slike plaža:** **Wikimedia Commons + Mapillary** (CC/PD, uz atribuciju + licencu). Djelomična pokrivenost.
- **Detalj-panel:** **Next.js intercepting + parallel routes** — zadržavamo SSG stranice (SEO) + inline panel u appu.
- **Jezici:** **samo UI** DE/IT/FR (imena/opisi plaža ostaju).

## DB migracije koje Antonio pokreće ručno (nema DB passworda → SQL Editor)
- `0005_rating_aggregate.sql` — view/kolone za `rating_avg`, `rating_count` (iz odobrenih recenzija) + ubaciti u `beaches_geo` za filtriranje.
- `0006_parking.sql` — `beaches.parking_lat/parking_lng/parking_distance_m`.
- `0007_photos_source.sql` — `photos.source` (`user|wikimedia|mapillary`), `photos.attribution`, `photos.license`.

---

## Faza 1 — Google-Maps split layout  `[L]`
**Cilj:** desno lista; klik na plažu → treći panel pored s punim detaljima (inline, ne zasebna stranica).
- Preslagati `/[locale]` u 3 zone: **karta | lista | detalj-panel** (desktop); mobitel = detalj klizi preko liste.
- `BeachDetailPanel` = zajednička komponenta sa svime iz „Više o plaži": rejting ★, sadržaji, kakvoća mora, gužva, galerija+atribucija, recenzije+forma, gumbi (upute, parking, dijeli).
- **SEO:** `plaza/[slug]` ostaje prava SSG stranica (crawler/direktan load = puna stranica). Dodati **parallel slot `@detail` + intercepting `(.)plaza/[slug]`** → in-app klik otvara panel, URL se ažurira (dijeljivo).
- Refaktor: `BeachExplorer` layout, izdvojiti `BeachDetailPanel` iz `plaza/[slug]/page.tsx` (reuse na oba mjesta).
- **Datoteke:** `src/app/[locale]/@detail/…`, `src/components/beach/BeachDetailPanel.tsx`, izmjene `BeachExplorer.tsx`, `plaza/[slug]/page.tsx`.

## Faza 2 — Filteri kao padajući multi-select  `[M]`
- „Vrsta plaže" = 1 dropdown s višestrukim odabirom; isto **Zastavice**, **Sadržaji**, **Kakvoća mora**, **Rejting** (min ★).
- Stanje filtera u **URL search params** (dijeljivo).
- Novi pristupačan `FilterDropdown` (bez teških ovisnosti), zamjena chipova u `FilterBar`.
- **Datoteke:** `src/components/beach/FilterDropdown.tsx`, izmjene `FilterBar.tsx`, `beachFilters.ts`, `BeachExplorer.tsx`.

## Faza 3 — Rejting + komentari + filtriranje po rejtingu  `[M]`
- Naše recenzije već su rejting(1–5)+tekst → prominentnije u panelu (sažetak ★ + lista + forma).
- **Agregat** `rating_avg`/`rating_count` iz odobrenih recenzija (migracija `0005`, ubaciti u `beaches_geo` view radi filtriranja u listi).
- Filter „min rejting" u Fazi 2 koristi `rating_avg`.
- **Datoteke:** `0005_rating_aggregate.sql`, `queries.ts` (rating u list+detail), `beachFilters.ts` (rating filter), `BeachDetailPanel`.

## Faza 4 — Slike plaža (Wikimedia + Mapillary)  `[M]`
- Skripta `scripts/seed-beach-images.ts`: po plaži Wikimedia Commons geosearch (po lat/lng, `imageinfo`+`extmetadata` za licencu/autora) → najbolja; fallback Mapillary Graph API (besplatan token) uz obalu.
- Upis u `photos` sa `source`, `attribution`, `license`, `status='approved'`, `is_official=true` → automatski postaje hero (postojeća hero logika koristi prvu odobrenu fotku).
- **Atribucija (obavezno):** hero + galerija prikazuju „© autor / licenca ↗" za seedane slike.
- **Env:** `MAPILLARY_TOKEN` (besplatan). Wikimedia bez ključa.
- **Datoteke:** `0007_photos_source.sql`, `scripts/seed-beach-images.ts`, izmjene `PhotosSection.tsx` + hero u `BeachDetailPanel` (atribucija), `queries.ts`.

## Faza 5 — Parking točke  `[M]`
- `scripts/seed-parking.ts`: Overpass `amenity=parking` u bbox → po plaži najbliži + udaljenost (zračna v1; OSRM pješačka opcionalno kasnije).
- Prikaz u panelu: „Najbliži parking: ~350 m" + marker + gumb upute. Podatak koristiv i za budući filter „blizu parkinga".
- **Datoteke:** `0006_parking.sql`, `scripts/seed-parking.ts`, `queries.ts`, `BeachDetailPanel`, `MapView` (parking marker).

## Faza 6 — Jezici DE / IT / FR (UI)  `[M]`
- `src/i18n/routing.ts` → `['hr','en','de','it','fr']`. Novi `messages/de.json|it.json|fr.json` (~130 ključeva, prijevod svih namespace-ova uklj. novi `Auth`).
- hreflang se širi na 5 jezika. **Skaliranje:** 844×5 ≈ 4.220 SSG stranica (sad 1.701) → razmotriti prebacivanje detalja na **on-demand ISR** (`dynamicParams`) da build ostane brz.
- **Datoteke:** `routing.ts`, `messages/{de,it,fr}.json`, po potrebi `plaza/[slug]/page.tsx` (ISR).

## Faza 7 — Google agregatni rejting  `[S–M, OPCIONALNO, treba ključ+billing]`
- Match `google_place_id` po plaži (Places Search), dohvat `rating`+`user_ratings_total` (Place Details), kratki cache (`google_rating_fetched_at`).
- Prikaz „Google 4.3★ (128) ↗" u panelu uz atribuciju + link. **Ne** spremamo tekst recenzija.
- **Prerekvizit (Antonio):** Google Cloud projekt + Places API + billing + `GOOGLE_MAPS_API_KEY`. Trošak ~$29 jednokratno (844×2 poziva) + periodični refresh.
- **Datoteke:** `0008_google_rating.sql`, `scripts/seed-google-rating.ts`, `queries.ts`, `BeachDetailPanel`.

---

## Redoslijed i ovisnosti
1 (temelj UI) → 2 (filteri) → 3 (rejting, treba za filter) → 4 (slike) → 5 (parking) → 6 (jezici) → 7 (Google, opcionalno).
Faze 4/5/7 su podatkovne skripte (decoupled) — mogu paralelno s UI-jem nakon migracija.

## Prerekviziti koje odrađuje Antonio (dashboard/ključevi)
- Pokrenuti `0005`–`0007` SQL u Supabase SQL Editoru (dat ću ih gotove).
- `MAPILLARY_TOKEN` (besplatan) u `.env.local` + Vercel — za Fazu 4 Mapillary fallback.
- (Faza 7) Google API ključ + billing.
- (Ranije, neovisno) Google Auth dashboard koraci — `docs/AUTH-SETUP.md`.

## Napomene
- Git `master`. CRLF upozorenja bezopasna. GateGuard traži „facts" pri prvom Write/Edit po datoteci (retry prolazi).
- Sve slike plain `<img>` (bez next/image) da ne troše Vercel optimizacijsku kvotu.
