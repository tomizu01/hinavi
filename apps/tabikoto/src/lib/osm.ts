import type { Spot } from './types';

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const USER_AGENT = 'hinavi/0.1 (AI tourism guidance PWA)';

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

function buildQuery(lat: number, lng: number, radiusM: number, timeoutSec: number): string {
  const r = Math.round(radiusM);
  return `[out:json][timeout:${timeoutSec}];
(
  nwr["tourism"~"attraction|museum|gallery|viewpoint|artwork|theme_park|zoo|aquarium|hotel|hostel|guest_house|alpine_hut|camp_site"](around:${r},${lat},${lng});
  nwr["historic"](around:${r},${lat},${lng});
  nwr["amenity"~"cafe|restaurant|bar|ice_cream|fast_food|place_of_worship|drinking_water|public_bath"](around:${r},${lat},${lng});
  nwr["shop"~"bakery|confectionery|pastry"](around:${r},${lat},${lng});
  nwr["leisure"~"park|garden"](around:${r},${lat},${lng});
  nwr["railway"~"station|halt"](around:${r},${lat},${lng});
  nwr["natural"~"peak|waterfall|spring"](around:${r},${lat},${lng});
);
out center tags;`;
}

function extractTypes(tags: Record<string, string>): string[] {
  const out: string[] = [];
  if (tags.tourism) out.push(`tourism:${tags.tourism}`);
  if (tags.historic) out.push(`historic:${tags.historic}`);
  if (tags.amenity) out.push(`amenity:${tags.amenity}`);
  if (tags.shop) out.push(`shop:${tags.shop}`);
  if (tags.leisure) out.push(`leisure:${tags.leisure}`);
  if (tags.railway) out.push(`railway:${tags.railway}`);
  if (tags.natural) out.push(`natural:${tags.natural}`);
  if (tags.religion) out.push(`religion:${tags.religion}`);
  return out;
}

function elementToSpot(el: OverpassElement): Spot | null {
  const tags = el.tags;
  if (!tags) return null;
  const name = tags['name:ja'] || tags.name;
  if (!name) return null;
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (lat === undefined || lng === undefined) return null;
  const types = extractTypes(tags);
  if (types.length === 0) return null;
  return {
    id: `osm:${el.type}/${el.id}`,
    name,
    lat,
    lng,
    types,
    primaryType: types[0],
  };
}

export async function fetchOsmNearby(
  lat: number,
  lng: number,
  radiusM: number,
  signal?: AbortSignal,
): Promise<Spot[]> {
  const query = buildQuery(lat, lng, radiusM, 20);
  const res = await fetch(OVERPASS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: `data=${encodeURIComponent(query)}`,
    signal,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`overpass ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as OverpassResponse;
  const raw = (data.elements ?? [])
    .map(elementToSpot)
    .filter((s): s is Spot => s !== null);
  // Dedup by id (same POI can appear via multiple selectors)
  const seen = new Set<string>();
  const unique: Spot[] = [];
  for (const s of raw) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    unique.push(s);
  }
  // Cap to MAX_RESULTS via Fisher–Yates partial shuffle (urban areas can return thousands)
  const MAX_RESULTS = 100;
  if (unique.length <= MAX_RESULTS) return unique;
  for (let i = 0; i < MAX_RESULTS; i++) {
    const j = i + Math.floor(Math.random() * (unique.length - i));
    [unique[i], unique[j]] = [unique[j], unique[i]];
  }
  return unique.slice(0, MAX_RESULTS);
}

export function countTypes(spots: Spot[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of spots) {
    for (const t of s.types) {
      counts[t] = (counts[t] ?? 0) + 1;
    }
  }
  return counts;
}
