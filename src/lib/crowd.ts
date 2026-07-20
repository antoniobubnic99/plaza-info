// PlažaInfo — klijentski helperi za prijavu gužve.
// Upis ide preko servera (/api/crowd → service_role); čitanje preko queries.getLatestCrowdLevels.
import type { CrowdLevel } from './beaches';

const DEVICE_KEY = 'plaza_device_hash';

/** Stabilni anonimni identifikator uređaja (anti-spam), perzistiran u localStorage. */
export function getDeviceHash(): string {
  if (typeof window === 'undefined') return '';
  let h = window.localStorage.getItem(DEVICE_KEY);
  if (!h) {
    h = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_KEY, h);
  }
  return h;
}

/** Šalje prijavu gužve. Vraća true na uspjeh. */
export async function reportCrowd(
  beachId: string,
  level: CrowdLevel,
  coords?: { lat: number; lng: number } | null,
): Promise<boolean> {
  try {
    const res = await fetch('/api/crowd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        beachId,
        level,
        deviceHash: getDeviceHash(),
        lat: coords?.lat,
        lng: coords?.lng,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
