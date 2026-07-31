import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { AUTH_NEXT_COOKIE, safeInternalPath } from './lib/authRedirect';

const intlMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  const { searchParams, pathname } = request.nextUrl;
  const code = searchParams.get('code');

  // Spasilac za OAuth povratak koji je promašio `/auth/callback`. Supabase vraća
  // korisnika na Site URL kad `redirectTo` nije na popisu dopuštenih (npr.
  // `http://localhost:3000/?code=…`), pa bi `?code` završio na naslovnici gdje ga
  // nitko ne zamjenjuje za sesiju — korisnik ostane odjavljen, bez ikakve poruke.
  // Prebacujemo ga na callback rutu i vraćamo na stranicu s koje je krenuo.
  if (code) {
    const back = safeInternalPath(request.cookies.get(AUTH_NEXT_COOKIE)?.value, pathname);
    const url = request.nextUrl.clone();
    url.pathname = '/auth/callback';
    url.search = '';
    url.searchParams.set('code', code);
    url.searchParams.set('next', back);
    return NextResponse.redirect(url);
  }

  return intlMiddleware(request);
}

export const config = {
  // Preskoči API rute, `/auth/*` (OAuth callback NE smije dobiti locale prefiks —
  // next-intl bi ga preusmjerio na `/hr/auth/callback`, gdje rute nema), Next
  // interne i statične datoteke.
  matcher: '/((?!api|auth|_next|_vercel|.*\\..*).*)',
};
