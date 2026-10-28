import { query } from "../db.js";
import { dateOnly, kolkataToday } from "../format.js";
import { getParticipation } from "./participants.js";
import { listSessions } from "./sessions.js";

export async function walkingHome(userId) {
  const today = kolkataToday();
  const challenges = await query(
    `SELECT challenge_id, challenge_name, from_district, to_district, distance_km::float8 AS distance_km,
            description, start_date, end_date, status
     FROM challenges
     WHERE status = 'active' AND start_date <= $1 AND end_date >= $1
     ORDER BY start_date, challenge_name`,
    [today]
  );

  const cards = [];
  for (const row of challenges.rows) {
    const participation = await getParticipation(userId, row.challenge_id);
    const open = await listSessions({
      challengeId: row.challenge_id,
      userId,
      openOnly: true,
      limit: 1,
    });
    const completedKm = participation?.totalDistanceKm || 0;
    const targetKm = Number(row.distance_km) || 0;
    cards.push({
      challengeId: row.challenge_id,
      challengeName: row.challenge_name,
      fromDistrict: row.from_district,
      toDistrict: row.to_district,
      distanceKm: targetKm,
      description: row.description || "",
      startDate: dateOnly(row.start_date),
      endDate: dateOnly(row.end_date),
      joined: Boolean(participation),
      participantStatus: participation?.status || null,
      completedKm,
      remainingKm: Math.max(0, targetKm - completedKm),
      progressPercent: participation?.progressPercent || 0,
      openSession: open.data[0] || null,
    });
  }
  return {
    available: cards.filter((card) => !card.joined),
    mine: cards.filter((card) => card.joined),
  };
}
