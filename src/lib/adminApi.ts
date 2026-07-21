// PlažaInfo — klijentski helperi za admin/moderaciju. Samo fetch; token se čuva
// u localStorage. Nikad ne importa server-only kod.

export const ADMIN_TOKEN_KEY = 'pi_admin_token';

export interface PendingReview {
  id: string;
  rating: number;
  body: string | null;
  created_at: string;
  beach: { slug: string; name_hr: string; name_en: string } | null;
}

export type ModerateAction = 'approve' | 'reject';

/** Bacamo je kad server vrati 401 — poziv sloj briše token i traži ponovnu prijavu. */
export class UnauthorizedError extends Error {}

/** Razmjenjuje PIN za token. Vraća null na neuspjeh (npr. krivi PIN). */
export async function loginWithPin(pin: string): Promise<string | null> {
  const res = await fetch('/api/admin/verify-pin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { token?: string };
  return data.token ?? null;
}

/** Dohvaća recenzije na čekanju. Baca UnauthorizedError na 401. */
export async function fetchPending(token: string): Promise<PendingReview[]> {
  const res = await fetch('/api/admin/reviews', {
    headers: { 'x-admin-token': token },
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error('list_failed');
  const data = (await res.json()) as { reviews: PendingReview[] };
  return data.reviews;
}

/** Odobrava/odbija recenziju. Baca UnauthorizedError na 401. */
export async function moderate(
  token: string,
  id: string,
  action: ModerateAction,
): Promise<void> {
  const res = await fetch('/api/admin/reviews', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
    body: JSON.stringify({ id, action }),
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error('moderate_failed');
}
