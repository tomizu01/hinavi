import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import { countTypes, fetchOsmNearby } from '@/lib/osm';
import type { Spot } from '@/lib/types';

export const runtime = 'nodejs';

const PLACES_ENDPOINT = 'https://places.googleapis.com/v1/places:searchNearby';
const OSM_RADIUS_NEAR_M = 2000;
const OSM_RADIUS_FAR_M = 5000;
const PLACES_RADIUS_M = 2000;
const OSM_TIMEOUT_MS = 12_000;
const PLACES_TIMEOUT_MS = 10_000;

const PLACES_INCLUDED_TYPES = [
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
  sessionId?: string;
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

async function fetchPlacesNearby(
  lat: number,
  lng: number,
  apiKey: string,
  signal?: AbortSignal,
): Promise<Spot[]> {
  const res = await fetch(PLACES_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.types,places.primaryType',
    },
    body: JSON.stringify({
      includedTypes: PLACES_INCLUDED_TYPES,
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: PLACES_RADIUS_M,
        },
      },
      languageCode: 'ja',
    }),
    signal,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`places ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as PlacesApiResponse;
  return (data.places ?? [])
    .filter((p) => p.location && p.displayName?.text)
    .map((p) => ({
      id: p.id,
      name: p.displayName!.text!,
      lat: p.location!.latitude,
      lng: p.location!.longitude,
      types: p.types ?? [],
      primaryType: p.primaryType,
    }));
}

interface SourceResult {
  ok: boolean;
  spots: Spot[];
  error: string | null;
  ms: number;
}

type UsedSource = 'osm_2k' | 'osm_5k' | 'places' | 'none';

const EMPTY_RESULT: SourceResult = { ok: true, spots: [], error: null, ms: 0 };

async function runWithTimeout(
  task: (signal: AbortSignal) => Promise<Spot[]>,
  timeoutMs: number,
): Promise<SourceResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = Date.now();
  try {
    const spots = await task(ctrl.signal);
    return { ok: true, spots, error: null, ms: Date.now() - start };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, spots: [], error: msg.slice(0, 240), ms: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

async function logCompare(args: {
  userId: number;
  sessionId: string | null;
  lat: number;
  lng: number;
  osm: SourceResult;
  places: SourceResult;
  usedSource: UsedSource;
}): Promise<void> {
  try {
    await pool.execute(
      `INSERT INTO osm_places_compare
       (user_id, session_id, request_lat, request_lng,
        osm_count, places_count, osm_types, places_types,
        osm_error, places_error, used_source, osm_ms, places_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        args.userId,
        args.sessionId,
        args.lat,
        args.lng,
        args.osm.spots.length,
        args.places.spots.length,
        JSON.stringify(countTypes(args.osm.spots)),
        JSON.stringify(countTypes(args.places.spots)),
        args.osm.error,
        args.places.error,
        args.usedSource,
        args.osm.ms,
        args.places.ms,
      ],
    );
  } catch (err) {
    console.error('osm_places_compare insert failed:', err);
  }
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
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null;
  const { lat, lng } = body;

  // Tier 1: OSM 2km
  const osmNear = await runWithTimeout(
    (signal) => fetchOsmNearby(lat, lng, OSM_RADIUS_NEAR_M, signal),
    OSM_TIMEOUT_MS,
  );
  if (osmNear.spots.length > 0) {
    await logCompare({
      userId: session.userId,
      sessionId,
      lat,
      lng,
      osm: osmNear,
      places: EMPTY_RESULT,
      usedSource: 'osm_2k',
    });
    return NextResponse.json({ spots: osmNear.spots });
  }

  // Tier 2: OSM 5km (only if 2km returned 0)
  const osmFar = await runWithTimeout(
    (signal) => fetchOsmNearby(lat, lng, OSM_RADIUS_FAR_M, signal),
    OSM_TIMEOUT_MS,
  );
  const osmCombined: SourceResult = {
    ok: osmFar.ok,
    spots: osmFar.spots,
    error: osmFar.error ?? osmNear.error,
    ms: osmNear.ms + osmFar.ms,
  };
  if (osmFar.spots.length > 0) {
    await logCompare({
      userId: session.userId,
      sessionId,
      lat,
      lng,
      osm: osmCombined,
      places: EMPTY_RESULT,
      usedSource: 'osm_5k',
    });
    return NextResponse.json({ spots: osmFar.spots });
  }

  // Tier 3: Google Places 2km fallback
  const places = await runWithTimeout(
    (signal) => fetchPlacesNearby(lat, lng, apiKey, signal),
    PLACES_TIMEOUT_MS,
  );
  const usedSource: UsedSource = places.spots.length > 0 ? 'places' : 'none';

  await logCompare({
    userId: session.userId,
    sessionId,
    lat,
    lng,
    osm: osmCombined,
    places,
    usedSource,
  });

  if (places.spots.length === 0 && !places.ok) {
    console.error('all tiers failed:', {
      osmNear: osmNear.error,
      osmFar: osmFar.error,
      places: places.error,
    });
    return NextResponse.json({ error: 'places lookup failed' }, { status: 502 });
  }

  return NextResponse.json({ spots: places.spots });
}
