// PlažaInfo — klijentski helper za slanje recenzija.
// Recenzija se šalje serverski (/api/reviews) jer RLS traži auth; upis ide preko
// service_role i ostaje 'pending' do moderacije.

export interface SubmitReviewInput {
  beachId: string;
  rating: number; // 1–5
  body?: string;
}

/**
 * Ishod slanja. `auth` je odvojen od `error` jer traži drukčiju poruku: nije kvar
 * nego poziv na prijavu (isti oblik kao kod prijava plaža u `submissions.ts`).
 */
export type SubmitReviewResult = { ok: true } | { ok: false; reason: 'auth' | 'error' };

/** Šalje recenziju. `{ok:true}` na 201; `reason:'auth'` na 401 (treba se prijaviti). */
export async function submitReview(input: SubmitReviewInput): Promise<SubmitReviewResult> {
  try {
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (res.status === 201) return { ok: true };
    if (res.status === 401) return { ok: false, reason: 'auth' };
    return { ok: false, reason: 'error' };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
