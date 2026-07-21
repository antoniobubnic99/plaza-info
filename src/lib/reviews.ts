// PlažaInfo — klijentski helper za slanje recenzija.
// Recenzija se šalje serverski (/api/reviews) jer RLS traži auth; upis ide preko
// service_role i ostaje 'pending' do moderacije.

export interface SubmitReviewInput {
  beachId: string;
  rating: number; // 1–5
  body?: string;
}

/** Šalje recenziju. Vraća true na uspjeh (201). */
export async function submitReview(input: SubmitReviewInput): Promise<boolean> {
  try {
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return res.status === 201;
  } catch {
    return false;
  }
}
