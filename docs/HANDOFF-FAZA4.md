# PlažaInfo — Handoff nakon Faze 4 (podatkovna higijena i prazna stanja)

**Datum:** 2026-08-05 · **Grana:** `master` · **Radni dir:** `C:\Users\anton\plaza-info`
**Plan:** `~/.claude/plans/1-napi-i-mi-sve-breezy-puddle.md`, dio B → Faza 4

---

## Izmjereno stanje podataka (prije izmjena)

Read-only upit nad `beaches_geo` (844 plaže), 2026-08-05:

| Skup | Pokrivenost |
|---|---|
| Sadržaji | `bar` 423 · `wc` 168 · `showers` 146 · `loungers` 32 · **`lifeguard` 0** |
| Oznake | `nudist` 48 · `dogs` 10 · `accessible` 7 |
| Podloga | 552 / 844 |
| Kakvoća mora (IZOR) | 304 / 844 |
| Parking | 727 plaža — `free` 157 · `paid` 169 · `unknown` 401 (cijena upisana: 35) |

Brojke potvrđuju nalaz vijeća: `lifeguard` je jedini filter s nultom pokrivenošću.

---

## Što je napravljeno

### 1. Filtri s nultom pokrivenošću ✅
- `beachFilters.ts`: novi `computeFilterCoverage(beaches)` → `{ flags, amenities }` s brojem plaža po opciji.
- `FilterDropdown.tsx`: `DropdownOption` dobiva `disabled` + `note`; onemogućena opcija ostaje **vidljiva** (prigušena, `aria-disabled`, oznaka „nema podataka") umjesto da se sakrije.
- `FilterBar.tsx` / `BeachExplorer.tsx`: pokrivenost se računa iz učitanih plaža i gasi opciju s 0 pogodaka.

**Zašto dinamički, a ne brisanje `lifeguard` iz `AMENITY_FILTERS`:** filter se sam vrati čim prva korisnička prijava donese podatak, bez izmjene koda. Isti obrazac automatski pokriva svaki budući filter koji ostane bez podataka.

**Namjerna iznimka:** ako je opcija već uključena (npr. iz dijeljenog URL-a `?amenity=lifeguard`), ostaje omogućena da je korisnik može ugasiti.

### 2. Gužva — CTA umjesto praznog indikatora ✅
`BeachDetailPanel.tsx`: bez ijedne prijave (stanje na ~840/844 plaža) umjesto praznog „Gužva sada:" stoji **„Još nitko nije javio gužvu — budi prvi."** (`Crowd.beFirst`, hr + en).

### 3. Parking — „Nepoznato" → „Nema podatka" ✅
`Parking.fee_unknown`: „Nepoznato" → **„Nema podatka"** (en: „Unknown" → „No data"). Vidljivo u legendi karte, panelu parkinga i retku „Naplata parkinga".

**Semantika filtera provjerena:** filter po naplati parkinga **ne postoji** u `BeachFilterState` — nema ga u UI-u ni u URL-serijalizaciji. Znači, nije bilo moguće da „besplatan parking" tiho uključi i `unknown`. Boja markera je već ranije riješena (`beachFilters.ts:72-73`). Ostala je bila samo formulacija.

### 4. IZOR datum uzorkovanja ✅ (bez izmjene — već je radilo)
SSG detalj-stranica koristi **isti** `BeachDetailPanel` (`variant="page"`, `initialSeaQuality` iz servera), a panel prikazuje `tSea('sampled')` s `sea.sampledAt`. Datum je dakle vidljiv i na `/hr/plaza/<slug>`, ne samo u panelu karte. Nalaz vijeća o „nedostajućem datumu" je i ovdje opovrgnut.

### 5. Dedup parkinga iz preklapajućih bboxeva ✅
- `seed-parking.ts`: `dedupePoints()` — ključ je koordinata na 5 decimala (~1 m), jer cache čuva samo `{lat,lng}` bez OSM id-a.
- `backfill-parking-fee.ts`: `dedupeFeePoints()` — ključ je **koordinata + `fee`**, a `charge` se spaja iz kopije koja ga ima.

**Oprez zabilježen u kodu:** dedup samo po koordinati bi zadržao prvu kopiju i bacio `charge` druge — to je točno kvar popravljen u `92db3d3` (Velika Raduča je izgubila cijenu). Zato `fee` ulazi u ključ, a `charge` se spaja.

---

## Verifikacija (sve prošlo)

| Provjera | Rezultat |
|---|---|
| `npx tsc --noEmit` | 0 grešaka |
| `npm run lint` | čisto |
| `npm run build` | zelen, **1710 SSG** stranica, 0 `MISSING_MESSAGE` |
| Paritet prijevoda | hr 320 = en 320, nula razlika u ključevima |
| `backfill-parking-fee.ts --dry --force` | 3756 → **3082** točaka nakon dedupa; ishod **identičan** bazi: free 157, paid 169, s cijenom 35 |

> 1710, a ne 1706 iz plana: Faza 3 je dodala `/privatnost` i `/uvjeti` na oba lokala (+4).

Dry-run je ključan dokaz: dedup uklanja 674 duplikata (18 %) i **ne mijenja nijedan upis** — brojke se poklapaju s onima izmjerenima izravno iz baze.

---

## Što ostaje Antoniju

1. **Vizualna provjera** (`npm run dev`):
   - Padajući „Sadržaji" → **Spasilac** je prigušen s oznakom „nema podataka" i ne može se uključiti.
   - Otvori bilo koju plažu → sekcija gužve kaže „Još nitko nije javio gužvu — budi prvi."
   - Legenda karte i panel parkinga → piše „Nema podatka" umjesto „Nepoznato".
2. **Push = deploy.** Commit Faze 4 je lokalan; ništa nije pushano. Uz njega čekaju i Faze 1–3 (`9ed3635`, `7ccc2c7`, `66967a2`) — ukupno 4 nepushana commita.
3. Iz ranijih faza i dalje visi: migracija `0012` (rate-limiting), repo secreti za keep-alive workflow, **rotacija Google OAuth client secreta**.

## Sljedeće (Faza 5 — trošak i izvedba)

- Klijentski resize/kompresija fotke prije uploada (canvas → webp, ~1600 px / ~300 kB) uz zadržanu serversku provjeru `MAX_PHOTO_BYTES`.
- Spojiti dvostruki 60 s polling gužve (`BeachExplorer.tsx` + `BeachDetailPanel.tsx`) u jedan izvor.
- Analitika: Vercel Analytics (free) ili Plausible.
