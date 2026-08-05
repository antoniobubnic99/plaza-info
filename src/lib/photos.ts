// PlažaInfo — klijentski helper za slanje fotki plaža.
// Fotka se šalje serverski (/api/photos, multipart) jer RLS traži auth; upload ide
// preko service_role u javni Storage bucket i red ostaje 'pending' do moderacije.
import { MAX_PHOTO_BYTES, isAllowedPhotoType } from '@/lib/photoConfig';
import { MAX_SOURCE_BYTES, compressPhoto } from '@/lib/imageCompress';

/** `auth` = server je odbio jer nema prijave (401), nije kvar — traži drukčiju poruku. */
export type SubmitPhotoResult =
  | 'ok'
  | 'auth'
  | 'too_large'
  | 'unsupported'
  | 'rate_limited'
  | 'error';

/** Vrsta fotke (0010): galerija plaže ili fotka njezina parkinga. */
export type PhotoKind = 'beach' | 'parking';

/** Šalje fotku. Predprovjera tipa/veličine pa POST; vraća ishod za UI poruku. */
export async function submitPhoto(
  beachId: string,
  file: File,
  kind: PhotoKind = 'beach',
): Promise<SubmitPhotoResult> {
  if (!isAllowedPhotoType(file.type)) return 'unsupported';
  // Ulaz smije biti veći od `MAX_PHOTO_BYTES` — fotka s mobitela to redovito i jest;
  // kompresija je ta koja je mora spustiti ispod granice.
  if (file.size === 0 || file.size > MAX_SOURCE_BYTES) return 'too_large';

  const upload = await compressPhoto(file);
  // Kompresija je best-effort i može vratiti original → granica se provjerava na onome
  // što stvarno šaljemo (server ionako ponavlja istu provjeru).
  if (upload.size > MAX_PHOTO_BYTES) return 'too_large';

  const form = new FormData();
  form.set('beachId', beachId);
  form.set('kind', kind);
  form.set('file', upload);

  try {
    const res = await fetch('/api/photos', { method: 'POST', body: form });
    if (res.status === 201) return 'ok';
    if (res.status === 401) return 'auth';
    if (res.status === 413) return 'too_large';
    if (res.status === 415) return 'unsupported';
    if (res.status === 429) return 'rate_limited';
    return 'error';
  } catch {
    return 'error';
  }
}
