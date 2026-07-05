import { strFromU8, unzipSync } from "fflate";
import { createEmptyProfile, guessJavaVersion, type LauncherAsset, type LauncherProfile, type ModLoader } from "../../shared/profileTypes";

export type SourceKind = "modrinth" | "curseforge";
export type ProjectKind = "mod" | "resourcepack" | "shader" | "modpack";

export interface ExternalProject {
  source: SourceKind;
  projectId: string;
  slug: string;
  title: string;
  description: string;
  iconUrl?: string;
  projectType: ProjectKind;
  author?: string;
  follows?: number;
}

export interface AssetVersionOption {
  id: string;
  version: string;
  fileName: string;
  url: string;
  sha1?: string;
  sha512?: string;
}

export interface ModpackProfileSeed {
  project: ExternalProject;
  minecraftVersion?: string;
  modLoader?: ModLoader;
  modLoaderVersion?: string;
  packVersion?: string;
  packFileUrl?: string;
}

interface ModrinthProject {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon_url?: string;
}

interface ModrinthSearchHit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  icon_url?: string;
  project_type: ProjectKind;
  author?: string;
  follows?: number;
  downloads?: number;
}

interface ModrinthVersionFile {
  filename: string;
  url: string;
  hashes?: { sha512?: string; sha1?: string };
  primary?: boolean;
}

interface ModrinthVersion {
  id: string;
  version_number: string;
  game_versions?: string[];
  loaders?: string[];
  files: ModrinthVersionFile[];
}

interface MrpackIndexFile {
  path: string;
  hashes?: { sha1?: string; sha512?: string };
  downloads?: string[];
  fileSize?: number;
  env?: Record<string, string>;
}

interface MrpackIndex {
  name?: string;
  summary?: string;
  versionId?: string;
  dependencies?: Record<string, string>;
  files?: MrpackIndexFile[];
}

const typeFacet = (kind: ProjectKind) => JSON.stringify([["project_type:" + kind]]);
const loaderParam = (profile: LauncherProfile) => profile.modLoader === "vanilla" ? [] : [profile.modLoader];
const loaderOrder: ModLoader[] = ["fabric", "forge", "quilt", "vanilla"];

function safeId(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || `asset-${Date.now()}`;
}

function projectPage(slugOrId: string) {
  return `https://modrinth.com/project/${slugOrId}`;
}

function mapSearchHit(hit: ModrinthSearchHit): ExternalProject {
  return {
    source: "modrinth",
    projectId: hit.project_id,
    slug: hit.slug,
    title: hit.title,
    description: hit.description,
    iconUrl: hit.icon_url,
    projectType: hit.project_type,
    author: hit.author,
    follows: hit.follows ?? hit.downloads,
  };
}

function versionToOption(version: ModrinthVersion): AssetVersionOption | null {
  const file = version.files.find((item) => item.primary) ?? version.files[0];
  if (!file) return null;
  return {
    id: version.id,
    version: version.version_number,
    fileName: file.filename,
    url: file.url,
    sha1: file.hashes?.sha1,
    sha512: file.hashes?.sha512,
  };
}

export async function searchModrinthProjects(kind: ProjectKind, query = "", offset = 0, limit = 12): Promise<ExternalProject[]> {
  const params = new URLSearchParams({
    query,
    limit: String(limit),
    offset: String(offset),
    facets: typeFacet(kind),
    index: query.trim() ? "relevance" : "follows",
  });
  const response = await fetch("https://api.modrinth.com/v2/search?" + params.toString());
  if (!response.ok) throw new Error("Modrinth search failed");
  const data = await response.json() as { hits: ModrinthSearchHit[] };
  return data.hits.map(mapSearchHit);
}

async function fetchModrinthProject(projectIdOrSlug: string): Promise<ModrinthProject | null> {
  const response = await fetch(`https://api.modrinth.com/v2/project/${projectIdOrSlug}`);
  if (!response.ok) return null;
  return response.json() as Promise<ModrinthProject>;
}

