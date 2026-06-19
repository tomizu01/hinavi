export function formatDistance(meters: number): string {
  const roundedTo100 = Math.round(meters / 100) * 100;
  if (roundedTo100 < 1000) {
    const m = Math.max(100, roundedTo100);
    return `約${m}m`;
  }
  const km = roundedTo100 / 1000;
  return `約${km.toFixed(1)}km`;
}
