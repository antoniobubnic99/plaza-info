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

export interface PendingPhoto {
  id: string;
  url: string;
  created_at: string;
  beach: { slug: string; name_hr: string; name_en: string } | null;
}

/** Dohvaća fotke na čekanju. Baca UnauthorizedError na 401. */
export async function fetchPendingPhotos(token: string): Promise<PendingPhoto[]> {
  const res = await fetch('/api/admin/photos', {
    headers: { 'x-admin-token': token },
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error('list_failed');
  const data = (await res.json()) as { photos: PendingPhoto[] };
  return data.photos;
}

/** Odobrava/odbija fotku. Baca UnauthorizedError na 401. */
export async function moderatePhoto(
  token: string,
  id: string,
  action: ModerateAction,
): Promise<void> {
  const res = await fetch('/api/admin/photos', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
    body: JSON.stringify({ id, action }),
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error('moderate_failed');
}

/** Prijava na čekanju (nova plaža ili parking za postojeću). */
export interface PendingSubmission {
  id: string;
  kind: 'new_beach' | 'parking';
  name_hr: string | null;
  name_en: string | null;
  lat: number | null;
  lng: number | null;
  region: string | null;
  municipality: string | null;
  surface: string | null;
  length_m: number | null;
  description_hr: string | null;
  description_en: string | null;
  amenities: Record<string, boolean> | null;
  flags: Record<string, boolean> | null;
  parking_lat: number | null;
  parking_lng: number | null;
  parking_fee_status: 'free' | 'paid' | 'unknown' | null; // null = korisnik nije odgovorio
  parking_price_text: string | null;
  parking_note: string | null;
  /** Ocjena prijavitelja (0011); odobrenjem prijave postaje recenzija. */
  rating: number | null;
  created_at: string;
  // PostgREST vraća relaciju kao objekt, supabase-js je tipizira kao niz — pokrij oba.
  beach:
    | { slug: string; name_hr: string; name_en: string }
    | { slug: string; name_hr: string; name_en: string }[]
    | null;
}

/** Dohvaća prijave na čekanju. Baca UnauthorizedError na 401. */
export async function fetchPendingSubmissions(token: string): Promise<PendingSubmission[]> {
  const res = await fetch('/api/admin/submissions', {
    headers: { 'x-admin-token': token },
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error('list_failed');
  const data = (await res.json()) as { submissions: PendingSubmission[] };
  return data.submissions;
}

/** Odobrava/odbija prijavu. Baca UnauthorizedError na 401. */
export async function moderateSubmission(
  token: string,
  id: string,
  action: ModerateAction,
): Promise<void> {
  const res = await fetch('/api/admin/submissions', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
    body: JSON.stringify({ id, action }),
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error('moderate_failed');
}
