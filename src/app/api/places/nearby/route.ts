import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import type { Spot } from '@/lib/types';

export const runtime = 'nodejs';

const ENDPOINT = 'https://places.googleapis.com/v1/places:searchNearby';

const INCLUDED_TYPES = [
  'tourist_attraction',
  'historical_landmark',
  'museum',
  'art_gallery',
  'park',
  'cafe',
  'restaurant',
  'bakery',
  'ice_cream_shop',
  'church',
  'hindu_temple',
  'mosque',
  'synagogue',
];

interface ReqBody {
  lat?: number;
  lng?: number;
  radius?: number;
}

interface PlacesApiResponse {
  places?: Array<{
    id: string;
    displayName?: { text?: string };
    location?: { latitude: number; longitude: number };
    types?: string[];
    primaryType?: string;
  }>;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'places key not configured' }, { status: 500 });

  const body = (await req.json().catch(() => null)) as ReqBody | null;
  if (!body || typeof body.lat !== 'number' || typeof body.lng !== 'number') {
    return NextResponse.json({ error: 'lat/lng required' }, { status: 400 });
  }
  const radius = Math.min(Math.max(body.radius ?? 2000, 100), 5000);

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.types,places.primaryType',
    },
    body: JSON.stringify({
      includedTypes: INCLUDED_TYPES,
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: { latitude: body.lat, longitude: body.lng },
          radius,
        },
      },
      languageCode: 'ja',
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error('Places API error:', res.status, detail);
    return NextResponse.json({ error: 'places lookup failed' }, { status: 502 });
  }

  const data = (await res.json()) as PlacesApiResponse;
  const spots: Spot[] = (data.places ?? [])
    .filter((p) => p.location && p.displayName?.text)
    .map((p) => ({
      id: p.id,
      name: p.displayName!.text!,
      lat: p.location!.latitude,
      lng: p.location!.longitude,
      types: p.types ?? [],
      primaryType: p.primaryType,
    }));

  return NextResponse.json({ spots });
}
