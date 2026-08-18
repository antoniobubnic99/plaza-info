# PlažaInfo — Google prijava (Supabase Auth) — setup koraci

Kod je **već u repou i deployan** (gumb „Prijava Google računom" u formama recenzija/fotki/prijava). Google provider je **uključen 2026-07-31** — koraci niže ostaju kao referenca za novo okruženje ili ponovno postavljanje.

> **Stanje od 2026-07-31:** prijava je **obavezna** za recenzije, fotografije i prijave plaža — bez sesije te rute vraćaju `401 auth_required`. **Gužva ostaje anonimna** (namjerno: prijava bi ubila najčešći, najbrži unos).

Grana `master`. Radni dir `C:\Users\anton\plaza-info`.

---

## Što je u kodu (gotovo)
- `@supabase/ssr` + `src/lib/supabaseBrowser.ts` (browser klijent) i `src/lib/supabaseServer.ts` (serverski, kolačić-sesija).
- `src/app/auth/callback/route.ts` — OAuth code-exchange → sesija u kolačiću.
- `src/components/auth/AuthButton.tsx` — gumb prijave/odjave (Google). Sakriva se ako Supabase env nije postavljen.
- `/api/reviews`, `/api/photos` i `/api/submissions` — **traže prijavu**: bez sesije vraćaju `401 auth_required`, inače vežu unos uz `user_id`. (`/api/photos` provjerava sesiju **prije** uploada, da odbijeni pokušaj ne ostavi bajtove u Storageu.) `user_id` je i dalje nullable zbog ranije upisanih anonimnih redova.
- `src/lib/useAuthUser.ts` — zajednički hook za stanje sesije na klijentu; forme preko njega onemogućuju slanje dok korisnik nije prijavljen.
- RLS je **već** spreman (`supabase/migrations/0002_rls.sql`: `reviews/photos insert own` uz `auth.uid() = user_id`). **Nova DB migracija nije potrebna.**

---

## Korak 1 — Google Cloud Console (OAuth credentials)
1. https://console.cloud.google.com → kreiraj/odaberi projekt.
2. **APIs & Services → OAuth consent screen** → External → popuni ime app-a, support email, developer email. (Za testiranje dovoljno „Testing".)
3. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.**
4. **Authorized redirect URIs** — dodaj Supabase callback:
   ```
   https://qlcukvafzdttjqfpjypl.supabase.co/auth/v1/callback
   ```
5. Spremi → kopiraj **Client ID** i **Client secret**.

## Korak 2 — Supabase dashboard (upali Google provider)
1. https://supabase.com/dashboard → PlažaInfo projekt (vlastita organizacija; ref projekta stoji
   u `NEXT_PUBLIC_SUPABASE_URL`).
2. **Authentication → Sign In / Providers → Google** → Enable → zalijepi **Client ID** + **Client secret** → Save.
   *(Supabase je izbornik preimenovao iz „Providers"; NE traži „OAuth Apps" ni „OAuth Server" — to je obrnuti smjer, gdje Supabase glumi davatelja prijave drugim aplikacijama.)*
3. **Authentication → URL Configuration:**
   - **Site URL:** `https://plaza-info.vercel.app` (ili nova domena kad je spojiš).
   - **Redirect URLs (Additional):** dodaj `https://plaza-info.vercel.app/**` i za lokalni dev `http://localhost:3000/**`.

## Korak 3 — provjera
- Otvori bilo koju plažu → sekcija Recenzije/Fotografije → klikni **„Prijava Google računom"** → Google login → vratiš se prijavljen (vidi se email + „Odjava").
- Ostavi recenziju/fotku → u bazi `reviews.user_id` / `photos.user_id` sada je tvoj auth UID (ne null). Moderacija (PIN admin) radi isto kao prije.
- Odjavi se pa pokušaj ponovno → gumb slanja je onemogućen uz poruku „Prijavi se Google računom da pošalješ.", a izravan POST vraća `401`.

---

## Napomene
- **Ako Google provider ikad padne**, recenzije i fotke prestaju primati unos (po dizajnu — 401). Gužva radi dalje jer je namjerno ostala anonimna.
- **Sesija bez middleware refresh-a:** v1 ne osvježava token kroz middleware; sesija traje do isteka access-tokena pa se korisnik po potrebi ponovno prijavi. Dovoljno za atribuciju; refresh se može dodati kasnije.
- **Storage:** foto-bajtovi se i dalje uploadaju serverski (service_role) — puni prelazak na korisnički Storage upload traži Storage RLS politike (zaseban korak), nije nužno za atribuciju.
