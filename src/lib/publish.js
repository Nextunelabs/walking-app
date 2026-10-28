import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { HttpError } from "./errors.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const secretNames = new Set([
  ".env",
  ".env.local",
  ".env.development.local",
  ".env.production.local",
  ".env.production",
]);

export const publishSchema = z.object({
  githubToken: z.string().trim().min(20, "Enter the GitHub token").max(300),
  githubOrg: z.string().trim().max(80).optional().default(""),
  repoName: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/, "Repository name can use letters, numbers, dots, and hyphens"),
  visibility: z.enum(["private", "public"]),
  vercelToken: z.string().trim().min(20, "Enter the Vercel token").max(300),
  vercelTeam: z.string().trim().max(80).optional().default(""),
  projectName: z
    .string()
    .trim()
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/, "Project name must be lowercase letters, numbers, and hyphens"),
  confirmSecrets: z.boolean().refine((value) => value, "Confirm that secrets stay off GitHub"),
  databaseUrl: z.string().trim().optional().default(""),
  sessionSecret: z.string().trim().optional().default(""),
});

export function publishReadiness() {
  const databaseConfigured = Boolean(process.env.DATABASE_URL);
  const sessionSecretConfigured = (process.env.SESSION_SECRET || "").length >= 16;
  return {
    databaseConfigured,
    sessionSecretConfigured,
    hostedCopy: Boolean(process.env.VERCEL),
    projectReady: fs.existsSync(path.join(root, "package.json")) && fs.existsSync(path.join(root, "sql", "001_schema.sql")),
  };
}

export async function publishProject(input, send) {
  const readiness = publishReadiness();
  if (readiness.hostedCopy || !readiness.projectReady) {
    throw new HttpError(400, "Open Publish on the computer that contains this project. The hosted copy cannot upload the source.");
  }

  const databaseUrl = input.databaseUrl || process.env.DATABASE_URL || "";
  const sessionSecret = input.sessionSecret || process.env.SESSION_SECRET || "";
  if (!databaseUrl.startsWith("postgres")) {
    throw new HttpError(400, "A PostgreSQL DATABASE_URL is required before publishing.");
  }
  if (sessionSecret.length < 16) {
    throw new HttpError(400, "SESSION_SECRET must be at least 16 characters.");
  }

  send({ message: "Checking the GitHub token." });
  const githubUser = await github(input.githubToken, "/user");
  const owner = input.githubOrg || githubUser.login;
  const repoUrl = `https://github.com/${owner}/${input.repoName}`;

  send({ message: input.githubOrg ? `Creating ${repoUrl}.` : `Creating ${repoUrl} under ${githubUser.login}.` });
  const repo = await ensureRepo(input, owner, githubUser.login);
  send({ message: repo.created ? "GitHub repository created." : "Using the existing GitHub repository.", repoUrl: repo.html_url });

  send({ message: "Preparing the Git commit. Environment files stay untracked." });
  await ensureGitRepo();
  await assertIgnored();
  const committed = await commitProject(githubUser);
  send({ message: committed ? "Committed the project." : "The Git commit is already current." });
  await ensureRemote(repo.clone_url || `${repoUrl}.git`);
  send({ message: "Pushing the code to GitHub." });
  await pushToGitHub(input.githubToken);
  send({ message: "Code is on GitHub.", repoUrl: repo.html_url || repoUrl });

  send({ message: "Checking the Vercel token." });
  const teamId = await resolveTeamId(input.vercelToken, input.vercelTeam);
  send({ message: "Creating the Vercel project." });
  const project = await ensureVercelProject(input.vercelToken, input.projectName, teamId);
  send({ message: "Saving production settings on Vercel. Secrets are encrypted and are not written to GitHub." });
  await upsertEnv(input.vercelToken, project.id, teamId, [
    { key: "DATABASE_URL", value: databaseUrl, type: "encrypted", target: ["production"] },
    { key: "SESSION_SECRET", value: sessionSecret, type: "encrypted", target: ["production"] },
    { key: "SESSION_MAX_AGE_SECONDS", value: process.env.SESSION_MAX_AGE_SECONDS || "43200", type: "encrypted", target: ["production"] },
    { key: "NEXT_PUBLIC_GPS_SIMULATION", value: "false", type: "plain", target: ["production"] },
  ]);

  send({ message: "Deploying to Vercel. This can take a few minutes." });
  const firstUrl = await deployToVercel(input.vercelToken, project);
  const publishedRepoUrl = repo.html_url || repoUrl;
  send({ message: "The first production deployment is live.", url: firstUrl, repoUrl: publishedRepoUrl });
  await upsertEnv(input.vercelToken, project.id, teamId, [
    { key: "NEXT_PUBLIC_APP_URL", value: firstUrl, type: "plain", target: ["production"] },
  ]);
  send({ message: "Public address saved. Publishing it in the production build." });
  let url = firstUrl;
  try {
    url = await deployToVercel(input.vercelToken, project);
  } catch {
    send({
      message: "The public link is ready. Saving that address into the build did not finish, and the link above still opens the site.",
      url: firstUrl,
      repoUrl: publishedRepoUrl,
    });
    return { url: firstUrl, repoUrl: publishedRepoUrl };
  }
  send({ message: "Published.", url, repoUrl: publishedRepoUrl });
  return { url, repoUrl: publishedRepoUrl };
}

