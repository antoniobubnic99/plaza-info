'use client';

// PlažaInfo — jedan izvor živih razina gužve za cijeli klijent.
//
// Prije: karta (BeachExplorer) i otvoreni panel (BeachDetailPanel) imali su svaki
// svoj `setInterval(60s)` nad istim RPC-om `latest_crowd_levels` — otvoren panel je
// značio dva identična zahtjeva u minuti po korisniku. Ovdje je jedan interval koji
// živi dok postoji barem jedan pretplatnik, pa broj zahtjeva ne ovisi o broju
// komponenti koje gužvu prikazuju.

import { useSyncExternalStore } from 'react';
import type { CrowdLevel } from './beaches';
import { getLatestCrowdLevels } from './queries';

const REFRESH_MS = 60_000;

export type CrowdLevels = Readonly<Record<string, CrowdLevel>>;

type Listener = () => void;

/** Stabilna prazna referenca — snapshot na serveru i prije prvog dohvata. */
const EMPTY: CrowdLevels = Object.freeze({});

let snapshot: CrowdLevels = EMPTY;
const listeners = new Set<Listener>();
let timer: number | null = null;
let inFlight = false;

/** Jednake mape ne smiju stvoriti novu referencu — inače svi markeri re-renderiraju svakih 60 s. */
function isSame(a: CrowdLevels, b: CrowdLevels): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every((k) => a[k] === b[k]);
}

function publish(next: CrowdLevels) {
  if (isSame(snapshot, next)) return;
  snapshot = next;
  for (const notify of listeners) notify();
}

function load() {
  if (inFlight) return; // spor odgovor ne smije nagomilati zahtjeve
  inFlight = true;
  getLatestCrowdLevels()
    .then(publish)
    .catch(() => {
      /* prolazni kvar mreže → zadrži zadnje poznato stanje do idućeg ciklusa */
    })
    .finally(() => {
      inFlight = false;
    });
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    load();
    timer = window.setInterval(load, REFRESH_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

/**
 * Žive razine gužve po plaži. Prvi pretplatnik pokreće dohvat i interval, zadnji ga gasi;
 * pretplatnici koji se priključe kasnije odmah dobiju zadnji poznati snimak (bez novog zahtjeva).
 */
export function useCrowdLevels(): CrowdLevels {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  );
}

/**
 * Optimistični upis nakon uspješne prijave gužve — marker na karti i panel se
 * osvježe odmah, bez čekanja idućeg ciklusa. Idući dohvat vraća serversku istinu.
 */
export function setLocalCrowdLevel(beachId: string, level: CrowdLevel): void {
  publish({ ...snapshot, [beachId]: level });
}
