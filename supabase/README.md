# Supabase — PlažaInfo

Baza podataka za PlažaInfo. **IZOLACIJA:** ove migracije primjenjuju se ISKLJUČIVO na
Supabase projekt `PlazaInfo` — nikad na `MeridijanVijesti`, `prijave-app` ni bilo koji drugi projekt.

## Status

Cloud projekt još NIJE kreiran (Supabase free-tier je pun: 2/2 projekta). Migracije se drže lokalno
u `migrations/` i primijenit će se kad se oslobodi slot ili se organizacija nadogradi na Pro.

## Migracije

| Datoteka | Sadržaj |
|---|---|
| `0001_init.sql` | Extension PostGIS, enumi, tablice, indeksi, updated_at trigger |
| `0002_rls.sql` | RLS politike + grantovi |
| `0003_functions.sql` | `beaches_geo` view, `beaches_near`, `beach_crowd_summary`, `latest_crowd_levels` |

## Primjena (kad baza postoji)

Redom, kroz Supabase MCP `apply_migration` ili `supabase db push` (CLI). Zatim seed
(`scripts/seed-beaches.ts`, Faza 1) i provjera advisora (`get_advisors`) za sigurnost/performanse.

## Model (sažetak)

- `beaches` — statični podaci + `location geography(Point,4326)`; `amenities`/`flags` kao JSONB.
- `sea_quality` — službena kakvoća mora po datumu uzorka.
- `crowd_reports` — one-tap prijave gužve (upis preko servera, geofence).
- `checkins` — povijest za v2 predikcije.
- `reviews` / `photos` — moderirani korisnički sadržaj (`pending` → `approved`).
- `favorites` — po korisniku ili uređaju.

Enum `crowd_level` = `empty | moderate | packed` (UI prevodi: Prazno / Umjereno / Krcato).
