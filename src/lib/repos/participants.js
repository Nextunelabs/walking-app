import { query, withTransaction } from "../db.js";
import { kolkataToday, num } from "../format.js";
import { HttpError } from "../errors.js";
import { getChallenge } from "./challenges.js";

export function mapParticipant(row) {
  if (!row) return null;
  return {
    participantId: row.participant_id,
    challengeId: row.challenge_id,
    userId: row.user_id,
    joinedAt: row.joined_at,
    totalDistanceKm: num(row.total_distance_km),
    progressPercent: num(row.progress_percent),
    status: row.status,
    fullName: row.full_name || "",
    email: row.email || "",
    challengeName: row.challenge_name || "",
    fromDistrict: row.from_district || "",
    toDistrict: row.to_district || "",
    targetKm: row.target_km == null ? null : num(row.target_km),
  };
}

function mapTotals(row) {
  if (!row) return null;
  return {
    totalDistanceKm: num(row.total_distance_km),
    progressPercent: num(row.progress_percent),
    status: row.status,
  };
}

export async function recomputeParticipant(client, challengeId, userId) {
  const result = await client.query(
    `WITH totals AS (
       SELECT COALESCE(SUM(distance_km), 0)::float8 AS total_km
       FROM walking_sessions
       WHERE challenge_id = $1 AND user_id = $2
     ),
     target AS (
       SELECT distance_km::float8 AS target_km
       FROM challenges
       WHERE challenge_id = $1
     )
     UPDATE challenge_participants AS participant
     SET total_distance_km = totals.total_km,
         progress_percent = LEAST(
           100,
           CASE WHEN target.target_km > 0 THEN (totals.total_km / target.target_km) * 100 ELSE 0 END
         ),
         status = CASE
           WHEN participant.status = 'withdrawn' THEN 'withdrawn'
           WHEN target.target_km > 0 AND totals.total_km >= target.target_km THEN 'completed'
           ELSE 'active'
         END
     FROM totals, target
     WHERE participant.challenge_id = $1 AND participant.user_id = $2
     RETURNING participant.total_distance_km::float8 AS total_distance_km,
               participant.progress_percent::float8 AS progress_percent,
               participant.status`,
    [challengeId, userId]
  );
  return mapTotals(result.rows[0]);
}

export async function listParticipants({ challengeId = "", search = "", status = "", page = 1, limit = 20 }) {
  const currentPage = Math.max(parseInt(page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const params = [];
  const clauses = [];
  if (challengeId) {
    params.push(challengeId);
    clauses.push(`participant.challenge_id = $${params.length}`);
  }
  if (status === "active" || status === "completed" || status === "withdrawn") {
    params.push(status);
    clauses.push(`participant.status = $${params.length}`);
  }
  const term = String(search || "").trim();
  if (term) {
    params.push(`%${term}%`);
    clauses.push(`(users.full_name ILIKE $${params.length} OR users.email ILIKE $${params.length})`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const from = `
    FROM challenge_participants participant
    JOIN users ON users.user_id = participant.user_id
    JOIN challenges ON challenges.challenge_id = participant.challenge_id
    ${where}
  `;
  const count = await query(`SELECT COUNT(*)::int AS count ${from}`, params);
  const offset = (currentPage - 1) * pageSize;
  const data = await query(
    `SELECT participant.participant_id, participant.challenge_id, participant.user_id, participant.joined_at,
            participant.total_distance_km, participant.progress_percent, participant.status,
            users.full_name, users.email, challenges.challenge_name, challenges.from_district,
            challenges.to_district, challenges.distance_km AS target_km
     ${from}
     ORDER BY participant.total_distance_km DESC, users.full_name
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, offset]
  );
  const total = count.rows[0]?.count ?? 0;
  return {
    page: currentPage,
    pages: Math.max(Math.ceil(total / pageSize), 1),
    total,
    data: data.rows.map(mapParticipant),
  };
}

export async function joinChallenge(userId, challengeId) {
  const challenge = await getChallenge(challengeId);
  if (!challenge) throw new HttpError(404, "Challenge not found");
  const today = kolkataToday();
  if (challenge.status !== "active") {
    throw new HttpError(400, "Only an active challenge can be joined");
  }
  if (today < challenge.startDate || today > challenge.endDate) {
    throw new HttpError(400, "This challenge is outside its start and end dates");
  }
  try {
    await query(
      `INSERT INTO challenge_participants (challenge_id, user_id)
       VALUES ($1, $2)`,
      [challengeId, userId]
    );
    return getParticipation(userId, challengeId);
  } catch (error) {
    if (error.code === "23505") throw new HttpError(409, "You have already joined this challenge");
    throw error;
  }
}

export async function getParticipation(userId, challengeId) {
  const result = await query(
    `SELECT participant.participant_id, participant.challenge_id, participant.user_id, participant.joined_at,
            participant.total_distance_km, participant.progress_percent, participant.status,
            users.full_name, users.email, challenges.challenge_name, challenges.from_district,
            challenges.to_district, challenges.distance_km AS target_km
     FROM challenge_participants participant
     JOIN users ON users.user_id = participant.user_id
     JOIN challenges ON challenges.challenge_id = participant.challenge_id
     WHERE participant.user_id = $1 AND participant.challenge_id = $2
     LIMIT 1`,
    [userId, challengeId]
  );
  return mapParticipant(result.rows[0]);
}

export async function refreshParticipation(challengeId, userId) {
  return withTransaction(async (client) => recomputeParticipant(client, challengeId, userId));
}

export function isOpenToday(challenge) {
  const today = kolkataToday();
  return challenge.status === "active" && challenge.startDate <= today && challenge.endDate >= today;
}
