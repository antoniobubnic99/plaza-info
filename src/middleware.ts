import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Preskoči API rute, Next interne, i statične datoteke.
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};
