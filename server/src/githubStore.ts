import { Buffer } from "node:buffer";
import { assertProfilesManifest, validateProfilesManifest } from "../../shared/profileValidation.js";
import { DEFAULT_EDITABLE_FIELDS, createEmptyProfile, guessJavaVersion, type LauncherProfile, type ProfilesManifest } from "../../shared/profileTypes.js";

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

function normalizeAsset(value: unknown) {
  const item = typeof value === "object" && value ? value as Record<string, unknown> : {};
  return {
    id: typeof item.id === "string" ? item.id : `asset-${Date.now()}`,
    name: typeof item.name === "string" ? item.name : "Unknown Asset",
    version: typeof item.version === "string" ? item.version : "",
    required: typeof item.required === "boolean" ? item.required : true,
    url: typeof item.url === "string" ? item.url : "",
    ...(typeof item.sha256 === "string" ? { sha256: item.sha256 } : {}),
  };
}

function normalizeProfile(value: unknown, index: number): LauncherProfile {
  const base = createEmptyProfile(index + 1);
  const profile = typeof value === "object" && value ? value as Record<string, unknown> : {};
  const minecraftVersion = typeof profile.minecraftVersion === "string" ? profile.minecraftVersion : base.minecraftVersion;
  const javaVersion = typeof profile.javaVersion === "number" ? profile.javaVersion : typeof profile.javaVersion === "string" ? Number(profile.javaVersion) : guessJavaVersion(minecraftVersion);
  const server = typeof profile.defaultServer === "object" && profile.defaultServer ? profile.defaultServer as Record<string, unknown> : {};
  const editable = typeof profile.editableFields === "object" && profile.editableFields ? profile.editableFields as Record<string, unknown> : {};
  const launchOptions = typeof profile.launchOptions === "object" && profile.launchOptions ? profile.launchOptions as Record<string, unknown> : {};

  return {
    ...base,
    id: typeof profile.id === "string" ? profile.id : base.id,
    name: typeof profile.name === "string" ? profile.name : base.name,
    description: typeof profile.description === "string" ? profile.description : base.description,
    customText: typeof profile.customText === "string" ? profile.customText : base.customText,
    backgroundImage: typeof profile.backgroundImage === "string" ? profile.backgroundImage : base.backgroundImage,
    accentColor: typeof profile.accentColor === "string" ? profile.accentColor : base.accentColor,
    minecraftVersion,
    javaVersion: Number.isFinite(javaVersion) ? javaVersion : guessJavaVersion(minecraftVersion),
    modLoader: profile.modLoader === "vanilla" || profile.modLoader === "fabric" || profile.modLoader === "forge" || profile.modLoader === "quilt" ? profile.modLoader : base.modLoader,
    modLoaderVersion: typeof profile.modLoaderVersion === "string" ? profile.modLoaderVersion : base.modLoaderVersion,
    defaultServer: {
      name: typeof server.name === "string" ? server.name : base.defaultServer.name,
      address: typeof server.address === "string" ? server.address : base.defaultServer.address,
      port: typeof server.port === "number" ? server.port : base.defaultServer.port,
    },
    mods: Array.isArray(profile.mods) ? profile.mods.map(normalizeAsset) : [],
    resourcePacks: Array.isArray(profile.resourcePacks) ? profile.resourcePacks.map(normalizeAsset) : [],
    shaders: Array.isArray(profile.shaders) ? profile.shaders.map(normalizeAsset) : [],
    editableFields: {
      ...DEFAULT_EDITABLE_FIELDS,
      ...Object.fromEntries(Object.entries(editable).filter(([, item]) => typeof item === "boolean")),
    },
    launchOptions: {
      minMemoryMb: typeof launchOptions.minMemoryMb === "number" ? launchOptions.minMemoryMb : base.launchOptions.minMemoryMb,
      maxMemoryMb: typeof launchOptions.maxMemoryMb === "number" ? launchOptions.maxMemoryMb : base.launchOptions.maxMemoryMb,
      javaArgs: Array.isArray(launchOptions.javaArgs) ? launchOptions.javaArgs.filter((item): item is string => typeof item === "string") : [],
    },
  };
}

function normalizeManifest(value: unknown): ProfilesManifest {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeProfile);
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
  const profiles = normalizeManifest(parsed);
  return { profiles: assertProfilesManifest(profiles), sha: payload.sha ?? null, source: "github" };
}

export async function writeManifest(profiles: unknown): Promise<{ sha: string | null }> {
  const validation = validateProfilesManifest(profiles);
  if (!validation.ok) throw new Error(validation.errors.join("\n"));

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
