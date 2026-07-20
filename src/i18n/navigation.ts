import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Locale-aware zamjene za next/link i navigacijske hookove.
// Uvijek koristi ove umjesto next/navigation da se locale prefiks (/hr, /en) očuva.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
