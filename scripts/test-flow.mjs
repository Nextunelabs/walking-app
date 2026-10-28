import assert from "node:assert/strict";
import test, { after } from "node:test";
import { loadEnv } from "./load-env.mjs";

loadEnv();

after(async () => {
  const { closePool } = await import("../src/lib/db.js");
  await closePool();
});

test("a simulated walk is stored once and ignores bad GPS", async () => {
  const { query } = await import("../src/lib/db.js");
  const { createUser } = await import("../src/lib/repos/users.js");
  const { createChallenge } = await import("../src/lib/repos/challenges.js");
  const { joinChallenge } = await import("../src/lib/repos/participants.js");
  const { addTrackingPoints, finishSession, startOrResumeSession } = await import("../src/lib/repos/sessions.js");
  const { kolkataToday } = await import("../src/lib/format.js");
  const { distanceFromAcceptedPoints } = await import("../src/lib/geo.js");

  const stamp = Date.now();
  const user = await createUser({
    fullName: "Flow Walker",
    email: `flow-${stamp}@walkingapp.test`,
    mobileNumber: "9000000000",
    role: "user",
    isActive: true,
    password: "WalkTest123",
  });
  const today = kolkataToday();
  const challenge = await createChallenge(
    {
      challengeName: `Flow ${stamp}`,
      fromDistrict: "Ernakulam",
      toDistrict: "Thrissur",
      distanceKm: 200,
      description: "Automated test",
      startDate: today,
      endDate: today,
      status: "active",
      referenceRoute: null,
      suggestedDistanceKm: null,
    },
    user.userId
  );

  try {
    await joinChallenge(user.userId, challenge.challengeId);
    await assert.rejects(() => joinChallenge(user.userId, challenge.challengeId), /already joined/);

    const session = await startOrResumeSession(user.userId, challenge.challengeId);
    const again = await startOrResumeSession(user.userId, challenge.challengeId);
    assert.equal(again.sessionId, session.sessionId);

    const started = new Date(session.startedAt).getTime();
    const accepted = [];
    let latitude = 9.9312;
    const longitude = 76.2673;
    for (let i = 0; i < 21; i += 1) {
      const point = {
        latitude,
        longitude,
        recordedAtMs: started + i * 2000,
      };
      accepted.push(point);
      latitude += 10 / 111320;
    }

    const payload = accepted.map((point, index) => ({
      clientPointId: `point-${index}`,
      latitude: point.latitude,
      longitude: point.longitude,
      accuracyM: 8,
      recordedAt: new Date(point.recordedAtMs).toISOString(),
    }));
    payload.push({
      clientPointId: "bad-accuracy",
      latitude: latitude,
      longitude,
      accuracyM: 120,
      recordedAt: new Date(started + 50000).toISOString(),
    });
    payload.push({
      clientPointId: "bad-jump",
      latitude: latitude + 1,
      longitude,
      accuracyM: 8,
      recordedAt: new Date(started + 51000).toISOString(),
    });

    const first = await addTrackingPoints(session.sessionId, user, payload.slice(0, 15));
    const second = await addTrackingPoints(session.sessionId, user, payload.slice(15));
    const duplicate = await addTrackingPoints(session.sessionId, user, payload.slice(0, 5));
    assert.equal(duplicate.acceptedCount, 0);
    assert.equal(first.rejected.length + second.rejected.length, 2);

    const expected = distanceFromAcceptedPoints(accepted);
    assert.ok(Math.abs(second.session.distanceKm - expected) < 0.02);

    const finished = await finishSession(session.sessionId, user);
    const finishedAgain = await finishSession(session.sessionId, user);
    assert.equal(finishedAgain.alreadyCompleted, true);
    assert.ok(Math.abs(finishedAgain.session.distanceKm - finished.session.distanceKm) < 0.0001);
    assert.ok(Math.abs(finished.participant.totalDistanceKm - finished.session.distanceKm) < 0.0001);
    assert.ok(Math.abs(finished.participant.progressPercent - (finished.session.distanceKm / 200) * 100) < 0.02);
    assert.ok(finished.participant.progressPercent < 100);
  } finally {
    await query("DELETE FROM challenges WHERE challenge_id = $1", [challenge.challengeId]);
    await query("DELETE FROM users WHERE user_id = $1", [user.userId]);
  }
});
