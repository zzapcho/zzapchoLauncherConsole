import type { LauncherAsset, ModLoader } from "../../shared/profileTypes.js";

export interface CurseForgeProjectResult {
  source: "curseforge";
  projectId: string;
  slug: string;
  title: string;
  description: string;
  iconUrl?: string;
  projectType: "mod" | "resourcepack" | "shader" | "modpack";
  author?: string;
  follows?: number;
  fileId?: string;
  fileName?: string;
  fileVersion?: string;
  downloadUrl?: string;
  sha1?: string;
  sha256?: string;
}

const CLASS_IDS = {
  mod: 6,
  resourcepack: 12,
  shader: 6552,
  modpack: 4471,
} as const;

const MOD_LOADER_TYPES: Partial<Record<ModLoader, number>> = {
  forge: 1,
  fabric: 4,
  quilt: 5,
};

const GAME_ID = 432;

type CurseForgeKind = keyof typeof CLASS_IDS;

interface CurseForgeFile {
  id: number;
  displayName?: string;
  fileName: string;
  downloadUrl?: string | null;
  gameVersions?: string[];
  hashes?: Array<{ algo: number; value: string }>;
}

function getApiKey() {
  return process.env.CURSEFORGE_API_KEY ?? "";
}

function headers(apiKey: string) {
  return { Accept: "application/json", "x-api-key": apiKey };
}

function requireApiKey() {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("CURSEFORGE_API_KEY is missing in server/.env");
  return apiKey;
}

function projectUrl(slugOrId: string) {
  return `https://www.curseforge.com/minecraft/search?search=${encodeURIComponent(slugOrId)}`;
}

function fileSha(hashes: CurseForgeFile["hashes"], algo: number) {
  return hashes?.find((hash) => hash.algo === algo)?.value;
}

function pickBestFile(files: CurseForgeFile[], minecraftVersion: string, modLoader: ModLoader) {
  const loader = modLoader.toLowerCase();
  return files.find((file) => file.downloadUrl && file.gameVersions?.includes(minecraftVersion) && file.gameVersions?.some((version) => version.toLowerCase() === loader))
    ?? files.find((file) => file.downloadUrl && file.gameVersions?.includes(minecraftVersion))
    ?? files.find((file) => file.downloadUrl)
    ?? files.find((file) => file.gameVersions?.includes(minecraftVersion))
    ?? files[0];
}

function latestFileInfo(files?: CurseForgeFile[]) {
  const file = files?.find((item) => item.downloadUrl) ?? files?.[0];
  if (!file) return {};
  return {
    fileId: String(file.id),
    fileName: file.fileName,
    fileVersion: file.displayName ?? file.fileName,
    downloadUrl: file.downloadUrl ?? undefined,
    sha1: fileSha(file.hashes, 1),
    sha256: fileSha(file.hashes, 2),
  };
}

async function fetchDownloadUrl(apiKey: string, projectId: string, fileId: number) {
  const response = await fetch(`https://api.curseforge.com/v1/mods/${projectId}/files/${fileId}/download-url`, {
    headers: headers(apiKey),
  });
  if (!response.ok) return null;
  const payload = await response.json() as { data?: string | null };
  return payload.data ?? null;
}

export async function searchCurseForge(query: string, kind: CurseForgeKind): Promise<CurseForgeProjectResult[]> {
  const apiKey = requireApiKey();

  const params = new URLSearchParams({
    gameId: String(GAME_ID),
    classId: String(CLASS_IDS[kind]),
    pageSize: "20",
    sortField: "2",
    sortOrder: "desc",
  });
  if (query.trim()) params.set("searchFilter", query.trim());

  const response = await fetch(`https://api.curseforge.com/v1/mods/search?${params.toString()}`, {
    headers: headers(apiKey),
  });
  if (!response.ok) throw new Error(`CurseForge search failed: ${response.status}`);

  const payload = await response.json() as { data?: Array<{ id: number; slug?: string; name: string; summary?: string; authors?: Array<{ name: string }>; logo?: { url?: string }; downloadCount?: number; latestFiles?: CurseForgeFile[] }> };
  return (payload.data ?? []).map((item) => ({
    source: "curseforge",
    projectId: String(item.id),
    slug: item.slug ?? String(item.id),
    title: item.name,
    description: item.summary ?? "",
    iconUrl: item.logo?.url,
    projectType: kind,
    author: item.authors?.[0]?.name,
    follows: item.downloadCount,
    ...latestFileInfo(item.latestFiles),
  }));
}

export async function resolveCurseForgeAsset(input: {
  projectId: string;
  slug?: string;
  kind: CurseForgeKind;
  minecraftVersion: string;
  modLoader: ModLoader;
  title?: string;
  iconUrl?: string;
}): Promise<LauncherAsset> {
  const apiKey = requireApiKey();

  const params = new URLSearchParams({
    gameVersion: input.minecraftVersion,
    pageSize: "50",
    sortField: "2",
    sortOrder: "desc",
  });
  const modLoaderType = input.kind === "mod" ? MOD_LOADER_TYPES[input.modLoader] : undefined;
  if (modLoaderType) params.set("modLoaderType", String(modLoaderType));

  const response = await fetch(`https://api.curseforge.com/v1/mods/${input.projectId}/files?${params.toString()}`, {
    headers: headers(apiKey),
  });
  if (!response.ok) throw new Error(`CurseForge file lookup failed: ${response.status}`);

  const payload = await response.json() as { data?: CurseForgeFile[] };
  const files = payload.data ?? [];
  const file = pickBestFile(files, input.minecraftVersion, input.modLoader);
  if (!file) throw new Error("No matching CurseForge file for this profile");

  const downloadUrl = file.downloadUrl ?? await fetchDownloadUrl(apiKey, input.projectId, file.id);
  if (!downloadUrl) throw new Error(`${input.title ?? input.projectId}: CurseForge download URL을 가져오지 못했습니다.`);

  return {
    id: `curseforge-${input.projectId}`,
    name: input.title ?? file.displayName ?? file.fileName.replace(/\.(jar|zip)$/i, ""),
    version: file.displayName ?? file.fileName,
    required: true,
    url: downloadUrl,
    sha1: fileSha(file.hashes, 1),
    sha256: fileSha(file.hashes, 2),
    source: "curseforge",
    projectId: input.projectId,
    fileId: String(file.id),
    fileName: file.fileName,
    iconUrl: input.iconUrl,
    projectUrl: projectUrl(input.slug ?? input.projectId),
  };
}
