'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTranslations } from 'next-intl';
import { getMapStyleUrl, PILOT_CENTER, PILOT_ZOOM } from '@/lib/mapStyle';
import { locateOnce } from '@/lib/geolocate';

export interface PickedPoint {
  lat: number;
  lng: number;
}

interface LocationPickerProps {
  value: PickedPoint | null;
  onChange: (point: PickedPoint) => void;
  /** Boja markera (razlikuje plažu od parkinga). */
  markerColor?: string;
  /** Početni centar karte (npr. postojeća plaža kad se dodaje parking). */
  initialCenter?: PickedPoint | null;
}

// Klik na kartu postavlja (ili pomiče) marker i javlja koordinate roditelju.
// Marker se može i povući za finije namještanje. Isključivo klijentski (WebGL).
export default function LocationPicker({
  value,
  onChange,
  markerColor = '#1f7fd4',
  initialCenter = null,
}: LocationPickerProps) {
  const t = useTranslations('Submit');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Init karte (jednom).
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const center: [number, number] = initialCenter
      ? [initialCenter.lng, initialCenter.lat]
      : value
        ? [value.lng, value.lat]
        : PILOT_CENTER;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyleUrl(),
      center,
      zoom: initialCenter || value ? 14 : PILOT_ZOOM,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    const place = (lng: number, lat: number) => {
      if (markerRef.current) {
        markerRef.current.setLngLat([lng, lat]);
      } else {
        const marker = new maplibregl.Marker({ color: markerColor, draggable: true })
          .setLngLat([lng, lat])
          .addTo(map);
        marker.on('dragend', () => {
          const p = marker.getLngLat();
          onChangeRef.current({ lat: p.lat, lng: p.lng });
        });
        markerRef.current = marker;
      }
      onChangeRef.current({ lat, lng });
    };

    map.on('click', (e) => place(e.lngLat.lng, e.lngLat.lat));

    // Ako već postoji vrijednost (npr. povratak na formu), prikaži marker.
    if (value) place(value.lng, value.lat);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Namjerno prazan dep-niz: karta se inicijalizira jednom; vrijednost se
    // sinkronizira preko odvojenog effecta niže.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Vanjska promjena vrijednosti (npr. reset forme) → pomakni marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !value) return;
    if (markerRef.current) {
      markerRef.current.setLngLat([value.lng, value.lat]);
    } else {
      const marker = new maplibregl.Marker({ color: markerColor, draggable: true })
        .setLngLat([value.lng, value.lat])
        .addTo(map);
      marker.on('dragend', () => {
        const p = marker.getLngLat();
        onChangeRef.current({ lat: p.lat, lng: p.lng });
      });
      markerRef.current = marker;
    }
  }, [value, markerColor]);

  /**
   * „Lociraj me": postavi marker na trenutnu poziciju korisnika. Marker se ne stvara
   * ovdje — dovoljno je javiti novu vrijednost roditelju, a effect na `value` niže
   * ga postavi/pomakne (jedan put stvaranja markera, bez treće kopije koda).
   */
  async function handleLocate() {
    setLocating(true);
    setGeoError(null);
    try {
      const point = await locateOnce();
      onChangeRef.current(point);
      mapRef.current?.flyTo({ center: [point.lng, point.lat], zoom: 16 });
    } catch {
      setGeoError(t('geoError'));
    } finally {
      setLocating(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <div
          ref={containerRef}
          className="h-64 w-full overflow-hidden rounded-xl ring-1 ring-sea-200 sm:h-80"
        />
        <button
          type="button"
          onClick={handleLocate}
          disabled={locating}
          className="absolute bottom-3 left-3 z-10 rounded-full bg-white/95 px-3 py-2 text-xs font-medium text-sea-800 shadow-md transition hover:bg-white disabled:opacity-60"
        >
          {locating ? t('locating') : t('locateMe')}
        </button>
      </div>
      {geoError && <p className="text-xs text-red-600">{geoError}</p>}
    </div>
  );
}
