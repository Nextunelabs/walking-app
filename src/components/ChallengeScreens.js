"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { districtNames } from "@/lib/districts.js";
import { formatDate, formatKm, statusLabel } from "@/lib/format.js";
import { RouteMap } from "./RouteMap.js";
import { Banner, Field, PageHeader, api, boxField, dangerButton, errorText, primaryButton, secondaryButton } from "./ui.js";
import { Pager } from "./UsersScreens.js";

const districts = districtNames();

function emptyChallenge() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    challengeName: "",
    fromDistrict: "Ernakulam",
    toDistrict: "Thiruvananthapuram",
    distanceKm: "",
    description: "",
    startDate: today,
    endDate: today,
    status: "draft",
    referenceRoute: null,
    suggestedDistanceKm: null,
  };
}

export function ChallengesList() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/api/challenges?search=${encodeURIComponent(query)}&page=${page}`)
      .then(setResult)
      .catch((err) => setError(errorText(err)));
  }, [query, page]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Challenge settings"
        description="Set the official distance yourself. A suggested route can be different from the walking course."
        actions={<Link className={primaryButton} href="/challenges/new">Add challenge</Link>}
      />
      <Banner tone="error">{error}</Banner>
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(search); }}>
        <input className={boxField} placeholder="Search name or district" value={search} onChange={(event) => setSearch(event.target.value)} />
        <button className={secondaryButton} type="submit">Search</button>
      </form>
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Route</th>
              <th className="px-3 py-2">Distance</th>
              <th className="px-3 py-2">Dates</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(result?.data || []).map((challenge) => (
              <tr key={challenge.challengeId} className="border-t border-border">
                <td className="px-3 py-2">{challenge.challengeName}</td>
                <td className="px-3 py-2">{challenge.fromDistrict} → {challenge.toDistrict}</td>
                <td className="px-3 py-2">{formatKm(challenge.distanceKm)} km</td>
                <td className="px-3 py-2">{formatDate(challenge.startDate)} – {formatDate(challenge.endDate)}</td>
                <td className="px-3 py-2">{statusLabel(challenge.status)}</td>
                <td className="px-3 py-2">
                  <Link className="text-primary" href={`/challenges/${challenge.challengeId}`}>View</Link>
                  <Link className="ml-3 text-primary" href={`/challenges/${challenge.challengeId}/edit`}>Edit</Link>
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

export function ChallengeForm({ challengeId }) {
  const router = useRouter();
  const [form, setForm] = useState(emptyChallenge());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!challengeId) return;
    api(`/api/challenges/${challengeId}`)
      .then((data) => setForm({
        ...data.challenge,
        distanceKm: String(data.challenge.distanceKm),
        referenceRoute: data.challenge.referenceRoute,
      }))
      .catch((err) => setError(errorText(err)));
  }, [challengeId]);

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function suggest() {
    setError("");
    setNote("");
    try {
      const data = await api("/api/challenges/suggest-route", {
        method: "POST",
        body: JSON.stringify({ fromDistrict: form.fromDistrict, toDistrict: form.toDistrict }),
      });
      setForm((current) => ({
        ...current,
        distanceKm: data.suggestedDistanceKm ?? current.distanceKm,
        suggestedDistanceKm: data.suggestedDistanceKm,
        referenceRoute: data.referenceRoute,
      }));
      setNote(data.message);
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");
    const payload = {
      ...form,
      distanceKm: Number(form.distanceKm),
      description: form.description || "",
      suggestedDistanceKm: form.suggestedDistanceKm == null ? null : Number(form.suggestedDistanceKm),
    };
    try {
      if (challengeId) {
        await api(`/api/challenges/${challengeId}`, { method: "PATCH", body: JSON.stringify(payload) });
        setMessage("Challenge updated.");
      } else {
        const created = await api("/api/challenges", { method: "POST", body: JSON.stringify(payload) });
        router.push(`/challenges/${created.challenge.challengeId}`);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title={challengeId ? "Edit challenge" : "Add challenge"} />
      <Banner>{message}</Banner>
      <Banner>{note}</Banner>
      <Banner tone="error">{error}</Banner>
      <form onSubmit={onSubmit} className="grid max-w-2xl gap-4">
        <Field label="Challenge name">
          <input className={boxField} value={form.challengeName} onChange={(event) => set("challengeName", event.target.value)} required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From district">
            <select className={boxField} value={form.fromDistrict} onChange={(event) => set("fromDistrict", event.target.value)}>
              {districts.map((name) => <option key={name}>{name}</option>)}
            </select>
          </Field>
          <Field label="To district">
            <select className={boxField} value={form.toDistrict} onChange={(event) => set("toDistrict", event.target.value)}>
              {districts.map((name) => <option key={name}>{name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Official distance (km)">
          <input className={boxField} type="number" min="0.1" step="0.001" value={form.distanceKm} onChange={(event) => set("distanceKm", event.target.value)} required />
        </Field>
        <button className={secondaryButton} type="button" onClick={suggest}>Suggest distance from map</button>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date">
            <input className={boxField} type="date" value={form.startDate} onChange={(event) => set("startDate", event.target.value)} required />
          </Field>
          <Field label="End date">
            <input className={boxField} type="date" value={form.endDate} onChange={(event) => set("endDate", event.target.value)} required />
          </Field>
        </div>
        <Field label="Description">
          <textarea className={boxField} rows={4} value={form.description || ""} onChange={(event) => set("description", event.target.value)} />
        </Field>
        <Field label="Status">
          <select className={boxField} value={form.status} onChange={(event) => set("status", event.target.value)}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </Field>
        <div className="flex gap-2">
          <button className={primaryButton} disabled={pending} type="submit">{pending ? "Saving…" : "Save"}</button>
          <Link className={secondaryButton} href="/challenges">Back</Link>
        </div>
      </form>
    </div>
  );
}

export function ChallengeDetail({ challengeId }) {
  const router = useRouter();
  const [challenge, setChallenge] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    api(`/api/challenges/${challengeId}`)
      .then((data) => setChallenge(data.challenge))
      .catch((err) => setError(errorText(err)));
  }, [challengeId]);

  async function setStatus(status) {
    const label = status === "cancelled" ? "Cancel this challenge?" : `Mark this challenge as ${status}?`;
    if (!window.confirm(label)) return;
    try {
      const data = await api(`/api/challenges/${challengeId}`, {
        method: "PATCH",
        body: JSON.stringify({ ...challenge, status }),
      });
      setChallenge(data.challenge);
      setMessage(status === "cancelled" ? "Challenge cancelled." : "Challenge updated.");
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function remove() {
    if (!window.confirm("Delete this draft challenge?")) return;
    try {
      await api(`/api/challenges/${challengeId}`, { method: "DELETE" });
      router.push("/challenges");
    } catch (err) {
      setError(errorText(err));
    }
  }

  if (!challenge && !error) return <p className="text-sm text-muted-foreground">Loading challenge…</p>;

  return (
    <div className="space-y-4">
      <PageHeader
        title={challenge?.challengeName || "Challenge"}
        description={challenge ? `${challenge.fromDistrict} to ${challenge.toDistrict}` : ""}
        actions={
          <>
            <Link className={secondaryButton} href={`/challenges/${challengeId}/edit`}>Edit</Link>
            {challenge?.status !== "active" ? <button className={primaryButton} type="button" onClick={() => setStatus("active")}>Activate</button> : null}
            {challenge?.status !== "cancelled" ? <button className={secondaryButton} type="button" onClick={() => setStatus("cancelled")}>Cancel challenge</button> : null}
            {challenge?.status === "draft" ? <button className={dangerButton} type="button" onClick={remove}>Delete</button> : null}
          </>
        }
      />
      <Banner>{message}</Banner>
      <Banner tone="error">{error}</Banner>
      {challenge ? (
        <>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-muted-foreground">Official distance</dt><dd className="font-medium">{formatKm(challenge.distanceKm)} km</dd></div>
            <div><dt className="text-muted-foreground">Dates</dt><dd>{formatDate(challenge.startDate)} – {formatDate(challenge.endDate)}</dd></div>
            <div><dt className="text-muted-foreground">Status</dt><dd>{statusLabel(challenge.status)}</dd></div>
          </dl>
          <p className="text-sm">{challenge.description}</p>
          <RouteMap fromDistrict={challenge.fromDistrict} toDistrict={challenge.toDistrict} referenceRoute={challenge.referenceRoute} />
        </>
      ) : null}
    </div>
  );
}
