'use client';

import { useEffect, useRef } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

interface Props {
  position: { lat: number; lng: number } | null;
  online: boolean;
}

export default function MapView({ position, online }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | google.maps.Marker | null>(null);

  useEffect(() => {
    if (!online) return;
    if (mapRef.current || !containerRef.current) return;
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not set');
      return;
    }
    const loader = new Loader({
      apiKey,
      version: 'weekly',
    });
    let cancelled = false;
    loader.importLibrary('maps').then(async ({ Map }) => {
      if (cancelled || !containerRef.current) return;
      mapRef.current = new Map(containerRef.current, {
        center: position ?? { lat: 35.681236, lng: 139.767125 },
        zoom: 16,
        disableDefaultUI: true,
        gestureHandling: 'greedy',
        clickableIcons: false,
      });
    }).catch((err) => {
      console.error('Maps load failed:', err);
    });
    return () => { cancelled = true; };
  }, [online, position]);

  useEffect(() => {
    if (!mapRef.current || !position) return;
    mapRef.current.panTo(position);
    if (!markerRef.current) {
      markerRef.current = new google.maps.Marker({
        position,
        map: mapRef.current,
      });
    } else if (markerRef.current instanceof google.maps.Marker) {
      markerRef.current.setPosition(position);
    }
  }, [position]);

  if (!online) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-neutral-800 text-neutral-300">
        圏外
      </div>
    );
  }

  return <div ref={containerRef} className="w-full h-full" />;
}
