import { Buffer } from "node:buffer";
import { assertProfilesManifest, validateProfilesManifest } from "../../shared/profileValidation.js";
import type { ProfilesManifest } from "../../shared/profileTypes.js";

export interface ManifestReadResult {
  profiles: ProfilesManifest;
  sha: string | null;
  source: "github" | "empty";
}

function getGithubConfig() {
  return {
    token: process.env.GITHUB_TOKEN ?? "",
    repo: process.env.GITHUB_REPO ?? "zzapcho/zzapchoLauncher",
    branch: process.env.GITHUB_BRANCH ?? "codex/rounded-launcher-menu",
    path: process.env.GITHUB_MANIFEST_PATH ?? "src/data/profiles.json",
  };
}

function githubHeaders(token: string) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

export async function readManifest(): Promise<ManifestReadResult> {
  const config = getGithubConfig();
  if (!config.token) return { profiles: [], sha: null, source: "empty" };

  const url = `https://api.github.com/repos/${config.repo}/contents/${config.path}?ref=${encodeURIComponent(config.branch)}`;
  const response = await fetch(url, { headers: githubHeaders(config.token) });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub manifest read failed: ${response.status} ${text}`);
  }

  const payload = await response.json() as { content?: string; encoding?: string; sha?: string };
  if (!payload.content || payload.encoding !== "base64") throw new Error("GitHub returned an invalid content payload.");

  const json = Buffer.from(payload.content, "base64").toString("utf8");
  const parsed = JSON.parse(json) as unknown;
  const profiles = assertProfilesManifest(parsed);
  return { profiles, sha: payload.sha ?? null, source: "github" };
}

export async function writeManifest(profiles: unknown): Promise<{ sha: string | null }> {
  const validation = validateProfilesManifest(profiles);
  if (!validation.ok) {
    const error = new Error("Manifest validation failed.");
    error.name = validation.errors.join("\n");
    throw error;
  }

  const config = getGithubConfig();
  if (!config.token) throw new Error("GITHUB_TOKEN is missing. Configure server/.env first.");

  const current = await readManifest().catch(() => ({ sha: null }));
  const content = Buffer.from(JSON.stringify(profiles, null, 2) + "\n", "utf8").toString("base64");
  const url = `https://api.github.com/repos/${config.repo}/contents/${config.path}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: githubHeaders(config.token),
    body: JSON.stringify({
      message: "chore: update launcher profiles from console",
      content,
      sha: current.sha,
      branch: config.branch,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub manifest write failed: ${response.status} ${text}`);
  }

  const payload = await response.json() as { content?: { sha?: string } };
  return { sha: payload.content?.sha ?? null };
}
