'use client';

// PlažaInfo — klijentska kompresija fotke prije uploada.
//
// Fotka s mobitela je tipično 3–8 MB. Bez ovoga svaki original ide u Supabase Storage
// i s njega se poslije servira svakom posjetitelju — trošak je i pohrana i egress.
// Ovdje se slika smanji na ~1600 px i prekodira u WebP, pa ista fotka u praksi padne
// na nekoliko stotina kilobajta. Serverska provjera `MAX_PHOTO_BYTES` ostaje netaknuta:
// ovo je optimizacija, ne zamjena za validaciju.

import { ALLOWED_PHOTO_TYPES, MAX_PHOTO_BYTES } from './photoConfig';

/** Duža stranica nakon smanjenja. Dovoljno za prikaz preko cijele širine na retini. */
const MAX_EDGE = 1600;

/** Ciljna veličina; ispod nje se prestaje snižavati kvaliteta. */
const TARGET_BYTES = 300 * 1024;

/** Ljestvica kvalitete — staje na prvoj koja stane u `TARGET_BYTES`. */
const QUALITY_STEPS = [0.82, 0.7, 0.6, 0.5];

/**
 * Gornja granica ulazne datoteke koju uopće pokušavamo komprimirati. Iznad ovoga
 * dekodiranje bi nepotrebno blokiralo karticu, a i uz najjaču kompresiju rezultat
 * rijetko stane u `MAX_PHOTO_BYTES`.
 */
export const MAX_SOURCE_BYTES = 5 * MAX_PHOTO_BYTES;

function canUseCanvas(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof createImageBitmap === 'function' &&
    typeof HTMLCanvasElement !== 'undefined'
  );
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Smanjuje i prekodira fotku. Best-effort: na bilo kakvom kvaru (nepodržan format,
 * neuspjelo dekodiranje, nedostupan canvas) vraća **original** — korisnik nikad ne
 * ostane bez uploada zato što optimizacija nije uspjela.
 */
export async function compressPhoto(file: File): Promise<File> {
  if (!canUseCanvas()) return file;
  // Već malena datoteka — prekodiranje bi je moglo i povećati.
  if (file.size <= TARGET_BYTES) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file; // nije slika koju preglednik zna dekodirati
  }

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    let best: Blob | null = null;
    for (const quality of QUALITY_STEPS) {
      const blob = await toBlob(canvas, 'image/webp', quality);
      if (!blob) break;
      best = blob;
      if (blob.size <= TARGET_BYTES) break;
    }

    // Preglednik bez WebP enkodera tiho vrati PNG — zato ekstenzija ide iz stvarnog
    // tipa bloba, ne iz pretpostavke. Takav PNG je uz to obično veći od originala,
    // pa ga provjera veličine ispod svejedno odbaci.
    const ext = best ? ALLOWED_PHOTO_TYPES[best.type] : undefined;
    if (!best || !ext) return file;
    if (best.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([best], `${base}.${ext}`, { type: best.type, lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}
