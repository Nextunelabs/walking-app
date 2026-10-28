"use client";

import { useState } from "react";
import { Banner, boxField, primaryButton } from "./ui.js";

export function LoginForm({ databaseError = false }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(databaseError ? "Database connection failed. Check DATABASE_URL and try again." : "");
  const [pending, setPending] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "Login failed");
        return;
      }
      window.location.assign("/dashboard");
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-white px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl border border-border bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Walking Challenge</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in with your email and password</p>
        </div>
        <Banner tone="error">{error}</Banner>
        <label className="mt-4 flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">Email</span>
          <input
            className={boxField}
            type="email"
            autoComplete="username"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="mt-4 flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">Password</span>
          <input
            className={boxField}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <button type="submit" className={`${primaryButton} mt-6 w-full py-2.5`} disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
