import { query, withTransaction } from "../db.js";
import { num } from "../format.js";
import {
  distanceFromAcceptedPoints,
  durationSecondsFromPoints,
  evaluateGpsPoint,
} from "../geo.js";
import { HttpError } from "../errors.js";
import { getChallenge } from "./challenges.js";
import { getParticipation, isOpenToday, recomputeParticipant } from "./participants.js";

const SESSION_SELECT = `
  SELECT session.session_id, session.user_id, session.challenge_id, session.started_at, session.ended_at,
         session.last_resumed_at, session.duration_seconds, session.distance_km, session.status, session.created_at,
         users.full_name, challenges.challenge_name, challenges.from_district, challenges.to_district,
         challenges.distance_km AS target_km
  FROM walking_sessions session
  JOIN users ON users.user_id = session.user_id
  JOIN challenges ON challenges.challenge_id = session.challenge_id
`;

export function mapSession(row) {
  if (!row) return null;
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    challengeId: row.challenge_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    lastResumedAt: row.last_resumed_at,
    durationSeconds: num(row.duration_seconds),
    distanceKm: num(row.distance_km),
    status: row.status,
    createdAt: row.created_at,
    fullName: row.full_name || "",
    challengeName: row.challenge_name || "",
    fromDistrict: row.from_district || "",
    toDistrict: row.to_district || "",
    targetKm: row.target_km == null ? null : num(row.target_km),
  };
}

export function assertCanAccessSession(session, user) {
  if (!session) throw new HttpError(404, "Walking session not found");
  if (user.role !== "admin" && session.userId !== user.userId) {
    throw new HttpError(403, "You can only open your own walking sessions");
  }
}

async function loadSession(client, sessionId) {
  const result = await client.query(`${SESSION_SELECT} WHERE session.session_id = $1 LIMIT 1`, [sessionId]);
  return mapSession(result.rows[0]);
}

export async function getSession(sessionId) {
  const result = await query(`${SESSION_SELECT} WHERE session.session_id = $1 LIMIT 1`, [sessionId]);
  return mapSession(result.rows[0]);
}

