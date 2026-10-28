"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatDateTime, formatDuration, formatKm, formatPercent, statusLabel } from "@/lib/format.js";
import { RouteMap } from "./RouteMap.js";
import { downsample } from "@/lib/geo.js";
import { Banner, PageHeader, api, boxField, errorText, secondaryButton } from "./ui.js";
import { Pager } from "./UsersScreens.js";

export function ParticipantsScreen() {
  const [challenges, setChallenges] = useState([]);
  const [challengeId, setChallengeId] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/challenges?limit=100")
      .then((data) => setChallenges(data.data || []))
      .catch((err) => setError(errorText(err)));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ search: query, page: String(page) });
    if (challengeId) params.set("challengeId", challengeId);
    if (status) params.set("status", status);
    api(`/api/participants?${params}`)
      .then(setResult)
      .catch((err) => setError(errorText(err)));
  }, [challengeId, status, query, page]);

  return (
    <div className="space-y-4">
      <PageHeader title="Challenge participants" description="Distance and progress are calculated on the server from saved walking sessions." />
      <Banner tone="error">{error}</Banner>
      <form className="grid gap-2 md:grid-cols-4" onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(search); }}>
        <select className={boxField} value={challengeId} onChange={(event) => { setChallengeId(event.target.value); setPage(1); }}>
          <option value="">All challenges</option>
          {challenges.map((challenge) => <option key={challenge.challengeId} value={challenge.challengeId}>{challenge.challengeName}</option>)}
        </select>
        <select className={boxField} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
        </select>
        <input className={boxField} placeholder="Search name or email" value={search} onChange={(event) => setSearch(event.target.value)} />
        <button className={secondaryButton} type="submit">Search</button>
      </form>
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Challenge</th>
              <th className="px-3 py-2">Distance</th>
              <th className="px-3 py-2">Progress</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(result?.data || []).map((row) => (
              <tr key={row.participantId} className="border-t border-border">
                <td className="px-3 py-2">{row.fullName}<div className="text-xs text-muted-foreground">{row.email}</div></td>
                <td className="px-3 py-2">{row.challengeName}</td>
                <td className="px-3 py-2">{formatKm(row.totalDistanceKm)} km</td>
                <td className="px-3 py-2">{formatPercent(row.progressPercent)}%</td>
                <td className="px-3 py-2">{statusLabel(row.status)}</td>
                <td className="px-3 py-2">
                  <Link className="text-primary" href={`/activity?userId=${row.userId}&challengeId=${row.challengeId}`}>Activity</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={result?.page || 1} pages={result?.pages || 1} total={result?.total || 0} onPage={setPage} />
    </div>
  );
}

export function ActivityScreen() {
  const params = useSearchParams();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const userId = params.get("userId") || "";
  const challengeId = params.get("challengeId") || "";

  useEffect(() => {
    const query = new URLSearchParams({ page: String(page) });
    if (userId) query.set("userId", userId);
    if (challengeId) query.set("challengeId", challengeId);
    api(`/api/sessions?${query}`)
      .then(setResult)
      .catch((err) => setError(errorText(err)));
  }, [page, userId, challengeId]);

  return (
    <div className="space-y-4">
      <PageHeader title="Walking sessions" description="Recorded GPS routes can be inspected. They cannot be edited from this screen." />
      <Banner tone="error">{error}</Banner>
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-3 py-2">Walker</th>
              <th className="px-3 py-2">Challenge</th>
              <th className="px-3 py-2">Started</th>
              <th className="px-3 py-2">Duration</th>
              <th className="px-3 py-2">Distance</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(result?.data || []).map((session) => (
              <tr key={session.sessionId} className="border-t border-border">
                <td className="px-3 py-2">{session.fullName}</td>
                <td className="px-3 py-2">{session.challengeName}</td>
                <td className="px-3 py-2">{formatDateTime(session.startedAt)}</td>
                <td className="px-3 py-2">{formatDuration(session.durationSeconds)}</td>
                <td className="px-3 py-2">{formatKm(session.distanceKm)} km</td>
                <td className="px-3 py-2">{statusLabel(session.status)}</td>
                <td className="px-3 py-2"><Link className="text-primary" href={`/activity/${session.sessionId}`}>Route</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={result?.page || 1} pages={result?.pages || 1} total={result?.total || 0} onPage={setPage} />
    </div>
  );
}

export function ActivityDetail({ sessionId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/api/sessions/${sessionId}`)
      .then(setData)
      .catch((err) => setError(errorText(err)));
  }, [sessionId]);

  const points = downsample(data?.points || [], 1500);

  return (
    <div className="space-y-4">
      <PageHeader
        title={data?.session?.fullName || "Walking session"}
        description={data ? `${data.session.challengeName} · ${formatKm(data.session.distanceKm)} km · ${formatDuration(data.session.durationSeconds)}` : ""}
        actions={<Link className={secondaryButton} href="/activity">Back</Link>}
      />
      <Banner tone="error">{error}</Banner>
      <p className="text-sm text-muted-foreground">Recorded GPS points are read-only. There is no correction tool on this page.</p>
      {data ? (
        <RouteMap
          fromDistrict={data.challenge?.fromDistrict}
          toDistrict={data.challenge?.toDistrict}
          referenceRoute={data.challenge?.referenceRoute}
          points={points}
        />
      ) : null}
    </div>
  );
}

export function LeaderboardScreen() {
  const [challenges, setChallenges] = useState([]);
  const [challengeId, setChallengeId] = useState("");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/api/leaderboard${challengeId ? `?challengeId=${challengeId}` : ""}`)
      .then((data) => {
        setRows(data.rows || []);
        setChallenges(data.challenges || []);
      })
      .catch((err) => setError(errorText(err)));
  }, [challengeId]);

  return (
    <div className="space-y-4">
      <PageHeader title="Leaderboard" description="Ranked by verified distance inside each challenge. Progress stops at 100% even if the walked distance is higher." />
      <Banner tone="error">{error}</Banner>
      <select className={`${boxField} max-w-md`} value={challengeId} onChange={(event) => setChallengeId(event.target.value)}>
        <option value="">All challenges</option>
        {challenges.map((challenge) => <option key={challenge.challengeId} value={challenge.challengeId}>{challenge.challengeName}</option>)}
      </select>
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-3 py-2">Rank</th>
              <th className="px-3 py-2">Participant</th>
              <th className="px-3 py-2">Challenge</th>
              <th className="px-3 py-2">Kilometres</th>
              <th className="px-3 py-2">Progress</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.challengeId}-${row.email}`} className="border-t border-border">
                <td className="px-3 py-2">{row.rank}</td>
                <td className="px-3 py-2">{row.fullName}</td>
                <td className="px-3 py-2">{row.challengeName}</td>
                <td className="px-3 py-2">{formatKm(row.totalDistanceKm)}</td>
                <td className="px-3 py-2">{formatPercent(row.progressPercent)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
