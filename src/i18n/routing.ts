import { defineRouting } from 'next-intl/routing';

// PlažaInfo je dvojezičan od prvog dana: hrvatski (default) + engleski.
// Turisti su ~pola publike, pa je EN prvorazredan, ne naknadna misao.
export const routing = defineRouting({
  locales: ['hr', 'en'],
  defaultLocale: 'hr',
});

export type Locale = (typeof routing.locales)[number];
