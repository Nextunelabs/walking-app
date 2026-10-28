"use client";

import { useEffect, useState } from "react";
import { Banner, Field, PageHeader, boxField, errorText, primaryButton } from "./ui.js";

const empty = {
  githubToken: "",
  githubOrg: "",
  repoName: "walking-app",
  visibility: "private",
  vercelToken: "",
  vercelTeam: "",
  projectName: "walking-app",
  confirmSecrets: false,
  databaseUrl: "",
  sessionSecret: "",
};

export function PublishScreen() {
  const [form, setForm] = useState(empty);
  const [ready, setReady] = useState(null);
  const [logs, setLogs] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let ignore = false;
    fetch("/api/publish")
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not load publish settings");
        return data;
      })
      .then((data) => {
        if (!ignore) setReady(data);
      })
      .catch((loadError) => {
        if (!ignore) setError(errorText(loadError));
      });
    return () => {
      ignore = true;
    };
  }, []);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    setResult(null);
    setLogs([]);
    setPending(true);
    try {
      const response = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          projectName: form.projectName.toLowerCase(),
          confirmSecrets: form.confirmSecrets,
        }),
      });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("ndjson")) {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const failure = new Error(data.error || "Publishing failed");
          failure.details = data.details;
          throw failure;
        }
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Publishing did not return a progress stream");
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const item = JSON.parse(line);
          if (item.error) throw new Error(item.error);
          setLogs((current) => [...current, item.message]);
          if (item.url) setResult({ url: item.url, repoUrl: item.repoUrl || "" });
          else if (item.repoUrl) setResult((current) => ({ url: current?.url || "", repoUrl: item.repoUrl }));
        }
      }
    } catch (submitError) {
      setError(errorText(submitError));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="mx-auto max-w-3xl space-y-6" onSubmit={onSubmit}>
      <PageHeader
        title="Publish"
        description="Send this project to a private GitHub repository, then deploy it to Vercel and keep the public link on this page."
      />
      <Banner tone={error ? "error" : "ok"}>{error}</Banner>
      {ready?.hostedCopy ? (
        <Banner tone="error">Open this page from the project on your computer. The hosted site does not have the source files to publish.</Banner>
      ) : null}

      <section className="space-y-4 rounded-2xl border border-border p-4">
        <h2 className="text-lg font-semibold">1. GitHub</h2>
        <p className="text-sm text-muted-foreground">
          Create a token at github.com/settings/tokens. A fine-grained token needs resource owner set to your account, repository access set to All repositories, Administration set to Read and write, and Contents set to Read and write. A classic token needs the repo scope. Leave the organization blank unless the token belongs to that organization. The token is used once and is not saved.
        </p>
        <Field label="GitHub token">
          <input className={boxField} type="password" autoComplete="off" value={form.githubToken} onChange={(event) => update("githubToken", event.target.value)} required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Repository name">
            <input className={boxField} value={form.repoName} onChange={(event) => update("repoName", event.target.value)} required />
          </Field>
          <Field label="GitHub organization (optional)">
            <input className={boxField} value={form.githubOrg} onChange={(event) => update("githubOrg", event.target.value)} placeholder="Leave blank for your user" />
          </Field>
        </div>
        <Field label="Repository visibility">
          <select className={boxField} value={form.visibility} onChange={(event) => update("visibility", event.target.value)}>
            <option value="private">Private</option>
            <option value="public">Public</option>
          </select>
        </Field>
      </section>

      <section className="space-y-4 rounded-2xl border border-border p-4">
        <h2 className="text-lg font-semibold">2. Vercel</h2>
        <p className="text-sm text-muted-foreground">
          Create a token at vercel.com/account/tokens. The database connection and session secret already on this computer are copied to Vercel as encrypted production settings.
        </p>
        <Field label="Vercel token">
          <input className={boxField} type="password" autoComplete="off" value={form.vercelToken} onChange={(event) => update("vercelToken", event.target.value)} required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Vercel project name">
            <input className={boxField} value={form.projectName} onChange={(event) => update("projectName", event.target.value.toLowerCase())} required />
          </Field>
          <Field label="Vercel team slug (optional)">
            <input className={boxField} value={form.vercelTeam} onChange={(event) => update("vercelTeam", event.target.value)} placeholder="Leave blank for your personal account" />
          </Field>
        </div>
        {ready && !ready.databaseConfigured ? (
          <Field label="Database connection string">
            <input className={boxField} type="password" autoComplete="off" value={form.databaseUrl} onChange={(event) => update("databaseUrl", event.target.value)} required />
          </Field>
        ) : (
          <p className="text-sm text-emerald-800">Database connection is ready on this computer and will not be shown.</p>
        )}
        {ready && !ready.sessionSecretConfigured ? (
          <Field label="Session secret">
            <input className={boxField} type="password" autoComplete="off" value={form.sessionSecret} onChange={(event) => update("sessionSecret", event.target.value)} required />
          </Field>
        ) : (
          <p className="text-sm text-emerald-800">Session secret is ready on this computer and will not be shown.</p>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-border p-4">
        <h2 className="text-lg font-semibold">3. Before publishing</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>The repository starts private. Environment files stay out of Git.</li>
          <li>Simulated GPS is turned off in the public build.</li>
          <li>The site is served over HTTPS, which phone GPS requires.</li>
          <li>The tables must already exist in the database named by the connection string.</li>
        </ul>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={form.confirmSecrets} onChange={(event) => update("confirmSecrets", event.target.checked)} />
          <span>I confirm that database credentials and the session secret go to Vercel only, not to GitHub.</span>
        </label>
        <button className={primaryButton} type="submit" disabled={pending || ready?.hostedCopy}>
          {pending ? "Publishing…" : "Publish to GitHub and Vercel"}
        </button>
      </section>

      {logs.length ? (
        <section className="space-y-2 rounded-2xl border border-border p-4">
          <h2 className="text-lg font-semibold">Progress</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {logs.map((line, index) => (
              <li key={`${index}-${line}`}>{line}</li>
            ))}
          </ol>
        </section>
      ) : null}

      {result?.url ? (
        <section className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <h2 className="text-lg font-semibold text-emerald-900">Public link</h2>
          <a className="break-all text-base font-medium text-primary underline" href={result.url} target="_blank" rel="noreferrer">
            {result.url}
          </a>
          {result.repoUrl ? (
            <p className="text-sm text-emerald-900">
              GitHub:{" "}
              <a className="underline" href={result.repoUrl} target="_blank" rel="noreferrer">
                {result.repoUrl}
              </a>
            </p>
          ) : null}
        </section>
      ) : null}
    </form>
  );
}
