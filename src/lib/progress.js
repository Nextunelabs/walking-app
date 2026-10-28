/**
 * Progress uses the administrator's challenge distance as the target.
 * The recorded distance is preserved even after the target is passed.
 * Calling this again with the same session distances cannot double-count them.
 */
export function participantTotals(sessionDistancesKm, targetKm) {
  const completedKm = sessionDistancesKm.reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  const target = Number(targetKm);
  if (!Number.isFinite(target) || target <= 0) {
    return { completedKm, remainingKm: 0, progressPercent: 0 };
  }
  const remainingKm = Math.max(0, target - completedKm);
  const progressPercent = Math.min(100, (completedKm / target) * 100);
  return { completedKm, remainingKm, progressPercent };
}

export function roundKm(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

export function roundPercent(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}
