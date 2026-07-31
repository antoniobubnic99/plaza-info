// PlažaInfo — klijentski helper za slanje fotki plaža.
// Fotka se šalje serverski (/api/photos, multipart) jer RLS traži auth; upload ide
// preko service_role u javni Storage bucket i red ostaje 'pending' do moderacije.
import { MAX_PHOTO_BYTES, isAllowedPhotoType } from '@/lib/photoConfig';

/** `auth` = server je odbio jer nema prijave (401), nije kvar — traži drukčiju poruku. */
export type SubmitPhotoResult = 'ok' | 'auth' | 'too_large' | 'unsupported' | 'error';

/** Vrsta fotke (0010): galerija plaže ili fotka njezina parkinga. */
export type PhotoKind = 'beach' | 'parking';

/** Šalje fotku. Predprovjera tipa/veličine pa POST; vraća ishod za UI poruku. */
export async function submitPhoto(
  beachId: string,
  file: File,
  kind: PhotoKind = 'beach',
): Promise<SubmitPhotoResult> {
  if (!isAllowedPhotoType(file.type)) return 'unsupported';
  if (file.size === 0 || file.size > MAX_PHOTO_BYTES) return 'too_large';

  const form = new FormData();
  form.set('beachId', beachId);
  form.set('kind', kind);
  form.set('file', file);

  try {
    const res = await fetch('/api/photos', { method: 'POST', body: form });
    if (res.status === 201) return 'ok';
    if (res.status === 401) return 'auth';
    if (res.status === 413) return 'too_large';
    if (res.status === 415) return 'unsupported';
    return 'error';
  } catch {
    return 'error';
  }
}
