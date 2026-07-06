import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertProfilesManifest, validateProfilesManifest } from "../../shared/profileValidation.js";
import {
  DEFAULT_EDITABLE_FIELDS,
  createEmptyProfile,
  guessJavaVersion,
  type LauncherAsset,
  type LauncherProfile,
  type ProfilesManifest,
} from "../../shared/profileTypes.js";

export interface ManifestReadResult {
  profiles: ProfilesManifest;
  sha: string | null;
  source: "local" | "empty";
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(projectRoot, "server/data"));
const uploadRoot = path.resolve(process.env.UPLOAD_DIR ?? path.join(projectRoot, "server/uploads"));
const manifestPath = path.resolve(process.env.LOCAL_MANIFEST_PATH ?? path.join(dataDir, "profiles.json"));

function normalizeAsset(value: unknown): LauncherAsset {
  const item = typeof value === "object" && value ? value as Record<string, unknown> : {};
  return {
    id: typeof item.id === "string" ? item.id : `asset-${Date.now()}`,
    name: typeof item.name === "string" ? item.name : "Unknown Asset",
    version: typeof item.version === "string" ? item.version : "",
    required: typeof item.required === "boolean" ? item.required : true,
    url: typeof item.url === "string" ? item.url : "",
    ...(typeof item.sha256 === "string" ? { sha256: item.sha256 } : {}),
    ...(typeof item.sha1 === "string" ? { sha1: item.sha1 } : {}),
    ...(typeof item.sha512 === "string" ? { sha512: item.sha512 } : {}),
    ...(typeof item.source === "string" ? { source: item.source as LauncherAsset["source"] } : {}),
    ...(typeof item.projectId === "string" ? { projectId: item.projectId } : {}),
    ...(typeof item.fileId === "string" ? { fileId: item.fileId } : {}),
    ...(typeof item.fileName === "string" ? { fileName: item.fileName } : {}),
    ...(typeof item.iconUrl === "string" ? { iconUrl: item.iconUrl } : {}),
    ...(typeof item.projectUrl === "string" ? { projectUrl: item.projectUrl } : {}),
    ...(typeof item.fromModpack === "boolean" ? { fromModpack: item.fromModpack } : {}),
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

  const next: LauncherProfile = {
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
      server: true,
      memory: true,
    },
    launchOptions: {
      minMemoryMb: typeof launchOptions.minMemoryMb === "number" ? launchOptions.minMemoryMb : base.launchOptions.minMemoryMb,
      maxMemoryMb: typeof launchOptions.maxMemoryMb === "number" ? launchOptions.maxMemoryMb : base.launchOptions.maxMemoryMb,
      javaArgs: Array.isArray(launchOptions.javaArgs) ? launchOptions.javaArgs.filter((item): item is string => typeof item === "string") : [],
    },
  };

  if (typeof profile.modpack === "object" && profile.modpack) next.modpack = profile.modpack as LauncherProfile["modpack"];
  return next;
}

function normalizeManifest(value: unknown): ProfilesManifest {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeProfile);
}

function profileUploadPath(profileId: string) {
  return path.join(uploadRoot, profileId);
}

async function cleanupDeletedProfileUploads(before: ProfilesManifest, after: ProfilesManifest) {
  const nextIds = new Set(after.map((profile) => profile.id));
  const deleted = before.filter((profile) => !nextIds.has(profile.id));
  await Promise.all(deleted.map(async (profile) => {
    const target = profileUploadPath(profile.id);
    const relative = path.relative(uploadRoot, target);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return;
    await rm(target, { recursive: true, force: true });
  }));
}

export async function readManifest(): Promise<ManifestReadResult> {
  try {
    const json = await readFile(manifestPath, "utf8");
    const parsed = JSON.parse(json) as unknown;
    const profiles = normalizeManifest(parsed);
    return { profiles: assertProfilesManifest(profiles), sha: null, source: "local" };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      await mkdir(path.dirname(manifestPath), { recursive: true });
      return { profiles: [], sha: null, source: "empty" };
    }
    throw error;
  }
}

export async function writeManifest(profiles: unknown): Promise<{ sha: string | null; deletedProfileUploads: number }> {
  const validation = validateProfilesManifest(profiles);
  if (!validation.ok) throw new Error(validation.errors.join("\n"));
  const before = await readManifest().then((result) => result.profiles).catch(() => []);
  const next = normalizeManifest(profiles);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await cleanupDeletedProfileUploads(before, next);
  const deletedProfileUploads = before.filter((profile) => !next.some((item) => item.id === profile.id)).length;
  await writeFile(manifestPath, JSON.stringify(next, null, 2) + "\n", "utf8");
  return { sha: null, deletedProfileUploads };
}

export function getUploadRoot() {
  return uploadRoot;
}
