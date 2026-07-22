import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabaseServer';

// OAuth povratni URL: Google → Supabase → ovamo s ?code. Zamijeni code za sesiju
// (postavlja kolačiće) i vrati korisnika na stranicu s koje je krenuo (?next).
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';
  // Dopusti samo relativni interni put (spriječi open-redirect).
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';

  if (code) {
    const supabase = await getSupabaseServer();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(`${origin}${safeNext}`);
      }
    }
  }
  return NextResponse.redirect(`${origin}${safeNext}?auth_error=1`);
}
