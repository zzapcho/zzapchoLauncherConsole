type CurseForgeSearchItem = {
  projectId?: string;
  gameVersions?: string[];
};

type ProfilesBody = {
  profiles?: Array<{
    mods?: Array<Record<string, unknown>>;
    resourcePacks?: Array<Record<string, unknown>>;
    shaders?: Array<Record<string, unknown>>;
  }>;
};

const cache = new Map<string, string[]>();
const STORAGE_KEY = "zzapchoLauncherConsole.curseforgeSupportVersions";

function loadCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as Record<string, string[]>;
    Object.entries(data).forEach(([key, value]) => {
      if (Array.isArray(value)) cache.set(key, value.filter((item): item is string => typeof item === "string"));
    });
  } catch {
    // ignore corrupted cache
  }
}

function saveCache() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(cache.entries())));
  } catch {
    // ignore storage quota/private mode
  }
}

function remember(items: CurseForgeSearchItem[]) {
  let changed = false;
  for (const item of items) {
    if (!item.projectId || !Array.isArray(item.gameVersions) || !item.gameVersions.length) continue;
    cache.set(item.projectId, item.gameVersions);
    changed = true;
  }
  if (changed) saveCache();
}

function enrichAsset(asset: Record<string, unknown>) {
  if (asset.source !== "curseforge") return asset;
  if (Array.isArray(asset.supportedGameVersions) && asset.supportedGameVersions.length) return asset;
  const projectId = typeof asset.projectId === "string" ? asset.projectId : "";
  const versions = cache.get(projectId);
  if (!versions?.length) return asset;
  return { ...asset, supportedGameVersions: versions };
}

function enrichBody(body: BodyInit | null | undefined) {
  if (typeof body !== "string" || !body.includes("curseforge")) return body;
  try {
    const parsed = JSON.parse(body) as ProfilesBody;
    for (const profile of parsed.profiles ?? []) {
      if (Array.isArray(profile.mods)) profile.mods = profile.mods.map(enrichAsset);
      if (Array.isArray(profile.resourcePacks)) profile.resourcePacks = profile.resourcePacks.map(enrichAsset);
      if (Array.isArray(profile.shaders)) profile.shaders = profile.shaders.map(enrichAsset);
    }
    return JSON.stringify(parsed);
  } catch {
    return body;
  }
}

function isProfilesPut(input: RequestInfo | URL, init?: RequestInit) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
  return url.includes("/api/profiles") && String(init?.method ?? "GET").toUpperCase() === "PUT";
}

function isCurseForgeSearch(input: RequestInfo | URL) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
  return url.includes("/api/curseforge/search");
}

let installed = false;

export function installCurseForgeVersionCache() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  loadCache();
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const nextInit = isProfilesPut(input, init) ? { ...init, body: enrichBody(init?.body) } : init;
    const response = await originalFetch(input, nextInit);
    if (isCurseForgeSearch(input)) {
      response.clone().json().then((data: { items?: CurseForgeSearchItem[] }) => remember(data.items ?? [])).catch(() => undefined);
    }
    return response;
  };
}

installCurseForgeVersionCache();
