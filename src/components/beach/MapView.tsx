'use client';

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Beach, CrowdLevel } from '@/lib/beaches';
import { markerColor } from '@/lib/beachFilters';
import { getMapStyleUrl, PILOT_CENTER, PILOT_ZOOM } from '@/lib/mapStyle';

export interface MapFocus {
  lng: number;
  lat: number;
  zoom?: number;
  nonce: number;
}

interface MapViewProps {
  beaches: Beach[];
  crowdLevels: Record<string, CrowdLevel>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  focus: MapFocus | null;
  userLocation: { lat: number; lng: number } | null;
}

function makeMarkerEl(color: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'plaza-marker';
  el.style.cssText = [
    'width:18px',
    'height:18px',
    'border-radius:9999px',
    `background:${color}`,
    'border:2px solid #ffffff',
    'box-shadow:0 1px 4px rgba(13,43,74,0.45)',
    'cursor:pointer',
    'transition:transform 120ms ease',
  ].join(';');
  return el;
}

export default function MapView({
  beaches,
  crowdLevels,
  selectedId,
  onSelect,
  focus,
  userLocation,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  const crowdRef = useRef(crowdLevels);

  // Drži zadnji onSelect u refu (izbjegava presoždavanje markera na svaki render).
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    crowdRef.current = crowdLevels;
  }, [crowdLevels]);

  // Init karte (jednom).
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const markers = markersRef.current;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyleUrl(),
      center: PILOT_CENTER,
      zoom: PILOT_ZOOM,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markers.clear();
    };
  }, []);

  // Sinkroniziraj markere s trenutnim (filtriranim) skupom plaža.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = markersRef.current;
    const nextIds = new Set(beaches.map((b) => b.id));

    // Ukloni markere kojih više nema.
    for (const [id, marker] of markers) {
      if (!nextIds.has(id)) {
        marker.remove();
        markers.delete(id);
      }
    }

    // Dodaj nove.
    for (const beach of beaches) {
      if (markers.has(beach.id)) continue;
      const el = makeMarkerEl(markerColor(beach.surfaceType, crowdRef.current[beach.id]));
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelectRef.current(beach.id);
      });
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([beach.lng, beach.lat])
        .addTo(map);
      markers.set(beach.id, marker);
    }
  }, [beaches]);

  // Preboji markere kad se promijeni gužva (ili skup plaža).
  useEffect(() => {
    const surfaceById = new Map(beaches.map((b) => [b.id, b.surfaceType]));
    for (const [id, marker] of markersRef.current) {
      marker.getElement().style.background = markerColor(
        surfaceById.get(id) ?? null,
        crowdLevels[id],
      );
    }
  }, [crowdLevels, beaches]);

  // Istakni odabrani marker.
  useEffect(() => {
    for (const [id, marker] of markersRef.current) {
      const el = marker.getElement();
      const active = id === selectedId;
      el.style.transform = active ? 'scale(1.6)' : 'scale(1)';
      el.style.zIndex = active ? '10' : '';
      el.style.borderColor = active ? '#0d2b4a' : '#ffffff';
    }
  }, [selectedId, beaches]);

  // FlyTo na promjenu fokusa.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    map.flyTo({
      center: [focus.lng, focus.lat],
      zoom: focus.zoom ?? Math.max(map.getZoom(), 13),
      duration: 900,
      essential: true,
    });
  }, [focus]);

  // Marker korisnikove lokacije.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!userLocation) {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      return;
    }
    const el = document.createElement('div');
    el.style.cssText = [
      'width:16px',
      'height:16px',
      'border-radius:9999px',
      'background:#1f7fd4',
      'border:3px solid #ffffff',
      'box-shadow:0 0 0 4px rgba(31,127,212,0.25)',
    ].join(';');
    userMarkerRef.current?.remove();
    userMarkerRef.current = new maplibregl.Marker({ element: el })
      .setLngLat([userLocation.lng, userLocation.lat])
      .addTo(map);
  }, [userLocation]);

  return <div ref={containerRef} className="h-full w-full" />;
}
