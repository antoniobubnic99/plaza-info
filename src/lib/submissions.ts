// PlažaInfo — klijentski helper za slanje prijava (nova plaža / parking).
// Prijava se šalje serverski (/api/submissions) jer traži prijavljenog korisnika;
// upis ide preko service_role i ostaje 'pending' do moderacije u adminu.

import type { BeachAmenities, BeachFlags } from './beaches';

/** Prijava NOVE plaže sa svim podacima (surface je slobodan tekst — dopušta „other"). */
export interface SubmitBeachInput {
  kind: 'new_beach';
  nameHr: string;
  nameEn?: string;
  lat: number;
  lng: number;
  region?: string;
  municipality?: string;
  surface?: string;
  lengthM?: number;
  descriptionHr?: string;
  descriptionEn?: string;
  amenities: BeachAmenities;
  flags: BeachFlags;
  parkingLat?: number;
  parkingLng?: number;
  website?: string; // honeypot — botovi popune, ljudi ostave prazno
}

/** Prijava/ispravak parkinga za POSTOJEĆU plažu. */
export interface SubmitParkingInput {
  kind: 'parking';
  targetBeachId: string;
  parkingLat: number;
  parkingLng: number;
  website?: string; // honeypot
}

export type SubmitInput = SubmitBeachInput | SubmitParkingInput;

/** Ishod slanja: uspjeh, potreba za prijavom (401), ili opća greška. */
export type SubmitResult = { ok: true } | { ok: false; reason: 'auth' | 'error' };

/** Šalje prijavu. Vraća `{ok:true}` na 201; `reason:'auth'` na 401 (treba se prijaviti). */
export async function submitSubmission(input: SubmitInput): Promise<SubmitResult> {
  try {
    const res = await fetch('/api/submissions', {
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
