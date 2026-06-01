'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Props {
  position: { lat: number; lng: number } | null;
  online: boolean;
}

const GSI_TILE_URL = 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png';
const GSI_ATTRIBUTION =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">地理院タイル</a>';

export default function MapView({ position, online }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const map = L.map(containerRef.current, {
      center: position ? [position.lat, position.lng] : [35.681236, 139.767125],
      zoom: 16,
      zoomControl: false,
      attributionControl: true,
    });
    L.tileLayer(GSI_TILE_URL, {
      attribution: GSI_ATTRIBUTION,
      maxZoom: 18,
    }).addTo(map);
    mapRef.current = map;
  }, [position]);

  useEffect(() => {
    if (!mapRef.current || !position) return;
    mapRef.current.panTo([position.lat, position.lng]);
    if (!markerRef.current) {
      markerRef.current = L.circleMarker([position.lat, position.lng], {
        radius: 8,
        color: '#ffffff',
        weight: 2,
        fillColor: '#10b981',
        fillOpacity: 0.9,
      }).addTo(mapRef.current);
    } else {
      markerRef.current.setLatLng([position.lat, position.lng]);
    }
  }, [position]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {!online && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-800/70 text-neutral-100 pointer-events-none z-[1050]">
          圏外
        </div>
      )}
    </div>
  );
}
