"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDate, formatKm, formatPercent, statusLabel } from "@/lib/format.js";
import { ProgressBar } from "./ProgressBar.js";
import { Banner, PageHeader, api, errorText, primaryButton, secondaryButton } from "./ui.js";

function ChallengeCard({ challenge, onJoin }) {
  return (
    <article className="rounded-2xl border border-border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{challenge.challengeName}</h2>
          <p className="text-sm text-muted-foreground">
            {challenge.fromDistrict} to {challenge.toDistrict}
          </p>
        </div>
        {challenge.participantStatus ? (
          <span className="rounded-full bg-muted px-2 py-1 text-xs">{statusLabel(challenge.participantStatus)}</span>
        ) : null}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{challenge.description}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Target</dt>
          <dd className="font-medium">{formatKm(challenge.distanceKm)} km</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Completed</dt>
          <dd className="font-medium">{formatKm(challenge.completedKm)} km</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Remaining</dt>
          <dd className="font-medium">{formatKm(challenge.remainingKm)} km</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Progress</dt>
          <dd className="font-medium">{formatPercent(challenge.progressPercent)}%</dd>
        </div>
      </dl>
      <div className="mt-3">
        <ProgressBar percent={challenge.progressPercent} />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {formatDate(challenge.startDate)} – {formatDate(challenge.endDate)}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/walk/${challenge.challengeId}`} className={secondaryButton}>
          View route map
        </Link>
        {challenge.joined ? (
          <Link href={`/walk/${challenge.challengeId}`} className={primaryButton}>
            {challenge.openSession?.status === "paused" || challenge.openSession?.status === "in_progress"
              ? "Resume walking"
              : "Start walking"}
          </Link>
        ) : (
          <button type="button" className={primaryButton} onClick={() => onJoin(challenge.challengeId)}>
            Join challenge
          </button>
        )}
      </div>
    </article>
  );
}

export function ParticipantDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const payload = await api("/api/my-challenges");
    setData(payload);
  }

  useEffect(() => {
    load().catch((err) => setError(errorText(err)));
  }, []);

  async function join(challengeId) {
    setError("");
    setMessage("");
    try {
      await api("/api/participants/join", { method: "POST", body: JSON.stringify({ challengeId }) });
      setMessage("You joined the challenge.");
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  }

  if (!data && !error) return <p className="text-sm text-muted-foreground">Loading challenges…</p>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My challenges"
        description="Join an active district challenge, then record your walk. Progress is based on the distance you have walked."
      />
      <Banner>{message}</Banner>
      <Banner tone="error">{error}</Banner>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">My challenges</h2>
        {data?.mine?.length ? (
          data.mine.map((challenge) => <ChallengeCard key={challenge.challengeId} challenge={challenge} onJoin={join} />)
        ) : (
          <p className="text-sm text-muted-foreground">You have not joined a challenge yet.</p>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Available challenges</h2>
        {data?.available?.length ? (
          data.available.map((challenge) => (
            <ChallengeCard key={challenge.challengeId} challenge={challenge} onJoin={join} />
          ))
        ) : (
          <p className="text-sm text-muted-foreground">There are no other active challenges right now.</p>
        )}
      </section>
    </div>
  );
}

export function AdminDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/dashboard")
      .then(setData)
      .catch((err) => setError(errorText(err)));
  }, []);

  if (!data && !error) return <p className="text-sm text-muted-foreground">Loading dashboard…</p>;

  const cards = [
    ["Users", data?.counts?.users],
    ["Active challenges", data?.counts?.activeChallenges],
    ["Participants", data?.counts?.participants],
    ["Open sessions", data?.counts?.openSessions],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Overview of walkers, challenges, and sessions."
        actions={
          <Link href="/my-walking" className={primaryButton}>
            Open walking view
          </Link>
        }
      />
      <Banner tone="error">{error}</Banner>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-border p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value ?? "—"}</p>
          </div>
        ))}
      </div>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Recent sessions</h2>
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted text-left">
              <tr>
                <th className="px-3 py-2">Walker</th>
                <th className="px-3 py-2">Challenge</th>
                <th className="px-3 py-2">Distance</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentSessions || []).map((session) => (
                <tr key={session.sessionId} className="border-t border-border">
                  <td className="px-3 py-2">{session.fullName}</td>
                  <td className="px-3 py-2">{session.challengeName}</td>
                  <td className="px-3 py-2">{formatKm(session.distanceKm)} km</td>
                  <td className="px-3 py-2">{statusLabel(session.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
