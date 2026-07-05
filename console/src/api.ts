import type { LauncherAsset, ProfilesManifest } from "../../shared/profileTypes";

const KEY = "zzapchoLauncherConsole.session";
export const AUTH_EXPIRED_EVENT = "zzapcho-console-auth-expired";

export interface LauncherMeta {
  minecraft: {
    latestRelease: string;
    latestSnapshot: string;
    releases: string[];
    snapshots: string[];
  };
  loaders: {
    fabric: string[];
    quilt: string[];
    forge: string[];
  };
}

export const getSession = () => localStorage.getItem(KEY) ?? "";
export const saveSession = (value: string) => localStorage.setItem(KEY, value);
export const clearSession = () => localStorage.removeItem(KEY);

function expireSession() {
  clearSession();
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = getSession();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session) headers["x-admin-session"] = session;
  const response = await fetch(path, { ...init, headers: { ...headers, ...init.headers } });
  const data = await response.json().catch(() => null);
  if (response.status === 401 || response.status === 403) {
    expireSession();
    throw new Error("세션이 만료됐습니다. 다시 로그인하세요.");
  }
  if (!response.ok) throw new Error(data?.error ?? data?.errors?.join("\n") ?? "request failed");
  return data as T;
}

export async function login(username: string, secret: string) {
  const result = await api<{ session: string }>("/api/login", {
    method: "POST",
    body: JSON.stringify({ username, secret }),
  });
  saveSession(result.session);
  return result.session;
}

export async function uploadAsset(profileId: string, kind: "mods" | "resourcePacks" | "shaders", file: File) {
  const form = new FormData();
  form.set("profileId", profileId);
  form.set("kind", kind);
  form.set("file", file);
  const session = getSession();
  const response = await fetch("/api/uploads", {
    method: "POST",
    headers: session ? { "x-admin-session": session } : undefined,
    body: form,
  });
  const data = await response.json().catch(() => null) as { asset?: LauncherAsset; error?: string } | null;
  if (response.status === 401 || response.status === 403) {
    expireSession();
    throw new Error("세션이 만료됐습니다. 다시 로그인하세요.");
  }
  if (!response.ok || !data?.asset) throw new Error(data?.error ?? "upload failed");
  return data.asset;
}

export const loadProfiles = () => api<{ profiles: ProfilesManifest; sha: string | null; source: string }>("/api/profiles");
export const loadLauncherMeta = (minecraftVersion?: string) => api<LauncherMeta>(`/api/meta${minecraftVersion ? `?minecraftVersion=${encodeURIComponent(minecraftVersion)}` : ""}`);
export const validateProfiles = (profiles: ProfilesManifest) => api<{ ok: boolean; errors: string[] }>("/api/validate", { method: "POST", body: JSON.stringify({ profiles }) });
export const saveProfiles = (profiles: ProfilesManifest) => api<{ ok: boolean; sha: string | null; deletedProfileUploads?: number }>("/api/profiles", { method: "PUT", body: JSON.stringify({ profiles }) });
