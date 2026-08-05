'use client';

import { useRef, useState } from 'react';

// Pristanak na geolokaciju traži se PRIJE poziva Geolocation API-ja: preglednikov
// dijalog ne kaže zašto tražimo lokaciju ni što s njom radimo, a bez toga pristanak
// nije informiran. Pamti se lokalno da se ne pita na svaki klik.

const CONSENT_KEY = 'plaza_geo_consent';

export function hasGeoConsent(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(CONSENT_KEY) === 'granted';
  } catch {
    return false; // privatni način / blokirana pohrana → radije pitaj ponovno
  }
}

export function grantGeoConsent(): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, 'granted');
  } catch {
    /* pohrana nedostupna → pristanak vrijedi samo za ovu radnju */
  }
}

export interface GeoConsentGate {
  /** Je li dijalog trenutno otvoren. */
  asking: boolean;
  /** Pokreni radnju odmah (pristanak postoji) ili je odgodi do prihvaćanja. */
  withConsent: (run: () => void) => void;
  accept: () => void;
  decline: () => void;
}

/**
 * Vrata pred svakim pozivom geolokacije. Dijele ih pretraga („Blizu mene") i forma
 * za prijavu plaže („Lociraj me") — jedna logika, dva pozivatelja.
 */
export function useGeoConsent(): GeoConsentGate {
  const [asking, setAsking] = useState(false);
  const pendingRef = useRef<(() => void) | null>(null);

  function withConsent(run: () => void) {
    if (hasGeoConsent()) {
      run();
      return;
    }
    pendingRef.current = run;
    setAsking(true);
  }

  function accept() {
    grantGeoConsent();
    setAsking(false);
    const run = pendingRef.current;
    pendingRef.current = null;
    run?.();
  }

  function decline() {
    setAsking(false);
    pendingRef.current = null;
  }

  return { asking, withConsent, accept, decline };
}
