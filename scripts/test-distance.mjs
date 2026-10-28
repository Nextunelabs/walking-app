import assert from "node:assert/strict";
import test from "node:test";
import {
  distanceFromAcceptedPoints,
  durationSecondsFromPoints,
  evaluateGpsPoint,
  haversineKm,
} from "../src/lib/geo.js";
import { participantTotals } from "../src/lib/progress.js";

test("progress follows the official challenge distance and caps at 100 percent", () => {
  assert.deepEqual(participantTotals([0], 200), { completedKm: 0, remainingKm: 200, progressPercent: 0 });
  assert.equal(participantTotals([50], 200).progressPercent, 25);
  assert.equal(participantTotals([100], 200).progressPercent, 50);
  assert.equal(participantTotals([150], 200).progressPercent, 75);
  assert.equal(participantTotals([200], 200).progressPercent, 100);
  const over = participantTotals([250], 200);
  assert.equal(over.completedKm, 250);
  assert.equal(over.remainingKm, 0);
  assert.equal(over.progressPercent, 100);
});

test("the same sessions cannot be counted twice", () => {
  const sessions = [12.5, 7.5];
  const once = participantTotals(sessions, 200);
  const twice = participantTotals(sessions, 200);
  assert.deepEqual(once, twice);
  assert.equal(once.completedKm, 20);
});

test("GPS noise, poor accuracy, and impossible jumps are rejected", () => {
  const start = { latitude: 9.9312, longitude: 76.2673, recordedAtMs: 1_000_000 };
  assert.equal(evaluateGpsPoint(null, { ...start, accuracyM: 80 }).accept, false);
  assert.equal(evaluateGpsPoint(null, { ...start, accuracyM: 12 }).reason, "start");

  const noise = evaluateGpsPoint(start, {
    latitude: start.latitude + 2 / 111320,
    longitude: start.longitude,
    accuracyM: 10,
    recordedAtMs: start.recordedAtMs + 5000,
  });
  assert.equal(noise.reason, "noise");

  const jump = evaluateGpsPoint(start, {
    latitude: start.latitude + 1,
    longitude: start.longitude,
    accuracyM: 8,
    recordedAtMs: start.recordedAtMs + 1000,
  });
  assert.equal(jump.reason, "impossible_jump");

  const step = evaluateGpsPoint(start, {
    latitude: start.latitude + 10 / 111320,
    longitude: start.longitude,
    accuracyM: 8,
    recordedAtMs: start.recordedAtMs + 10000,
  });
  assert.equal(step.accept, true);
  assert.ok(step.distanceKm > 0.009 && step.distanceKm < 0.012);
});

test("distance is the sum of the path, and long gaps do not count as walking time", () => {
  const points = [];
  let latitude = 10;
  for (let i = 0; i < 11; i += 1) {
    points.push({ latitude, longitude: 76, recordedAtMs: i * 10000 });
    latitude += 10 / 111320;
  }
  const distance = distanceFromAcceptedPoints(points);
  assert.ok(distance > 0.09 && distance < 0.11);

  const timed = [
    { recordedAtMs: 0 },
    { recordedAtMs: 30_000 },
    { recordedAtMs: 230_000 },
  ];
  assert.equal(durationSecondsFromPoints(timed), 30);
});

test("straight-line distance is symmetric and zero for one point", () => {
  const a = { latitude: 9.9312, longitude: 76.2673 };
  const b = { latitude: 8.5241, longitude: 76.9366 };
  assert.equal(haversineKm(a, a), 0);
  assert.ok(Math.abs(haversineKm(a, b) - haversineKm(b, a)) < 0.000001);
  const km = haversineKm(a, b);
  assert.ok(km > 140 && km < 220);
});
