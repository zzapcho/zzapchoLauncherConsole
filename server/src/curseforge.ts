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

const GAME_ID = 432;

function getApiKey() {
  return process.env.CURSEFORGE_API_KEY ?? "";
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
    headers: { Accept: "application/json", "x-api-key": apiKey },
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
