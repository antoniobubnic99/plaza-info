# PlažaInfo — which Adriatic beach to go to, decided before you leave

**Live:** [plaza-info.vercel.app](https://plaza-info.vercel.app) · Next.js 16 · TypeScript · Supabase (PostgreSQL + PostGIS) · MapLibre

Croatian beach listings are either tourist-board marketing or a pin on a map. Neither answers
what a person actually asks on the morning of a beach day: is the water clean, is there shade,
can I park, will it be packed, can I bring the dog. PlažaInfo answers those on one screen,
using official sea-quality data, OpenStreetMap amenities and reports from people already there.

---

## Features

- **Sea quality from the official source** — the latest sampling result per beach, imported
  from the Croatian Institute of Oceanography and Fisheries (IZOR), not a guess
- **Filters that match how people choose** — surface type (sand, pebble, rock, concrete),
  showers, WC, bar, loungers, lifeguard, dogs allowed, naturist, wheelchair accessible,
  minimum rating, sea assessment
- **Parking as a first-class object** — location, distance, and whether it is paid
- **Crowd level** — a single lightweight poll per visit rather than continuous tracking
- **User submissions** — anyone can propose a new beach or car park with a photo and a rating;
  everything passes through a moderation queue before it becomes visible
- **Photos** — client-side compression to WebP before upload, with source and attribution recorded
- **Bilingual** — Croatian and English via `next-intl`

## Tech stack

| Layer | Technology | Why |
|---|---|---|
| Framework | Next.js 16 (App Router), React 19 | Server components render beach pages ready for search engines |
| Language | TypeScript (strict) | Beach, amenity and sea-quality shapes are shared between map, list and API |
| Database | Supabase / PostgreSQL + PostGIS | Geographic queries ("beaches near me") belong in the database |
| Map | MapLibre GL | Vector tiles, no proprietary map SDK |
| Validation | zod | Every public endpoint validates its payload before it reaches the database |
| i18n | next-intl | `[locale]` routing for hr/en |
| Analytics | Vercel Analytics | Loaded only where the privacy policy says it is |

## Architecture

```
IZOR (sea quality) ─┐
OpenStreetMap       ├─► scripts/seed-*.ts ─► Supabase (beaches, amenities, parking)
photos / reviews   ─┘                              │
                                                   ▼
user ──► /[locale] ──► filters + MapLibre ──► /plaza/[slug]
  │
  └──► /prijava (submission) ──► moderation queue ──► /admin (PIN) ──► published
```

Pure logic is deliberately kept out of components: filtering, sorting and visual flags live in
[`src/lib/beachFilters.ts`](src/lib/beachFilters.ts) with no React or DOM dependency, so the
list view and the map view share one implementation. Data import is a set of idempotent
scripts in [`scripts/`](scripts) — re-running a seed never duplicates rows.

## Database

**12 migrations** in [`supabase/migrations/`](supabase/migrations):

| Migration | What it establishes |
|---|---|
| `0001_init.sql` | Beaches, amenities, photos, reviews |
| `0002_rls.sql` | Row-level security and grants — anonymous users read, only moderated writes land |
| `0003_functions.sql` | Views and functions, including the geo view the map reads |
| `0005_rating_aggregate.sql` | Aggregate rating computed from approved reviews only |
| `0006_parking.sql`, `0010_parking_fee.sql` | Parking promoted from a coordinate to a full entity with a fee status |
| `0008_sea_latest.sql` | Latest official IZOR assessment per beach, denormalised into the geo view so the map renders in one query |
| `0009_submissions.sql`, `0011_submission_rating.sql` | User submissions with moderation state |
| `0012_rate_limits.sql` | Rate limiting for public API routes, enforced in the database |

## Testing & QA

The public surface is small but hostile — anonymous users can submit content and upload images
— so verification concentrates there:

- **Authorisation** — anonymous, authenticated and admin paths checked against the RLS policies
  in `0002_rls.sql`; a submission must never appear before moderation
- **Rate limiting** — `0012_rate_limits.sql` exercised by exceeding the limit on
  `/api/submissions`, `/api/reviews`, `/api/photos` and `/api/crowd`
- **Input validation** — every route parses its body with zod before touching the database
- **Health endpoint** — `/api/health` used for uptime monitoring
- **Seed idempotency** — every script in `scripts/` is run twice and must produce no duplicates

```bash
npm run lint
npm run build          # type errors fail the build
```

## Running locally

```bash
git clone https://github.com/antoniobubnic99/plaza-info.git
cd plaza-info
npm install
cp .env.example .env.local     # Supabase URL + keys, map style URL, admin PIN
npm run dev                    # http://localhost:3000
```

Apply `supabase/migrations/*.sql` in order, then seed with the scripts in `scripts/`
(`seed-beaches`, `seed-amenities`, `seed-parking`, `fetch-izor`, `seed-sea-quality`).
Open-Meteo's marine and forecast APIs need no key.

## Project status

Live. Sea quality, parking, submissions and moderation are all in production.

---

MIT licensed — see [LICENSE](LICENSE).
