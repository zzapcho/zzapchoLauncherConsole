import type { ProfilesManifest } from "../../shared/profileTypes";

const KEY = "zzapchoLauncherConsole.session";

export const getSession = () => localStorage.getItem(KEY) ?? "";
export const saveSession = (value: string) => localStorage.setItem(KEY, value);
export const clearSession = () => localStorage.removeItem(KEY);

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = getSession();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session) headers["x-admin-session"] = session;
  const response = await fetch(path, { ...init, headers: { ...headers, ...init.headers } });
  const data = await response.json().catch(() => null);
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

export const loadProfiles = () => api<{ profiles: ProfilesManifest; sha: string | null; source: string }>("/api/profiles");
export const validateProfiles = (profiles: ProfilesManifest) => api<{ ok: boolean; errors: string[] }>("/api/validate", { method: "POST", body: JSON.stringify({ profiles }) });
export const saveProfiles = (profiles: ProfilesManifest) => api<{ ok: boolean; sha: string | null }>("/api/profiles", { method: "PUT", body: JSON.stringify({ profiles }) });
