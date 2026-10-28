export const MAX_ACCURACY_M = 50;
export const MIN_MOVE_KM = 0.008;
export const MAX_SPEED_KMH = 30;
export const MAX_DURATION_GAP_SECONDS = 90;

export function toRadians(value) {
  return (value * Math.PI) / 180;
}

export function haversineKm(from, to) {
  const earthKm = 6371;
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const dLat = toRadians(to.latitude - from.latitude);
  const dLng = toRadians(to.longitude - from.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Decide whether a GPS reading can extend a walking route.
 * Distance is the step from the previous accepted point, never the straight line from the start.
 * @param {{ latitude: number, longitude: number, recordedAtMs: number } | null} previous
 * @param {{ latitude: number, longitude: number, accuracyM: number | null, recordedAtMs: number }} point
 */
export function evaluateGpsPoint(previous, point) {
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {
    return { accept: false, reason: "invalid_position", distanceKm: 0 };
  }
  if (point.latitude < -90 || point.latitude > 90 || point.longitude < -180 || point.longitude > 180) {
    return { accept: false, reason: "invalid_position", distanceKm: 0 };
  }
  if (point.accuracyM != null && (!Number.isFinite(point.accuracyM) || point.accuracyM > MAX_ACCURACY_M)) {
    return { accept: false, reason: "poor_accuracy", distanceKm: 0 };
  }
  if (!previous) {
    return { accept: true, reason: "start", distanceKm: 0 };
  }

  const distanceKm = haversineKm(previous, point);
  const elapsedMs = point.recordedAtMs - previous.recordedAtMs;
  if (elapsedMs <= 0) {
    if (distanceKm > 0.05) return { accept: false, reason: "impossible_jump", distanceKm };
    return { accept: false, reason: "noise", distanceKm };
  }

  const speedKmh = distanceKm / (elapsedMs / 3600000);
  if (speedKmh > MAX_SPEED_KMH) {
    return { accept: false, reason: "impossible_jump", distanceKm };
  }
  if (distanceKm < MIN_MOVE_KM) {
    return { accept: false, reason: "noise", distanceKm };
  }
  return { accept: true, reason: "accepted", distanceKm };
}

export function distanceFromAcceptedPoints(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversineKm(points[i - 1], points[i]);
  }
  return total;
}

export function durationSecondsFromPoints(points, maxGapSeconds = MAX_DURATION_GAP_SECONDS) {
  let seconds = 0;
  for (let i = 1; i < points.length; i += 1) {
    const gap = (points[i].recordedAtMs - points[i - 1].recordedAtMs) / 1000;
    if (gap > 0 && gap <= maxGapSeconds) seconds += gap;
  }
  return Math.round(seconds);
}

export function downsample(points, max = 1500) {
  if (points.length <= max) return points;
  const selected = [];
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i += 1) {
    selected.push(points[Math.round(i * step)]);
  }
  return selected;
}
