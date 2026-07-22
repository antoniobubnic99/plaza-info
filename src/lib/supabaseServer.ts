import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// Serverski Supabase klijent vezan uz kolačiće zahtjeva (@supabase/ssr).
// Koristi se u route-handlerima / server-komponentama za ČITANJE prijavljenog
// korisnika (auth.getUser()) i OAuth code-exchange. Anon/publishable ključ —
// kad je korisnik prijavljen, njegov JWT iz kolačića ide kao Bearer (RLS aktivan).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function getSupabaseServer() {
  if (!url || !anonKey) return null;
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Pozvano iz Server Componente (kolačići read-only) — sesiju osvježava
          // callback/route-handler; ovdje je sigurno ignorirati.
        }
      },
    },
  });
}
