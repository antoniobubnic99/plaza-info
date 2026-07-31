// Zajedničko za povratak s Google prijave: middleware, callback ruta i klijentski
// hook moraju se slagati oko imena kolačića i oko toga što je siguran povratni put.

/**
 * Put s kojeg je korisnik krenuo u prijavu. Postavlja ga klijent prije OAuth
 * preusmjeravanja, čita ga middleware kad se korisnik vrati. Kolačić (ne
 * localStorage) jer se čita na serveru, prije nego što se išta izvrši u pregledniku.
 */
export const AUTH_NEXT_COOKIE = 'pi_auth_next';

/** Koliko kolačić živi — dovoljno za Google round-trip, prekratko da zaluta. */
export const AUTH_NEXT_MAX_AGE = 600; // 10 min

/**
 * Propušta samo relativni interni put (spriječi open-redirect preko `?next=`).
 * `//host` je namjerno odbijen — preglednik bi ga pročitao kao vanjski URL.
 */
export function safeInternalPath(value: string | null | undefined, fallback = '/'): string {
  if (!value) return fallback;
  return value.startsWith('/') && !value.startsWith('//') ? value : fallback;
}
