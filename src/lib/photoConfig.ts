// PlažaInfo — dijeljene konstante za fotke plaža (upload API, admin, bucket skripta).
// Bez server-only ovisnosti da se može importati i u klijentske helpere.

/** Javno-čitljiv Storage bucket za fotke plaža. */
export const PHOTO_BUCKET = 'beach-photos';

/** Maksimalna veličina uploada (5 MB). */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Dozvoljeni MIME tipovi → ekstenzija datoteke u Storageu. */
export const ALLOWED_PHOTO_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** True ako je MIME tip dozvoljen za upload. */
export function isAllowedPhotoType(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(ALLOWED_PHOTO_TYPES, type);
}

/**
 * Izvlači Storage putanju (`{beachId}/{uuid}.{ext}`) iz javnog URL-a.
 * Vraća null ako URL ne pripada našem bucketu. Koristi se za brisanje pri odbijanju.
 */
export function pathFromPublicUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${PHOTO_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  const path = url.slice(idx + marker.length);
  return path.length > 0 ? decodeURIComponent(path) : null;
}
