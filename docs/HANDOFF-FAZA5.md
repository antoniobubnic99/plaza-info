# Faza 5 — trošak i izvedba (2026-08-05)

Zadnja faza plana `1-napi-i-mi-sve-breezy-puddle.md` (dio B). Tri stavke, sve tri odrađene.

---

## 1. Spojen dvostruki 60 s polling gužve

**Problem:** `BeachExplorer` i `BeachDetailPanel` imali su svaki svoj `setInterval(60_000)`
nad istim RPC-om `latest_crowd_levels`. Otvoren panel = **dva identična zahtjeva u minuti**
po korisniku, a panel je uz to dohvaćao cijelu mapu svih plaža da bi iz nje uzeo jedan redak.

**Rješenje:** novi `src/lib/crowdStore.ts` — modul-level izvor s `useSyncExternalStore`:

- jedan interval koji se pokreće na **prvom** pretplatniku i gasi na **zadnjem**;
- pretplatnik koji se priključi kasnije (otvaranje panela) odmah dobije zadnji snimak,
  **bez novog zahtjeva**;
- `inFlight` zastavica — spor odgovor ne nagomilava zahtjeve;
- `isSame()` usporedba prije objave: identična mapa ne stvara novu referencu, pa se markeri
  ne re-renderiraju svakih 60 s bez potrebe (ovo je prije bio nepotreban render);
- kvar mreže zadržava zadnje poznato stanje umjesto da isprazni prikaz.

**Bonus koji je ispao iz refaktora:** `setLocalCrowdLevel()` — nakon uspješne prijave gužve
marker na karti se oboji **odmah**. Prije je panel imao vlastiti `setCrowd(level)` koji karta
nije vidjela do idućeg ciklusa.

Izmijenjeno: `BeachExplorer.tsx` (uklonjen `useState` + `useEffect`, sad `useCrowdLevels()`),
`BeachDetailPanel.tsx` (uklonjen `useState` + `useEffect`, `crowd` je izveden iz izvora).

## 2. Klijentska kompresija fotke prije uploada

**Problem:** fotka s mobitela je 3–8 MB i išla je u Supabase Storage kakva jest. Plaća se
dvaput — pohrana i egress pri svakom prikazu.

**Rješenje:** novi `src/lib/imageCompress.ts`, `compressPhoto(file)`:

- `createImageBitmap(file, { imageOrientation: 'from-image' })` → poštuje EXIF rotaciju;
- smanjenje na dužu stranicu **1600 px**, crtanje na canvas, `toBlob('image/webp', q)`;
- ljestvica kvalitete `0.82 → 0.7 → 0.6 → 0.5`, staje na prvoj koja stane u **300 kB**;
- **best-effort**: na bilo kakvom kvaru (nepodržan format, neuspjelo dekodiranje, nema
  canvasa, rezultat veći od originala) vraća **original** — nitko ne ostane bez uploada
  zato što optimizacija nije uspjela;
- ekstenzija izlaza ide iz **stvarnog** `blob.type`, ne iz pretpostavke: preglednik bez
  WebP enkodera tiho vrati PNG, pa bi `.webp` ime bilo laž.

Ugrađeno u `src/lib/photos.ts` → `submitPhoto()`, što je **jedina** točka kroz koju prolaze
oba pozivatelja (`PhotosSection` i `SubmitBeachForm`).

**Granice:** ulaz smije biti do `MAX_SOURCE_BYTES` (= 5 × `MAX_PHOTO_BYTES` = 25 MB) jer
fotka s mobitela redovito prelazi 5 MB — kompresija je ta koja je mora spustiti. Ono što se
**stvarno šalje** i dalje se provjerava protiv `MAX_PHOTO_BYTES`, a serverska provjera u
`/api/photos` je **netaknuta** (ostaje `MAX_PHOTO_BYTES`, kako plan i traži).

Zbog toga su prepravljene poruke koje su korisniku spominjale „najviše 5 MB" — ta brojka mu
više nije istina koju vidi. Nove poruke ne navode broj (`Photos.tooLarge`,
`SubmitBeach.photo_too_large`, hr + en). **Nijedan ključ nije dodan ni uklonjen.**

## 3. Analitika

`@vercel/analytics` (free), `<Analytics />` u `src/app/[locale]/layout.tsx`.

Odabran **umjesto** Plausiblea jer je na Vercelu besplatan i bez vlastite infrastrukture.
Bez kolačića, bez profiliranja, ništa se ne piše na uređaj → po ePrivacy nema čemu pristajati,
pa **nema bannera**. Postojeći obrazac pristanka (`geoConsent`) ostaje ondje gdje se osobni
podatak stvarno traži — na geolokaciji.

**Obavezna posljedica:** politika privatnosti je do sada tvrdila *„Nemamo analitiku"*. Ta je
rečenica ovom izmjenom postala neistinita, pa je prepravljena:

- `Privacy.cookiesBody` (hr + en) — sada opisuje što se mjeri (koja stranica, s koje
  poveznice, vrsta uređaja, država), da je agregirano i zašto nema bannera;
- `Privacy.sharingVercel` (hr + en) — Vercel više nije samo hosting nego i statistika.

`LEGAL_UPDATED` u `src/lib/legal.ts` je već `2026-08-05` = datum ove izmjene, pa ostaje kakav jest.

---

## Verifikacija (sve zeleno)

| Provjera | Ishod |
|---|---|
| `npx tsc --noEmit` | 0 grešaka |
| `npm run lint` | čisto |
| `npm run build` | zelen, **1710 SSG** (nepromijenjeno) |
| `MISSING_MESSAGE` | 0 |
| i18n paritet hr = en | **320 = 320**, nula ključeva samo u jednom jeziku |

## Što Antonio još mora ručno

Prenosi se iz Faze 1–4, **nije riješeno ovdje**:

1. **Repo secreti** (Settings → Secrets → Actions): `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   opcionalno `SITE_URL` — bez njih keep-alive workflow iz Faze 1 ne radi.
2. **Rotirati Google OAuth client secret** (Faza 0, još stoji).
3. **Uključiti Analytics u Vercel dashboardu** za projekt (Analytics tab → Enable).
   Paket sam po sebi ne uključuje prikupljanje.
4. **Vizualna provjera prije pusha** (push = deploy): `/hr/privatnost` odjeljak 5,
   upload fotke, prijava gužve.

## Ručni testovi iz plana koje treba odraditi u pregledniku

- **Fotka:** upload originala od ~4 MB → objekt u Storageu **< 500 kB**.
- **Polling:** otvoren panel plaže → u Network tabu **jedan** poziv `latest_crowd_levels`
  na 60 s, ne dva.
