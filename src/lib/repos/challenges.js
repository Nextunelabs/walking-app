import { z } from "zod";
import { query } from "../db.js";
import { findDistrict, isDistrict } from "../districts.js";
import { dateOnly, num } from "../format.js";
import { haversineKm } from "../geo.js";
import { HttpError } from "../errors.js";

export const CHALLENGE_STATUSES = ["draft", "active", "completed", "cancelled"];

export const challengeWriteSchema = z.object({
  challengeName: z.string().trim().min(3, "Challenge name is required").max(140),
  fromDistrict: z.string().trim().refine(isDistrict, "Choose a Kerala district"),
  toDistrict: z.string().trim().refine(isDistrict, "Choose a Kerala district"),
  distanceKm: z.coerce.number().positive("Distance must be greater than zero").max(10000),
  description: z.string().trim().max(4000).optional().default(""),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a start date"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose an end date"),
  status: z.enum(CHALLENGE_STATUSES),
  referenceRoute: z.any().optional().nullable(),
  suggestedDistanceKm: z.number().positive().max(10000).nullable().optional(),
});

export function mapChallenge(row) {
  if (!row) return null;
  return {
    challengeId: row.challenge_id,
    challengeName: row.challenge_name,
    fromDistrict: row.from_district,
    toDistrict: row.to_district,
    distanceKm: num(row.distance_km),
    description: row.description || "",
    startDate: dateOnly(row.start_date),
    endDate: dateOnly(row.end_date),
    status: row.status,
    suggestedDistanceKm: row.suggested_distance_km == null ? null : num(row.suggested_distance_km),
    referenceRoute: row.reference_route || null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function cleanRoute(route) {
  if (!route) return null;
  if (route.type !== "LineString" || !Array.isArray(route.coordinates)) return null;
  const coordinates = route.coordinates
    .filter((pair) => Array.isArray(pair) && pair.length >= 2 && Number.isFinite(Number(pair[0])) && Number.isFinite(Number(pair[1])))
    .slice(0, 8000)
    .map((pair) => [Number(pair[0]), Number(pair[1])]);
  if (coordinates.length < 2) return null;
  return { type: "LineString", coordinates };
}

export function assertChallengeDates(input) {
  if (input.endDate < input.startDate) {
    throw new HttpError(400, "End date must be on or after the start date");
  }
}

export async function listChallenges({ search = "", status = "", page = 1, limit = 20 }) {
  const currentPage = Math.max(parseInt(page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const offset = (currentPage - 1) * pageSize;
  const params = [];
  const clauses = [];
  const term = String(search || "").trim();
  if (term) {
    params.push(`%${term}%`);
    clauses.push(`(challenge_name ILIKE $${params.length} OR from_district ILIKE $${params.length} OR to_district ILIKE $${params.length})`);
  }
  if (status && CHALLENGE_STATUSES.includes(status)) {
    params.push(status);
    clauses.push(`status = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const count = await query(`SELECT COUNT(*)::int AS count FROM challenges ${where}`, params);
  const data = await query(
    `SELECT challenge_id, challenge_name, from_district, to_district, distance_km, description,
            start_date, end_date, status, suggested_distance_km, created_by, created_at, updated_at
     FROM challenges
     ${where}
     ORDER BY start_date DESC, challenge_name
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, offset]
  );
  const total = count.rows[0]?.count ?? 0;
  return {
    page: currentPage,
    pages: Math.max(Math.ceil(total / pageSize), 1),
    total,
    data: data.rows.map(mapChallenge),
  };
}

export async function getChallenge(challengeId, { includeRoute = false } = {}) {
  const result = await query(
    `SELECT challenge_id, challenge_name, from_district, to_district, distance_km, description,
            start_date, end_date, status, suggested_distance_km,
            ${includeRoute ? "reference_route" : "NULL::jsonb AS reference_route"},
            created_by, created_at, updated_at
     FROM challenges
     WHERE challenge_id = $1
     LIMIT 1`,
    [challengeId]
  );
  return mapChallenge(result.rows[0]);
}

export async function createChallenge(input, userId) {
  assertChallengeDates(input);
  const result = await query(
    `INSERT INTO challenges (
       challenge_name, from_district, to_district, distance_km, description,
       start_date, end_date, status, suggested_distance_km, reference_route, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
     RETURNING challenge_id`,
    [
      input.challengeName,
      input.fromDistrict,
      input.toDistrict,
      input.distanceKm,
      input.description || null,
      input.startDate,
      input.endDate,
      input.status,
      input.suggestedDistanceKm || null,
      cleanRoute(input.referenceRoute) ? JSON.stringify(cleanRoute(input.referenceRoute)) : null,
      userId,
    ]
  );
  return getChallenge(result.rows[0].challenge_id, { includeRoute: true });
}

export async function updateChallenge(challengeId, input) {
  const existing = await getChallenge(challengeId);
  if (!existing) throw new HttpError(404, "Challenge not found");
  assertChallengeDates(input);
  await query(
    `UPDATE challenges
     SET challenge_name = $2, from_district = $3, to_district = $4, distance_km = $5,
         description = $6, start_date = $7, end_date = $8, status = $9,
         suggested_distance_km = COALESCE($10, suggested_distance_km),
         reference_route = COALESCE($11::jsonb, reference_route)
     WHERE challenge_id = $1`,
    [
      challengeId,
      input.challengeName,
      input.fromDistrict,
      input.toDistrict,
      input.distanceKm,
      input.description || null,
      input.startDate,
      input.endDate,
      input.status,
      input.suggestedDistanceKm || null,
      cleanRoute(input.referenceRoute) ? JSON.stringify(cleanRoute(input.referenceRoute)) : null,
    ]
  );
  return getChallenge(challengeId, { includeRoute: true });
}

export async function deleteChallenge(challengeId) {
  const existing = await getChallenge(challengeId);
  if (!existing) throw new HttpError(404, "Challenge not found");
  if (existing.status !== "draft") {
    throw new HttpError(409, "Only a draft challenge can be deleted. Cancel the challenge instead.");
  }
  const participants = await query(
    `SELECT COUNT(*)::int AS count FROM challenge_participants WHERE challenge_id = $1`,
    [challengeId]
  );
  if ((participants.rows[0]?.count ?? 0) > 0) {
    throw new HttpError(409, "This draft already has participants. Cancel it instead of deleting it.");
  }
  await query(`DELETE FROM challenges WHERE challenge_id = $1`, [challengeId]);
  return { ok: true };
}

export async function suggestRoute(fromDistrict, toDistrict) {
  const from = findDistrict(fromDistrict);
  const to = findDistrict(toDistrict);
  if (!from || !to) throw new HttpError(400, "Choose both districts");
  const straightKm = haversineKm(
    { latitude: from.latitude, longitude: from.longitude },
    { latitude: to.latitude, longitude: to.longitude }
  );
  if (from.name === to.name) {
    return {
      suggestedDistanceKm: null,
      straightLineKm: 0,
      profile: null,
      referenceRoute: null,
      message: "The districts are the same. Enter the official walking distance for this challenge.",
    };
  }

  const profiles = ["foot", "driving"];
  for (const profile of profiles) {
    const url = `https://router.project-osrm.org/route/v1/${profile}/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=simplified&geometries=geojson`;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) continue;
      const payload = await response.json();
      const route = payload?.routes?.[0];
      if (!route?.geometry?.coordinates?.length) continue;
      return {
        suggestedDistanceKm: Math.round((route.distance / 1000) * 1000) / 1000,
        straightLineKm: Math.round(straightKm * 1000) / 1000,
        profile,
        referenceRoute: cleanRoute(route.geometry),
        message:
          profile === "foot"
            ? "Suggested walking-route distance. Adjust it if the official course is different."
            : "Walking directions were unavailable, so this is a suggested road distance. Adjust the official course distance before saving.",
      };
    } catch {
      /* Try the next profile, then fall back to the straight-line figure. */
    }
  }

  return {
    suggestedDistanceKm: Math.round(straightKm * 1000) / 1000,
    straightLineKm: Math.round(straightKm * 1000) / 1000,
    profile: "straight",
    referenceRoute: {
      type: "LineString",
      coordinates: [
        [from.longitude, from.latitude],
        [to.longitude, to.latitude],
      ],
    },
    message: "Routing is unavailable. The suggestion is the straight-line distance. Enter the official walking distance yourself.",
  };
}