export async function listSessions({
  challengeId = "",
  userId = "",
  status = "",
  openOnly = false,
  page = 1,
  limit = 20,
}) {
  const currentPage = Math.max(parseInt(page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const params = [];
  const clauses = [];
  if (challengeId) {
    params.push(challengeId);
    clauses.push(`session.challenge_id = $${params.length}`);
  }
  if (userId) {
    params.push(userId);
    clauses.push(`session.user_id = $${params.length}`);
  }
  if (status === "in_progress" || status === "paused" || status === "completed") {
    params.push(status);
    clauses.push(`session.status = $${params.length}`);
  }
  if (openOnly) clauses.push(`session.status IN ('in_progress', 'paused')`);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const count = await query(`SELECT COUNT(*)::int AS count FROM walking_sessions session ${where}`, params);
  const data = await query(
    `${SESSION_SELECT}
     ${where}
     ORDER BY session.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, (currentPage - 1) * pageSize]
  );
  const total = count.rows[0]?.count ?? 0;
  return {
    page: currentPage,
    pages: Math.max(Math.ceil(total / pageSize), 1),
    total,
    data: data.rows.map(mapSession),
  };
}

async function assertCanWalk(userId, challengeId) {
  const challenge = await getChallenge(challengeId);
  if (!challenge) throw new HttpError(404, "Challenge not found");
  if (!isOpenToday(challenge)) {
    throw new HttpError(400, "Walking is available only while the challenge is active and inside its dates");
  }
  const participation = await getParticipation(userId, challengeId);
  if (!participation || participation.status === "withdrawn") {
    throw new HttpError(403, "Join this challenge before starting a walk");
  }
  return { challenge, participation };
}

export async function startOrResumeSession(userId, challengeId) {
  await assertCanWalk(userId, challengeId);
  return withTransaction(async (client) => {
    const open = await client.query(
      `SELECT session_id, status
       FROM walking_sessions
       WHERE user_id = $1 AND challenge_id = $2 AND status IN ('in_progress', 'paused')
       FOR UPDATE`,
      [userId, challengeId]
    );
    if (open.rows[0]) {
      return loadSession(client, open.rows[0].session_id);
    }
    try {
      const inserted = await client.query(
        `INSERT INTO walking_sessions (user_id, challenge_id, started_at, last_resumed_at, status)
         VALUES ($1, $2, now(), now(), 'in_progress')
         RETURNING session_id`,
        [userId, challengeId]
      );
      return loadSession(client, inserted.rows[0].session_id);
    } catch (error) {
      if (error.code !== "23505") throw error;
      const again = await client.query(
        `SELECT session_id FROM walking_sessions
         WHERE user_id = $1 AND challenge_id = $2 AND status IN ('in_progress', 'paused')
         LIMIT 1`,
        [userId, challengeId]
      );
      return loadSession(client, again.rows[0].session_id);
    }
  });
}

export async function setSessionStatus(sessionId, user, nextStatus) {
  return withTransaction(async (client) => {
    const locked = await client.query(
      `SELECT session_id, user_id, challenge_id, status FROM walking_sessions WHERE session_id = $1 FOR UPDATE`,
      [sessionId]
    );
    const row = locked.rows[0];
    if (!row) throw new HttpError(404, "Walking session not found");
    if (row.user_id !== user.userId) {
      throw new HttpError(403, "You can only update your own walking sessions");
    }
    if (row.status === "completed") {
      const existing = await loadSession(client, sessionId);
      const participant = await recomputeParticipant(client, row.challenge_id, row.user_id);
      return { session: existing, participant, alreadyCompleted: true };
    }
    if (nextStatus === "paused" && row.status === "in_progress") {
      await client.query(
        `UPDATE walking_sessions SET status = 'paused', last_resumed_at = NULL WHERE session_id = $1`,
        [sessionId]
      );
    } else if (nextStatus === "in_progress" && (row.status === "paused" || row.status === "in_progress")) {
      await assertCanWalk(row.user_id, row.challenge_id);
      await client.query(
        `UPDATE walking_sessions SET status = 'in_progress', last_resumed_at = now() WHERE session_id = $1`,
        [sessionId]
      );
    } else if (nextStatus === "completed") {
      await refreshSessionMetrics(client, sessionId);
      await client.query(
        `UPDATE walking_sessions
         SET status = 'completed', ended_at = COALESCE(ended_at, now()), last_resumed_at = NULL
         WHERE session_id = $1`,
        [sessionId]
      );
    } else if (nextStatus !== row.status) {
      throw new HttpError(409, "This walking session cannot change to that status");
    }
    const session = await loadSession(client, sessionId);
    const participant = await recomputeParticipant(client, row.challenge_id, row.user_id);
    return { session, participant, alreadyCompleted: false };
  });
}

async function refreshSessionMetrics(client, sessionId) {
  const points = await client.query(
    `SELECT latitude::float8 AS latitude, longitude::float8 AS longitude,
            EXTRACT(EPOCH FROM gps_timestamp) * 1000 AS recorded_at_ms
     FROM gps_tracking_points
     WHERE walking_session_id = $1
     ORDER BY sequence_no`,
    [sessionId]
  );
  const accepted = points.rows.map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
    recordedAtMs: Number(point.recorded_at_ms),
  }));
  const distanceKm = distanceFromAcceptedPoints(accepted);
  const durationSeconds = durationSecondsFromPoints(accepted);
  await client.query(
    `UPDATE walking_sessions SET distance_km = $2, duration_seconds = $3 WHERE session_id = $1`,
    [sessionId, distanceKm, durationSeconds]
  );
  return { distanceKm, durationSeconds, pointCount: accepted.length };
}

export async function addTrackingPoints(sessionId, user, incoming) {
  if (!Array.isArray(incoming) || incoming.length === 0) {
    throw new HttpError(400, "At least one GPS point is required");
  }
  if (incoming.length > 50) throw new HttpError(400, "Send at most 50 GPS points at a time");

  return withTransaction(async (client) => {
    const locked = await client.query(
      `SELECT session_id, user_id, challenge_id, status, started_at
       FROM walking_sessions WHERE session_id = $1 FOR UPDATE`,
      [sessionId]
    );
    const session = locked.rows[0];
    if (!session) throw new HttpError(404, "Walking session not found");
    if (session.user_id !== user.userId) {
      throw new HttpError(403, "You can only record your own walking sessions");
    }
    if (session.status !== "in_progress") {
      throw new HttpError(409, "GPS points can be saved only while the session is in progress");
    }

    const existing = await client.query(
      `SELECT latitude::float8 AS latitude, longitude::float8 AS longitude,
              EXTRACT(EPOCH FROM gps_timestamp) * 1000 AS recorded_at_ms, sequence_no
       FROM gps_tracking_points
       WHERE walking_session_id = $1
       ORDER BY sequence_no`,
      [sessionId]
    );
    let previous = existing.rows.length
      ? {
          latitude: existing.rows[existing.rows.length - 1].latitude,
          longitude: existing.rows[existing.rows.length - 1].longitude,
          recordedAtMs: Number(existing.rows[existing.rows.length - 1].recorded_at_ms),
        }
      : null;
    let sequence = existing.rows.length ? Number(existing.rows[existing.rows.length - 1].sequence_no) : 0;
    const startedMs = new Date(session.started_at).getTime() - 60_000;
    const latestAllowed = Date.now() + 5 * 60_000;
    const rejected = [];
    let acceptedCount = 0;

    const ordered = [...incoming].sort(
      (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
    );

    for (const point of ordered) {
      const clientPointId = String(point.clientPointId || "").trim();
      const recordedAtMs = new Date(point.recordedAt).getTime();
      const candidate = {
        latitude: Number(point.latitude),
        longitude: Number(point.longitude),
        accuracyM: point.accuracyM == null || point.accuracyM === "" ? null : Number(point.accuracyM),
        recordedAtMs,
      };
      if (!clientPointId || clientPointId.length > 80) {
        rejected.push({ clientPointId, reason: "invalid_point" });
        continue;
      }
      if (!Number.isFinite(recordedAtMs) || recordedAtMs < startedMs || recordedAtMs > latestAllowed) {
        rejected.push({ clientPointId, reason: "invalid_time" });
        continue;
      }
      const decision = evaluateGpsPoint(previous, candidate);
      if (!decision.accept) {
        rejected.push({ clientPointId, reason: decision.reason });
        continue;
      }
      sequence += 1;
      const inserted = await client.query(
        `INSERT INTO gps_tracking_points (
           walking_session_id, latitude, longitude, gps_timestamp, accuracy_m, sequence_no, client_point_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (walking_session_id, client_point_id) DO NOTHING
         RETURNING tracking_point_id`,
        [
          sessionId,
          candidate.latitude,
          candidate.longitude,
          new Date(recordedAtMs).toISOString(),
          candidate.accuracyM,
          sequence,
          clientPointId,
        ]
      );
      if (inserted.rowCount === 0) {
        sequence -= 1;
        continue;
      }
      previous = candidate;
      acceptedCount += 1;
    }

    const metrics = await refreshSessionMetrics(client, sessionId);
    const participant = await recomputeParticipant(client, session.challenge_id, session.user_id);
    const saved = await loadSession(client, sessionId);
    return {
      session: saved,
      participant,
      acceptedCount,
      rejected,
      pointCount: metrics.pointCount,
    };
  });
}

export async function finishSession(sessionId, user) {
  return setSessionStatus(sessionId, user, "completed");
}

export async function getRoute(sessionId, user) {
  const session = await getSession(sessionId);
  assertCanAccessSession(session, user);
  const challenge = await getChallenge(session.challengeId, { includeRoute: true });
  const points = await query(
    `SELECT latitude::float8 AS latitude, longitude::float8 AS longitude,
            gps_timestamp, accuracy_m::float8 AS accuracy_m, sequence_no
     FROM gps_tracking_points
     WHERE walking_session_id = $1
     ORDER BY sequence_no`,
    [sessionId]
  );
  return {
    session,
    challenge,
    points: points.rows.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
      recordedAt: point.gps_timestamp,
      accuracyM: point.accuracy_m,
      sequenceNo: point.sequence_no,
    })),
  };
}

export async function leaderboard(challengeId = "") {
  const params = [];
  let where = `WHERE participant.status <> 'withdrawn'`;
  if (challengeId) {
    params.push(challengeId);
    where += ` AND participant.challenge_id = $1`;
  }
  const result = await query(
    `SELECT users.full_name, users.email, challenges.challenge_name, challenges.challenge_id,
            participant.total_distance_km::float8 AS total_distance_km,
            participant.progress_percent::float8 AS progress_percent,
            RANK() OVER (
              PARTITION BY participant.challenge_id
              ORDER BY participant.total_distance_km DESC, participant.joined_at ASC
            ) AS rank
     FROM challenge_participants participant
     JOIN users ON users.user_id = participant.user_id
     JOIN challenges ON challenges.challenge_id = participant.challenge_id
     ${where}
     ORDER BY challenges.challenge_name, rank`,
    params
  );
  return result.rows.map((row) => ({
    fullName: row.full_name,
    email: row.email,
    challengeId: row.challenge_id,
    challengeName: row.challenge_name,
    totalDistanceKm: num(row.total_distance_km),
    progressPercent: num(row.progress_percent),
    rank: Number(row.rank),
  }));
}

export async function dashboardCounts() {
  const result = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM users) AS users,
       (SELECT COUNT(*)::int FROM challenges WHERE status = 'active') AS active_challenges,
       (SELECT COUNT(*)::int FROM challenge_participants) AS participants,
       (SELECT COUNT(*)::int FROM walking_sessions WHERE status IN ('in_progress', 'paused')) AS open_sessions`
  );
  const row = result.rows[0];
  return {
    users: num(row.users),
    activeChallenges: num(row.active_challenges),
    participants: num(row.participants),
    openSessions: num(row.open_sessions),
  };
}