async function fetchCompatibleVersions(projectIdOrSlug: string, profile: LauncherProfile): Promise<ModrinthVersion[]> {
  const params = new URLSearchParams();
  params.set("game_versions", JSON.stringify([profile.minecraftVersion]));
  const loaders = loaderParam(profile);
  if (loaders.length) params.set("loaders", JSON.stringify(loaders));
  const response = await fetch(`https://api.modrinth.com/v2/project/${projectIdOrSlug}/version?${params.toString()}`);
  if (!response.ok) throw new Error("Modrinth version lookup failed");
  return response.json() as Promise<ModrinthVersion[]>;
}

export async function getModrinthVersionOptions(asset: LauncherAsset, profile: LauncherProfile): Promise<AssetVersionOption[]> {
  const project = asset.projectId ?? asset.id;
  const versions = await fetchCompatibleVersions(project, profile);
  return versions.map(versionToOption).filter((item): item is AssetVersionOption => Boolean(item));
}

export async function getLatestModrinthAsset(asset: LauncherAsset, profile: LauncherProfile): Promise<LauncherAsset> {
  const project = await fetchModrinthProject(asset.projectId ?? asset.id);
  const versions = await getModrinthVersionOptions(asset, profile);
  const latest = versions[0];
  if (!latest) throw new Error(`${asset.name}: 호환되는 최신 파일이 없습니다.`);
  return {
    ...asset,
    name: project?.title ?? asset.name,
    version: latest.version,
    url: latest.url,
    sha1: latest.sha1,
    sha512: latest.sha512,
    source: "modrinth",
    projectId: project?.id ?? asset.projectId ?? asset.id,
    fileId: latest.id,
    fileName: latest.fileName,
    iconUrl: project?.icon_url ?? asset.iconUrl,
    projectUrl: projectPage(project?.slug ?? asset.projectId ?? asset.id),
  };
}

export async function getModrinthAsset(project: ExternalProject, profile: LauncherProfile): Promise<LauncherAsset> {
  const versions = await fetchCompatibleVersions(project.slug, profile);
  const version = versions[0];
  const option = version ? versionToOption(version) : null;
  if (!version || !option) throw new Error(`${project.title}: MC ${profile.minecraftVersion} / ${profile.modLoader}에 맞는 파일이 없습니다.`);
  return {
    id: project.slug,
    name: project.title,
    version: option.version,
    required: true,
    url: option.url,
    sha1: option.sha1,
    sha512: option.sha512,
    source: "modrinth",
    projectId: project.projectId,
    fileId: option.id,
    fileName: option.fileName,
    iconUrl: project.iconUrl,
    projectUrl: projectPage(project.slug),
  };
}

export async function getModrinthModpackSeed(project: ExternalProject): Promise<ModpackProfileSeed> {
  const response = await fetch(`https://api.modrinth.com/v2/project/${project.slug}/version`);
  if (!response.ok) throw new Error("Modrinth modpack version lookup failed");
  const versions = await response.json() as ModrinthVersion[];
  const latest = versions[0];
  const file = latest?.files.find((item) => item.primary) ?? latest?.files[0];
  const modLoader = loaderOrder.find((loader) => latest?.loaders?.includes(loader));
  return {
    project,
    minecraftVersion: latest?.game_versions?.[0],
    modLoader,
    modLoaderVersion: latest?.loaders?.includes("fabric") ? latest.loaders.find((loader) => loader !== "fabric") : undefined,
    packVersion: latest?.version_number,
    packFileUrl: file?.url,
  };
}

