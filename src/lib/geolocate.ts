// Jednokratni dohvat korisnikove pozicije preko Geolocation API-ja.
// Dijeljeno između pretrage („U mojoj blizini") i forme za prijavu plaže
// („Lociraj me"), da logika i postavke ne žive u dvije kopije.

export interface GeoPoint {
  lat: number;
  lng: number;
}

export type GeoFailure = 'unsupported' | 'denied';

const GEO_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 10000 };

/**
 * Vraća poziciju ili baca `GeoFailure`.
 * `unsupported` = preglednik nema API; `denied` = korisnik odbio ili dohvat pao
 * (namjerno se ne razlikuju — poruka korisniku je ista, a razlog ne možemo popraviti).
 */
export function locateOnce(): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject('unsupported' as GeoFailure);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => reject('denied' as GeoFailure),
      GEO_OPTIONS,
    );
  });
}
