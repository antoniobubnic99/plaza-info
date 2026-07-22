// PlažaInfo — klijentski helper za slanje fotki plaža.
// Fotka se šalje serverski (/api/photos, multipart) jer RLS traži auth; upload ide
// preko service_role u javni Storage bucket i red ostaje 'pending' do moderacije.
import { MAX_PHOTO_BYTES, isAllowedPhotoType } from '@/lib/photoConfig';

export type SubmitPhotoResult = 'ok' | 'too_large' | 'unsupported' | 'error';

/** Šalje fotku. Predprovjera tipa/veličine pa POST; vraća ishod za UI poruku. */
export async function submitPhoto(beachId: string, file: File): Promise<SubmitPhotoResult> {
  if (!isAllowedPhotoType(file.type)) return 'unsupported';
  if (file.size === 0 || file.size > MAX_PHOTO_BYTES) return 'too_large';

  const form = new FormData();
  form.set('beachId', beachId);
  form.set('file', file);

  try {
    const res = await fetch('/api/photos', { method: 'POST', body: form });
    if (res.status === 201) return 'ok';
    if (res.status === 413) return 'too_large';
    if (res.status === 415) return 'unsupported';
    return 'error';
  } catch {
    return 'error';
  }
}