function splitMrpackFile(file: MrpackIndexFile, version: string): { kind: "mods" | "resourcePacks" | "shaders"; asset: LauncherAsset } | null {
  const path = file.path.replace(/\\/g, "/");
  const lower = path.toLowerCase();
  const fileName = path.split("/").pop() ?? path;
  const name = fileName.replace(/\.(jar|zip)$/i, "");
  const common = {
    id: safeId(name),
    name,
    version,
    required: file.env?.client !== "unsupported",
    url: file.downloads?.[0] ?? "",
    sha1: file.hashes?.sha1,
    sha512: file.hashes?.sha512,
    source: "modrinth" as const,
    fileName,
    fromModpack: true,
  };
  if (lower.startsWith("mods/") && lower.endsWith(".jar")) return { kind: "mods", asset: common };
  if ((lower.startsWith("resourcepacks/") || lower.startsWith("resource-packs/")) && lower.endsWith(".zip")) return { kind: "resourcePacks", asset: common };
  if ((lower.startsWith("shaderpacks/") || lower.startsWith("shaders/")) && lower.endsWith(".zip")) return { kind: "shaders", asset: common };
  return null;
}

export async function createProfileFromModrinthModpack(project: ExternalProject): Promise<LauncherProfile> {
  const response = await fetch(`https://api.modrinth.com/v2/project/${project.slug}/version`);
  if (!response.ok) throw new Error("Modrinth modpack version lookup failed");
  const versions = await response.json() as ModrinthVersion[];
  const latest = versions[0];
  const packFile = latest?.files.find((item) => item.primary) ?? latest?.files[0];
  if (!latest || !packFile?.url) throw new Error("모드팩 파일을 찾지 못했습니다.");

  const packResponse = await fetch(packFile.url);
  if (!packResponse.ok) throw new Error(".mrpack 다운로드 실패");
  const zip = unzipSync(new Uint8Array(await packResponse.arrayBuffer()));
  const indexFile = zip["modrinth.index.json"];
  if (!indexFile) throw new Error("modrinth.index.json이 없는 모드팩입니다.");
  const index = JSON.parse(strFromU8(indexFile)) as MrpackIndex;
  const dependencies = index.dependencies ?? {};
  const minecraftVersion = dependencies.minecraft ?? latest.game_versions?.[0] ?? "1.21.1";
  const modLoader: ModLoader = dependencies["fabric-loader"] ? "fabric" : dependencies.forge ? "forge" : dependencies["quilt-loader"] ? "quilt" : "vanilla";
  const modLoaderVersion = dependencies["fabric-loader"] ?? dependencies.forge ?? dependencies["quilt-loader"] ?? "";
  const version = index.versionId ?? latest.version_number;
  const profile = createEmptyProfile();
  profile.id = safeId(project.slug);
  profile.name = project.title;
  profile.description = project.description || index.summary || "Modrinth 모드팩";
  profile.customText = index.name ?? project.title;
  profile.minecraftVersion = minecraftVersion;
  profile.javaVersion = guessJavaVersion(minecraftVersion);
  profile.modLoader = modLoader;
  profile.modLoaderVersion = modLoaderVersion;
  profile.mods = [];
  profile.resourcePacks = [];
  profile.shaders = [];
  profile.modpack = {
    source: "modrinth",
    projectId: project.projectId,
    slug: project.slug,
    title: project.title,
    version,
    minecraftVersion,
    modLoader,
    modLoaderVersion,
    javaVersion: profile.javaVersion,
    fileUrl: packFile.url,
    fileId: latest.id,
    manifestUrl: projectPage(project.slug),
  };

  for (const file of index.files ?? []) {
    const split = splitMrpackFile(file, version);
    if (split) profile[split.kind].push(split.asset);
  }
  return profile;
}

export async function searchCurseForgeProjects(kind: ProjectKind, query: string): Promise<ExternalProject[]> {
  const params = new URLSearchParams({ kind, query });
  const response = await fetch("/api/curseforge/search?" + params.toString());
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(data?.error ?? "CurseForge search failed");
  }
  const data = await response.json() as { items: ExternalProject[] };
  return data.items;
}
