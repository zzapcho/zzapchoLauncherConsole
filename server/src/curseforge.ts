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

function getApiKey() {
  return process.env.CURSEFORGE_API_KEY ?? "";
}

function headers(apiKey: string) {
  return { Accept: "application/json", "x-api-key": apiKey };
}

export async function searchCurseForge(query: string, kind: keyof typeof CLASS_IDS): Promise<CurseForgeProjectResult[]> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("CURSEFORGE_API_KEY is missing in server/.env");

  const params = new URLSearchParams({
    gameId: String(GAME_ID),
    classId: String(CLASS_IDS[kind]),
    searchFilter: query,
    pageSize: "12",
    sortField: "2",
    sortOrder: "desc",
  });

  const response = await fetch(`https://api.curseforge.com/v1/mods/search?${params.toString()}`, {
    headers: headers(apiKey),
  });
  if (!response.ok) throw new Error(`CurseForge search failed: ${response.status}`);

  const payload = await response.json() as { data?: Array<{ id: number; slug?: string; name: string; summary?: string; authors?: Array<{ name: string }>; logo?: { url?: string } }> };
  return (payload.data ?? []).map((item) => ({
    source: "curseforge",
    projectId: String(item.id),
    slug: item.slug ?? String(item.id),
    title: item.name,
    description: item.summary ?? "",
    iconUrl: item.logo?.url,
    projectType: kind,
    author: item.authors?.[0]?.name,
  }));
}

export async function resolveCurseForgeAsset(input: {
  projectId: string;
  kind: keyof typeof CLASS_IDS;
  minecraftVersion: string;
  modLoader: ModLoader;
  title?: string;
}): Promise<LauncherAsset> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("CURSEFORGE_API_KEY is missing in server/.env");

  const params = new URLSearchParams({
    gameVersion: input.minecraftVersion,
    pageSize: "20",
    sortField: "2",
    sortOrder: "desc",
  });
  const modLoaderType = input.kind === "mod" ? MOD_LOADER_TYPES[input.modLoader] : undefined;
  if (modLoaderType) params.set("modLoaderType", String(modLoaderType));

  const response = await fetch(`https://api.curseforge.com/v1/mods/${input.projectId}/files?${params.toString()}`, {
    headers: headers(apiKey),
  });
  if (!response.ok) throw new Error(`CurseForge file lookup failed: ${response.status}`);

  const payload = await response.json() as { data?: Array<{ id: number; displayName?: string; fileName: string; downloadUrl?: string | null; hashes?: Array<{ algo: number; value: string }> }> };
  const file = payload.data?.find((item) => item.downloadUrl) ?? payload.data?.[0];
  if (!file) throw new Error("No matching CurseForge file for this profile");

  const sha1 = file.hashes?.find((hash) => hash.algo === 1)?.value;
  return {
    id: `curseforge-${input.projectId}`,
    name: input.title ?? file.displayName ?? file.fileName,
    version: file.displayName ?? file.fileName,
    required: true,
    url: file.downloadUrl ?? `curseforge://${input.projectId}/${file.id}`,
    sha256: sha1,
  };
}
