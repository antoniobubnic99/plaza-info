# PlažaInfo — Google prijava (Supabase Auth) — setup koraci

Kod je **već u repou i deployan** (aditivno: gumb „Prijava Google računom" u formama recenzija/fotki). Prijava **ne radi dok ne odradiš 2 dashboard koraka niže** — do tada anonimni unos radi normalno (ništa nije slomljeno).

Grana `master`. Radni dir `C:\Users\anton\plaza-info`.

---

## Što je u kodu (gotovo)
- `@supabase/ssr` + `src/lib/supabaseBrowser.ts` (browser klijent) i `src/lib/supabaseServer.ts` (serverski, kolačić-sesija).
- `src/app/auth/callback/route.ts` — OAuth code-exchange → sesija u kolačiću.
- `src/components/auth/AuthButton.tsx` — gumb prijave/odjave (Google). Sakriva se ako Supabase env nije postavljen.
- `/api/reviews` i `/api/photos` — **aditivno** vežu unos uz `user_id` kad je korisnik prijavljen (inače `user_id = null`, kao dosad).
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
1. https://supabase.com/dashboard → projekt `qlcukvafzdttjqfpjypl` (račun „btoni159@gmail.com's Org").
2. **Authentication → Providers → Google** → Enable → zalijepi **Client ID** + **Client secret** → Save.
3. **Authentication → URL Configuration:**
   - **Site URL:** `https://plaza-info.vercel.app` (ili nova domena kad je spojiš).
   - **Redirect URLs (Additional):** dodaj `https://plaza-info.vercel.app/**` i za lokalni dev `http://localhost:3000/**`.

## Korak 3 — provjera
- Otvori bilo koju plažu → sekcija Recenzije/Fotografije → klikni **„Prijava Google računom"** → Google login → vratiš se prijavljen (vidi se email + „Odjava").
- Ostavi recenziju/fotku → u bazi `reviews.user_id` / `photos.user_id` sada je tvoj auth UID (ne null). Moderacija (PIN admin) radi isto kao prije.

---

## Napomene
- **Nije lomljivo:** dok Google nije postavljen, gumb pokuša prijavu i tiho ne uspije; anonimni unos i dalje prolazi. Kad poželiš **obavezan** login (bez anonimnog unosa), reci — to je mala izmjena u `/api/reviews` i `/api/photos` (odbij unos ako `user_id == null`).
- **Sesija bez middleware refresh-a:** v1 ne osvježava token kroz middleware; sesija traje do isteka access-tokena pa se korisnik po potrebi ponovno prijavi. Dovoljno za atribuciju; refresh se može dodati kasnije.
- **Storage:** foto-bajtovi se i dalje uploadaju serverski (service_role) — puni prelazak na korisnički Storage upload traži Storage RLS politike (zaseban korak), nije nužno za atribuciju.
