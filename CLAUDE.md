# CLAUDE.md — PlažaInfo

Uputa za Claude Code pri radu na ovom repozitoriju.

## Što je PlažaInfo

Web aplikacija za pronalazak savršene plaže na Jadranu. Spaja tri sloja podataka:
1. Statični podaci o plažama (podloga, sadržaji, orijentacija).
2. Službena mjerenja kakvoće mora (IZOR) + vrijeme/more/UV (Open-Meteo).
3. Crowdsourced gužva uživo (Prazno / Umjereno / Krcato) — ključna diferencijacija.

v1.0 pokriva **pilot regiju** (Srednja Dalmacija) prije širenja. Dvojezično (HR default + EN) od prvog dana.

## IZOLACIJA — TVRDO PRAVILO

PlažaInfo je potpuno zaseban projekt i NE SMIJE se povezivati ni s jednim drugim projektom
(meridijan-vijesti, prijave-app, itd.). Vlastiti git repo, vlastiti Supabase projekt, vlastiti
Vercel projekt, vlastite env varijable. Nema dijeljenog koda ni importa iz drugih repozitorija.

## Komande

```bash
npm run dev      # Next.js dev server
npm run build    # produkcijski build
npm run start    # pokreni produkcijski build
npm run lint     # ESLint
```

## Tech stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS v4 (dizajn tokeni u `src/app/globals.css`)
- next-intl (HR/EN, routing `/hr` `/en`)
- Supabase (Postgres + PostGIS, Auth, Storage) — vlastiti projekt
- MapLibre GL JS (besplatne vektorske pločice)
- Open-Meteo (Marine + Forecast, bez ključa)
- Zod (validacija boundary inputa)

## Struktura

- `src/app/[locale]/` — stranice (locale-prefixed)
- `src/i18n/` — next-intl konfiguracija (routing, navigation, request)
- `messages/` — prijevodi (`hr.json`, `en.json`)
- `src/middleware.ts` — next-intl locale routing
- `scripts/` — seed skripte (Overpass + IZOR merge) — Faza 1

## Podatkovni izvori (v1.0)

- Kakvoća mora: IZOR "Vrtlac" (vrtlac.izor.hr) — uzorkovanje ~2 tjedna, NIJE real-time.
- Vrijeme/more/UV: Open-Meteo Marine + Forecast API (besplatno, bez ključa).
- Geometrija plaža + sadržaji: OpenStreetMap (Overpass API).

## Konvencije

- Sav UI tekst preko next-intl poruka (nikad hardkodiran) — HR i EN paralelno.
- Klijentske env varijable: prefiks `NEXT_PUBLIC_`.
- Boje gužve: `bg-crowd-empty` / `-moderate` / `-packed` (semantički tokeni).
