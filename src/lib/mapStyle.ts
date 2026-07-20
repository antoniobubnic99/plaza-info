// PlažaInfo — MapLibre stil karte.
// Default: OpenFreeMap "liberty" (vektorske pločice, BESPLATNO, bez ključa, dozvoljeno u produkciji).
// Override preko NEXT_PUBLIC_MAP_STYLE_URL (npr. MapTiler s ključem) ako zatreba.
const DEFAULT_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export function getMapStyleUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_STYLE_URL;
}

// Pilot regija: Srednja Dalmacija (Split i okolica).
export const PILOT_CENTER: [number, number] = [16.44, 43.51]; // [lng, lat]
export const PILOT_ZOOM = 9.5;
