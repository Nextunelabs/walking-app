"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { evaluateGpsPoint } from "@/lib/geo.js";
import { formatDuration, formatKm, formatPercent } from "@/lib/format.js";
import { ProgressBar } from "./ProgressBar.js";
import { RouteMap } from "./RouteMap.js";
import { Banner, api, errorText, primaryButton, secondaryButton } from "./ui.js";

const watchOptions = { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 };
const simulationEnabled = process.env.NEXT_PUBLIC_GPS_SIMULATION === "true";

const reasonText = {
  poor_accuracy: "That GPS reading was too inaccurate and was ignored.",
  impossible_jump: "That location jumped too far to be a walk and was ignored.",
  noise: "A tiny GPS wobble was ignored so it does not add distance.",
  invalid_time: "A GPS time was outside this session and was ignored.",
};

export function WalkTracker({ challengeId }) {
  const [challenge, setChallenge] = useState(null);
  const [participant, setParticipant] = useState(null);
  const [session, setSession] = useState(null);
  const [points, setPoints] = useState([]);
  const [current, setCurrent] = useState(null);
  const [tracking, setTracking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const [pending, setPending] = useState(false);
  const [tick, setTick] = useState(0);

  const watchRef = useRef(null);
  const bufferRef = useRef([]);
  const lastAcceptedRef = useRef(null);
  const syncingRef = useRef(false);
  const sessionRef = useRef(null);
  const trackingRef = useRef(false);
  const localStartedRef = useRef(0);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [challengeData, openSessions] = await Promise.all([
          api(`/api/challenges/${challengeId}`),
          api(`/api/sessions?challengeId=${challengeId}&open=1&mine=1`),
        ]);
        if (!active) return;
        setChallenge(challengeData.challenge);
        const open = openSessions.data?.[0] || null;
        setSession(open);
        if (open) {
          const route = await api(`/api/sessions/${open.sessionId}`);
          if (!active) return;
          setPoints(route.points || []);
          const last = route.points?.[route.points.length - 1];
          if (last) {
            lastAcceptedRef.current = {
              latitude: last.latitude,
              longitude: last.longitude,
              recordedAtMs: new Date(last.recordedAt).getTime(),
            };
            setCurrent({ latitude: last.latitude, longitude: last.longitude });
          }
          if (open.status === "in_progress") {
            setMessage("Tracking stopped when this page was closed. Resume to continue the same session.");
          }
        }
        const home = await api("/api/my-challenges");
        const mine = [...(home.mine || []), ...(home.available || [])].find((item) => item.challengeId === challengeId);
        if (mine) {
          setParticipant({
            totalDistanceKm: mine.completedKm,
            progressPercent: mine.progressPercent,
            status: mine.participantStatus,
            joined: mine.joined,
          });
        }
      } catch (err) {
        if (active) setError(errorText(err));
      }
    })();
    return () => {
      active = false;
      stopWatch();
    };
  }, [challengeId]);

  useEffect(() => {
    if (!tracking) return undefined;
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [tracking]);

  useEffect(() => {
    function onHide() {
      if (document.visibilityState === "hidden") flush();
    }
    document.addEventListener("visibilitychange", onHide);
    const interval = setInterval(() => {
      if (trackingRef.current) flush();
    }, 10000);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      clearInterval(interval);
    };
  }, []);

  function stopWatch() {
    if (watchRef.current != null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    trackingRef.current = false;
    setTracking(false);
  }

  function startWatch() {
    if (!navigator.geolocation) {
      setError("This browser does not provide location access.");
      return;
    }
    if (watchRef.current != null) return;
    setError("");
    watchRef.current = navigator.geolocation.watchPosition(onPosition, onWatchError, watchOptions);
    trackingRef.current = true;
    localStartedRef.current = Date.now();
    setTracking(true);
  }

  function onWatchError(err) {
    if (err.code === 1) {
      setError("Location permission was denied. Allow location access to record this walk. The distance already saved is still kept.");
    } else {
      setError("The device could not provide a GPS fix. Move to an open area and try again.");
    }
  }

  function considerPoint(point) {
    const decision = evaluateGpsPoint(lastAcceptedRef.current, point);
    setCurrent({ latitude: point.latitude, longitude: point.longitude });
    if (!decision.accept) {
      if (decision.reason !== "noise") setMessage(reasonText[decision.reason] || "A GPS reading was ignored.");
      return;
    }
    lastAcceptedRef.current = point;
    bufferRef.current.push({
      clientPointId: crypto.randomUUID(),
      latitude: point.latitude,
      longitude: point.longitude,
      accuracyM: point.accuracyM,
      recordedAt: new Date(point.recordedAtMs).toISOString(),
    });
    setPoints((currentPoints) => [...currentPoints, { latitude: point.latitude, longitude: point.longitude }]);
    setMessage("");
    if (bufferRef.current.length >= 8) flush();
  }

  function onPosition(position) {
    considerPoint({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracyM: position.coords.accuracy,
      recordedAtMs: position.timestamp || Date.now(),
    });
  }

  async function flush() {
    const activeSession = sessionRef.current;
    if (!activeSession || syncingRef.current || bufferRef.current.length === 0) return;
    const batch = bufferRef.current.splice(0, 50);
    syncingRef.current = true;
    try {
      const data = await api(`/api/sessions/${activeSession.sessionId}`, {
        method: "POST",
        body: JSON.stringify({ points: batch }),
      });
      setSession(data.session);
      localStartedRef.current = Date.now();
      if (data.participant) {
        setParticipant((currentValue) => ({ ...(currentValue || {}), ...data.participant, joined: true }));
      }
      if (data.rejected?.length) {
        const reason = data.rejected[data.rejected.length - 1].reason;
        setMessage(reasonText[reason] || "Some GPS readings were ignored.");
      }
    } catch (err) {
      bufferRef.current = batch.concat(bufferRef.current);
      setError(errorText(err));
    } finally {
      syncingRef.current = false;
    }
  }

  async function startWalking() {
    setPending(true);
    setError("");
    setSummary(null);
    try {
      const data = await api("/api/sessions", { method: "POST", body: JSON.stringify({ challengeId }) });
      let next = data.session;
      if (next.status === "paused") {
        const resumed = await api(`/api/sessions/${next.sessionId}/resume`, { method: "POST" });
        next = resumed.session;
      } else if (next.status === "in_progress") {
        await api(`/api/sessions/${next.sessionId}/resume`, { method: "POST" });
      }
      setSession(next);
      sessionRef.current = next;
      startWatch();
      setMessage("Location is used to record this walk and calculate distance. Keep this page open while you walk.");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  async function pauseWalking() {
    stopWatch();
    await flush();
    if (bufferRef.current.length > 0) {
      setError("The latest GPS points could not be saved. Pause was not applied. Try again.");
      return;
    }
    setPending(true);
    try {
      const data = await api(`/api/sessions/${sessionRef.current.sessionId}/pause`, { method: "POST" });
      setSession(data.session);
      setMessage("Walk paused. The distance already recorded is kept.");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  async function finishWalking() {
    if (!window.confirm("Finish this walk and save it?")) return;
    stopWatch();
    await flush();
    if (bufferRef.current.length > 0) {
      setError("The latest GPS points could not be saved, so the walk was not finished.");
      return;
    }
    setPending(true);
    try {
      const data = await api(`/api/sessions/${sessionRef.current.sessionId}/finish`, { method: "POST" });
      setSession(data.session);
      setParticipant((currentValue) => ({ ...(currentValue || {}), ...data.participant, joined: true }));
      setSummary(data);
      setMessage("Walk saved.");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  function simulateStep() {
    const previous = lastAcceptedRef.current;
    const base = previous || { latitude: 9.9312, longitude: 76.2673, recordedAtMs: Date.now() - 10000 };
    considerPoint({
      latitude: base.latitude + 12 / 111320,
      longitude: base.longitude,
      accuracyM: 8,
      recordedAtMs: Math.max(Date.now(), base.recordedAtMs + 8000),
    });
  }

  const previewKm = session?.distanceKm || 0;
  const targetKm = challenge?.distanceKm || 0;
  const shownCompleted = participant?.totalDistanceKm || 0;
  const remainingKm = Math.max(0, targetKm - shownCompleted);
  const progress = targetKm > 0 ? Math.min(100, (shownCompleted / targetKm) * 100) : 0;
  const liveSeconds = tracking ? Math.floor((Date.now() - localStartedRef.current) / 1000) : 0;
  const duration = (session?.durationSeconds || 0) + (tracking ? liveSeconds : 0);
  void tick;

  const open = session && session.status !== "completed";
  const needsJoin = participant?.joined === false && !session;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Walking</p>
          <h1 className="text-2xl font-semibold">{challenge?.challengeName || "Challenge"}</h1>
          <p className="text-sm text-muted-foreground">
            {challenge ? `${challenge.fromDistrict} to ${challenge.toDistrict}` : "Loading challenge…"}
          </p>
        </div>
        <Link href="/dashboard" className={secondaryButton}>Back</Link>
      </div>
      <Banner>{message}</Banner>
      <Banner tone="error">{error}</Banner>
      <section className="grid grid-cols-2 gap-3 rounded-2xl border border-border p-4 sm:grid-cols-4">
        <Stat label="Target" value={`${formatKm(targetKm)} km`} />
        <Stat label="Completed" value={`${formatKm(shownCompleted)} km`} />
        <Stat label="Remaining" value={`${formatKm(remainingKm)} km`} />
        <Stat label="This session" value={`${formatKm(previewKm)} km`} />
      </section>
      <div>
        <div className="mb-1 flex justify-between text-sm">
          <span>Distance progress</span>
          <span>{formatPercent(progress)}%</span>
        </div>
        <ProgressBar percent={progress} />
        <p className="mt-2 text-xs text-muted-foreground">
          {formatDuration(duration)} active. This percentage is walked distance divided by the official challenge distance.
          It is not a position along the road between the districts.
        </p>
      </div>
      {summary ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <h2 className="font-semibold">Walk summary</h2>
          <p className="mt-1">Saved {formatKm(summary.session.distanceKm)} km in {formatDuration(summary.session.durationSeconds)}.</p>
          <p>Challenge total is now {formatKm(summary.participant?.totalDistanceKm)} km ({formatPercent(summary.participant?.progressPercent)}%).</p>
        </section>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {needsJoin ? (
          <p className="text-sm text-muted-foreground sm:col-span-2">Join this challenge from the dashboard before starting.</p>
        ) : null}
        {!open ? (
          <button type="button" className={`${primaryButton} min-h-14 text-lg`} disabled={pending || !challenge || needsJoin} onClick={startWalking}>
            Start Walking
          </button>
        ) : null}
        {open && !tracking ? (
          <button type="button" className={`${primaryButton} min-h-14 text-lg`} disabled={pending} onClick={startWalking}>
            Resume Walking
          </button>
        ) : null}
        {tracking ? (
          <button type="button" className={`${secondaryButton} min-h-14 text-lg`} disabled={pending} onClick={pauseWalking}>
            Pause
          </button>
        ) : null}
        {open ? (
          <button type="button" className={`${secondaryButton} min-h-14 text-lg`} disabled={pending} onClick={finishWalking}>
            Finish Walking
          </button>
        ) : null}
        {simulationEnabled && tracking ? (
          <button type="button" className={secondaryButton} onClick={simulateStep}>
            Add simulated step
          </button>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">
        Location access is required only while a walk is running, so the app can measure the path you take.
        A locked phone or a browser in the background may stop GPS updates. Saved distance remains after a refresh.
      </p>
      <RouteMap
        fromDistrict={challenge?.fromDistrict}
        toDistrict={challenge?.toDistrict}
        referenceRoute={challenge?.referenceRoute}
        points={points}
        current={current}
      />
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
