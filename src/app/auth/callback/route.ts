import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { AUTH_NEXT_COOKIE, safeInternalPath } from '@/lib/authRedirect';

// OAuth povratni URL: Google → Supabase → ovamo s ?code. Zamijeni code za sesiju
// (postavlja kolačiće) i vrati korisnika na stranicu s koje je krenuo (?next).
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // Povratni put: `?next` iz URL-a, inače kolačić koji je klijent ostavio prije
  // prijave (kad Supabase promaši ovu rutu, `next` postavlja middleware).
  const stored = (await cookies()).get(AUTH_NEXT_COOKIE)?.value;
  const safeNext = safeInternalPath(
    searchParams.get('next') ?? (stored ? decodeURIComponent(stored) : null),
  );

  // Kolačić je jednokratan — obriši ga bez obzira na ishod, da idući povratak ne
  // odveze korisnika na stranicu od prošli put.
  const done = (target: string) => {
    const res = NextResponse.redirect(`${origin}${target}`);
    res.cookies.delete(AUTH_NEXT_COOKIE);
    return res;
  };

  if (code) {
    const supabase = await getSupabaseServer();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return done(safeNext);
      }
    }
  }
  return done(`${safeNext}?auth_error=1`);
}
