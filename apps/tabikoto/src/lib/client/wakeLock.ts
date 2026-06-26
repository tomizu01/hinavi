let sentinel: WakeLockSentinel | null = null;

export async function requestWakeLock(): Promise<boolean> {
  const wakeLock = (navigator as Navigator & { wakeLock?: WakeLock }).wakeLock;
  if (!wakeLock) return false;
  try {
    sentinel = await wakeLock.request('screen');
    sentinel.addEventListener('release', () => { sentinel = null; });
    return true;
  } catch (err) {
    console.error('wake lock failed:', err);
    return false;
  }
}

export async function reacquireOnVisible(): Promise<void> {
  if (document.visibilityState === 'visible' && !sentinel) {
    await requestWakeLock();
  }
}