async function ensureRepo(input, owner, login) {
  const body = {
    name: input.repoName,
    private: input.visibility === "private",
    description: "Kerala district walking challenge",
    auto_init: false,
  };
  const path = input.githubOrg ? `/orgs/${encodeURIComponent(input.githubOrg)}/repos` : "/user/repos";
  try {
    const created = await github(input.githubToken, path, { method: "POST", body: JSON.stringify(body) });
    return { ...created, created: true };
  } catch (error) {
    if (!/already exists/i.test(error.message || "")) throw error;
  }
  const existing = await github(input.githubToken, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(input.repoName)}`);
  if (owner !== login && existing.owner?.login?.toLowerCase() !== owner.toLowerCase()) {
    throw new HttpError(409, "That repository name belongs to a different GitHub account.");
  }
  if (existing.permissions && existing.permissions.push === false) {
    throw new HttpError(403, "The GitHub token cannot push to that repository.");
  }
  return { ...existing, created: false };
}

async function ensureGitRepo() {
  const inside = await run("git", ["rev-parse", "--is-inside-work-tree"], { allowFailure: true });
  if (inside.code !== 0) {
    const created = await run("git", ["init", "-b", "main"]);
    if (created.code !== 0) throw new HttpError(500, created.stderr || "Git could not start a repository.");
  }
}

async function assertIgnored() {
  for (const name of [".env.local", "node_modules"]) {
    const result = await run("git", ["check-ignore", "-q", name], { allowFailure: true });
    if (result.code !== 0) {
      throw new HttpError(500, `${name} is not ignored. Publishing stopped so secrets or dependencies are not uploaded.`);
    }
  }
}

async function commitProject(githubUser) {
  const added = await run("git", ["add", "-A"]);
  if (added.code !== 0) throw new HttpError(500, added.stderr || "Git could not stage the project.");
  const staged = await run("git", ["diff", "--cached", "--name-only"]);
  const files = staged.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const blocked = files.filter((file) => secretNames.has(path.basename(file)));
  if (blocked.length) {
    await run("git", ["reset"], { allowFailure: true });
    throw new HttpError(500, "Publishing stopped because a secret file was staged.");
  }
  if (!files.length) return false;
  const email = `${githubUser.id}+${githubUser.login}@users.noreply.github.com`;
  const name = githubUser.name || githubUser.login;
  const committed = await run(
    "git",
    ["-c", `user.name=${name}`, "-c", `user.email=${email}`, "commit", "-m", "Publish the walking challenge application."],
  );
  if (committed.code !== 0) throw new HttpError(500, committed.stderr || "Git commit failed.");
  return true;
}

async function ensureRemote(cloneUrl) {
  const current = await run("git", ["remote", "get-url", "origin"], { allowFailure: true });
  const expected = normalizeGitUrl(cloneUrl);
  if (current.code !== 0) {
    const added = await run("git", ["remote", "add", "origin", expected]);
    if (added.code !== 0) throw new HttpError(500, added.stderr || "Git could not add the GitHub remote.");
    return;
  }
  if (normalizeGitUrl(current.stdout.trim()) !== expected) {
    throw new HttpError(409, "This folder already has a Git remote that points to a different repository.");
  }
}

async function pushToGitHub(token) {
  const pushed = await run("git", ["push", "-u", "origin", "HEAD:main"], {
    env: gitAuthEnv(token),
  });
  if (pushed.code !== 0) throw new HttpError(502, pushed.stderr || "GitHub rejected the push.");
}

function gitAuthEnv(token) {
  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.extraheader",
    GIT_CONFIG_VALUE_0: `Authorization: Bearer ${token}`,
  };
}

async function resolveTeamId(token, slug) {
  if (!slug) return "";
  const data = await vercel(token, "/v2/teams?limit=100");
  const team = (data.teams || []).find((item) => item.slug === slug);
  if (!team) throw new HttpError(404, "That Vercel team slug was not found for this token.");
  return team.id;
}

async function ensureVercelProject(token, name, teamId) {
  try {
    return await vercel(token, withTeam("/v10/projects", teamId), {
      method: "POST",
      body: JSON.stringify({ name, framework: "nextjs" }),
    });
  } catch (error) {
    if (error.status !== 409) throw error;
  }
  return vercel(token, withTeam(`/v9/projects/${encodeURIComponent(name)}`, teamId));
}

async function upsertEnv(token, projectId, teamId, items) {
  for (const item of items) {
    try {
      await vercel(token, withTeam(`/v10/projects/${projectId}/env`, teamId), {
        method: "POST",
        body: JSON.stringify(item),
      });
    } catch (error) {
      if (error.status !== 409 && !/already exists/i.test(error.message || "")) throw error;
      const current = await vercel(token, withTeam(`/v9/projects/${projectId}/env`, teamId));
      const existing = (current.envs || []).find((entry) => entry.key === item.key && (entry.target || []).includes("production"));
      if (!existing) throw error;
      await vercel(token, withTeam(`/v9/projects/${projectId}/env/${existing.id}`, teamId), {
        method: "PATCH",
        body: JSON.stringify({ value: item.value, type: item.type, target: item.target }),
      });
    }
  }
}

async function deployToVercel(token, project) {
  const result = await run(process.platform === "win32" ? "npx.cmd" : "npx", ["--yes", "vercel", "deploy", "--prod", "--yes"], {
    env: {
      CI: "1",
      VERCEL_TOKEN: token,
      VERCEL_ORG_ID: project.accountId,
      VERCEL_PROJECT_ID: project.id,
      NEXT_TELEMETRY_DISABLED: "1",
    },
    cleanEnv: true,
    timeoutMs: 8 * 60 * 1000,
  });
  if (result.code !== 0) throw new HttpError(502, result.stderr || result.stdout || "Vercel deployment failed.");
  const url = productionUrl(`${result.stdout}\n${result.stderr}`);
  if (!url) throw new HttpError(502, "Vercel finished without a public address.");
  return url;
}

function productionUrl(output) {
  const production = output.match(/Production:\s*(https:\/\/[a-z0-9.-]+\.vercel\.app)/i);
  if (production) return production[1];
  const urls = output.match(/https:\/\/[a-z0-9.-]+\.vercel\.app/gi) || [];
  return urls.at(-1) || "";
}

function normalizeGitUrl(value) {
  return value.trim().replace(/\.git$/, "").replace(/\/$/, "").toLowerCase();
}

function withTeam(pathname, teamId) {
  if (!teamId) return pathname;
  const join = pathname.includes("?") ? "&" : "?";
  return `${pathname}${join}teamId=${encodeURIComponent(teamId)}`;
}

async function github(token, pathname, options = {}) {
  return requestJson("https://api.github.com", token, pathname, options, "GitHub", {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "walking-app",
  });
}

async function vercel(token, pathname, options = {}) {
  return requestJson("https://api.vercel.com", token, pathname, options, "Vercel");
}

async function requestJson(origin, token, pathname, options, label, extraHeaders = {}) {
  const response = await fetch(`${origin}${pathname}`, {
    method: options.method || "GET",
    body: options.body,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...extraHeaders,
    },
  });
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text.slice(0, 180) };
    }
  }
  if (!response.ok) {
    const details = Array.isArray(data.errors) ? data.errors.map((item) => item.message).filter(Boolean) : [];
    const message = [data.error?.message || data.message, ...details].filter(Boolean).join(" ") || `${label} request failed`;
    throw new HttpError(response.status, `${label}: ${redact(explainGitHubAccess(label, message))}`);
  }
  return data;
}

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const base = options.cleanEnv ? cleanProcessEnv() : { ...process.env };
    const child = spawn(command, args, {
      cwd: root,
      env: { ...base, ...(options.env || {}) },
      windowsHide: true,
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    const timer = options.timeoutMs
      ? setTimeout(() => {
          stderr += "\nThe command took too long and was stopped.";
          child.kill();
        }, options.timeoutMs)
      : null;
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      finish({ code: code ?? 1, stdout: redact(stdout), stderr: redact(stderr) });
    });
    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      finish({ code: 1, stdout: "", stderr: redact(error.message) });
    });
  });
}

function cleanProcessEnv() {
  const keep = ["PATH", "PATHEXT", "SYSTEMROOT", "TEMP", "TMP", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "COMSPEC", "PROGRAMFILES"];
  const env = {};
  for (const key of keep) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}

function explainGitHubAccess(label, message) {
  if (label === "GitHub" && /resource not accessible by personal access token/i.test(message)) {
    return "the token cannot create or update this repository. Leave the organization blank unless the token belongs to that organization. For a fine-grained token, set the resource owner to your account, repository access to All repositories, Administration to Read and write, and Contents to Read and write. A classic token needs the repo scope.";
  }
  return message;
}

function redact(value) {
  return String(value || "")
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://***")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer ***")
    .replace(/ghp_[A-Za-z0-9_]+/g, "ghp_***")
    .replace(/github_pat_[A-Za-z0-9_]+/g, "github_pat_***")
    .replace(/Authorization:\s*\S+/gi, "Authorization: ***");
}
