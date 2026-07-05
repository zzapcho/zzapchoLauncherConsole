import type { LauncherAsset, LauncherProfile } from "../../shared/profileTypes";

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

interface ModrinthSearchHit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  icon_url?: string;
  project_type: ProjectKind;
  author?: string;
  follows?: number;
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
  files: ModrinthVersionFile[];
}

const typeFacet = (kind: ProjectKind) => JSON.stringify([["project_type:" + kind]]);
const loaderParam = (profile: LauncherProfile) => profile.modLoader === "vanilla" ? [] : [profile.modLoader];

export async function searchModrinthProjects(kind: ProjectKind, query: string): Promise<ExternalProject[]> {
  const params = new URLSearchParams({ query, limit: "12", facets: typeFacet(kind) });
  const response = await fetch("https://api.modrinth.com/v2/search?" + params.toString());
  if (!response.ok) throw new Error("Modrinth search failed");
  const data = await response.json() as { hits: ModrinthSearchHit[] };
  return data.hits.map((hit) => ({
    source: "modrinth",
    projectId: hit.project_id,
    slug: hit.slug,
    title: hit.title,
    description: hit.description,
    iconUrl: hit.icon_url,
    projectType: hit.project_type,
    author: hit.author,
    follows: hit.follows,
  }));
}

export async function getModrinthAsset(project: ExternalProject, profile: LauncherProfile): Promise<LauncherAsset> {
  const params = new URLSearchParams();
  params.set("game_versions", JSON.stringify([profile.minecraftVersion]));
  const loaders = loaderParam(profile);
  if (loaders.length) params.set("loaders", JSON.stringify(loaders));
  const response = await fetch(`https://api.modrinth.com/v2/project/${project.slug}/version?${params.toString()}`);
  if (!response.ok) throw new Error("Modrinth version lookup failed");
  const versions = await response.json() as ModrinthVersion[];
  const version = versions[0];
  const file = version?.files.find((item) => item.primary) ?? version?.files[0];
  if (!version || !file) throw new Error("No matching file for this profile");
  return { id: project.slug, name: project.title, version: version.version_number, required: true, url: file.url, sha256: file.hashes?.sha512 ?? file.hashes?.sha1 };
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
