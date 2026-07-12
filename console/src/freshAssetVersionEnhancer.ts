import { loadProfiles, saveProfiles } from "./api";
import type { LauncherAsset, LauncherProfile, ProfilesManifest } from "../../shared/profileTypes";

type AssetKind = "mods" | "resourcePacks" | "shaders";

interface ModrinthVersionFile {
  filename: string;
  url: string;
  hashes?: { sha1?: string; sha512?: string };
  primary?: boolean;
}

interface ModrinthVersion {
  id: string;
  version_number: string;
  game_versions?: string[];
  files: ModrinthVersionFile[];
}

const labelToKind: Record<string, AssetKind> = {
  "모드": "mods",
  "리팩": "resourcePacks",
  "쉐이더": "shaders",
};

let profilesCache: ProfilesManifest | null = null;
let loading = false;
let registered = false;
let timer = 0;

function stripCount(value: string) {
  return value.replace(/\d+/g, "").trim();
}

function cleanVersion(value: string) {
  return value.replace(/\s·\s지원\s.*$/u, "").replace(/\s·\s⚠\s.*$/u, "").trim();
}

function activeProfileName() {
  return document.querySelector<HTMLElement>("#fresh-console .fc-editor-title h2")?.textContent?.trim() ?? "";
}

function activeKind(): AssetKind | null {
  const label = stripCount(document.querySelector<HTMLElement>("#fresh-console .fc-tabs button.active")?.textContent ?? "");
  return labelToKind[label] ?? null;
}

function fullSupportTitle(asset: LauncherAsset) {
  const versions = asset.supportedGameVersions ?? [];
  if (!versions.length) return "클릭해서 버전을 수정";
  return `지원 버전: ${versions.join(", ")}\n클릭해서 버전 수정`;
}

function shortSupportLabel(versions: string[]) {
  if (!versions.length) return "";
  if (versions.length <= 3) return `지원 ${versions.join(", ")}`;
  return `지원 ${versions[0]} 외 ${versions.length - 1}개`;
}

function displayVersion(profile: LauncherProfile, asset: LauncherAsset) {
  const base = asset.version || asset.fileName || asset.source || "버전 없음";
  const versions = asset.supportedGameVersions ?? [];
  if (!versions.length || base.includes("지원 ")) return base;
  const warning = versions.includes(profile.minecraftVersion) ? "" : ` · ⚠ 현재 ${profile.minecraftVersion}와 다름`;
  return `${base} · ${shortSupportLabel(versions)}${warning}`;
}

async function ensureProfiles() {
  if (profilesCache || loading) return;
  loading = true;
  try {
    profilesCache = (await loadProfiles()).profiles;
  } catch {
    profilesCache = null;
  } finally {
    loading = false;
  }
}

function findProfile() {
  const name = activeProfileName();
  return profilesCache?.find((profile) => profile.name === name) ?? null;
}

function matchAsset(items: LauncherAsset[], row: HTMLElement, index: number) {
  const rowName = row.querySelector<HTMLElement>("main strong")?.textContent?.trim();
  return items[index] ?? items.find((asset) => asset.name === rowName) ?? null;
}

function versionFile(version: ModrinthVersion) {
  return version.files.find((file) => file.primary) ?? version.files[0];
}

async function fetchModrinthVersions(asset: LauncherAsset) {
  const project = asset.projectId ?? asset.id;
  const response = await fetch(`https://api.modrinth.com/v2/project/${encodeURIComponent(project)}/version`);
  if (!response.ok) return [];
  return response.json() as Promise<ModrinthVersion[]>;
}

function optionPreview(version: ModrinthVersion) {
  const support = version.game_versions?.length ? ` / ${shortSupportLabel(version.game_versions)}` : "";
  return `${version.version_number}${support}`;
}

async function buildUpdatedAsset(asset: LauncherAsset, manualVersion: string) {
  if (asset.source !== "modrinth" || !asset.projectId) return { ...asset, version: manualVersion };

  const versions = await fetchModrinthVersions(asset);
  const selected = versions.find((version) => version.version_number === manualVersion)
    ?? versions.find((version) => version.files.some((file) => file.filename === manualVersion));
  if (!selected) return { ...asset, version: manualVersion };

  const file = versionFile(selected);
  if (!file) return { ...asset, version: manualVersion, supportedGameVersions: selected.game_versions ?? [] };

  return {
    ...asset,
    version: selected.version_number,
    url: file.url,
    sha1: file.hashes?.sha1,
    sha512: file.hashes?.sha512,
    fileId: selected.id,
    fileName: file.filename,
    supportedGameVersions: selected.game_versions ?? [],
  };
}

async function askVersion(asset: LauncherAsset) {
  if (asset.source !== "modrinth" || !asset.projectId) {
    return window.prompt(`${asset.name} 표시 버전 수정`, cleanVersion(asset.version || asset.fileName || ""));
  }

  const versions = await fetchModrinthVersions(asset);
  const preview = versions.slice(0, 18).map((version) => `- ${optionPreview(version)}`).join("\n");
  const help = preview ? `\n\n사용 가능한 버전 예시:\n${preview}` : "";
  return window.prompt(`${asset.name} 버전 입력\n버전 번호를 정확히 입력하면 파일 URL도 같이 바뀝니다.${help}`, cleanVersion(asset.version || asset.fileName || ""));
}

async function editVersion(profile: LauncherProfile, kind: AssetKind, asset: LauncherAsset, chip: HTMLElement) {
  const next = await askVersion(asset);
  if (next === null) return;
  const trimmed = next.trim();
  if (!trimmed) return;

  const profiles = profilesCache ?? (await loadProfiles()).profiles;
  const profileIndex = profiles.findIndex((item) => item.id === profile.id);
  if (profileIndex < 0) return;

  const nextProfiles = profiles.map((item) => ({ ...item }));
  const targetProfile = { ...nextProfiles[profileIndex] };
  const nextItems = [...targetProfile[kind]];
  const assetIndex = nextItems.findIndex((item) => item.id === asset.id && item.name === asset.name);
  if (assetIndex < 0) return;

  nextItems[assetIndex] = await buildUpdatedAsset(nextItems[assetIndex], trimmed);
  targetProfile[kind] = nextItems as never;
  nextProfiles[profileIndex] = targetProfile;

  chip.textContent = "저장 중...";
  await saveProfiles(nextProfiles);
  profilesCache = nextProfiles;
  enhanceNow();
}

function enhanceNow() {
  void ensureProfiles();
  const profile = findProfile();
  const kind = activeKind();
  if (!profile || !kind) return;

  const rows = Array.from(document.querySelectorAll<HTMLElement>("#fresh-console .fc-installed .fc-asset-row"));
  const items = profile[kind] ?? [];
  rows.forEach((row, index) => {
    const asset = matchAsset(items, row, index);
    const chip = row.querySelector<HTMLElement>("main small");
    if (!asset || !chip) return;

    const text = displayVersion(profile, asset);
    if (chip.textContent !== text) chip.textContent = text;
    chip.title = fullSupportTitle(asset);
    chip.classList.add("fc-version-chip");
    chip.classList.toggle("has-warning", text.includes("⚠"));
    if (chip.dataset.versionEnhancer === "1") return;
    chip.dataset.versionEnhancer = "1";
    chip.addEventListener("click", () => {
      void editVersion(profile, kind, asset, chip).catch((error) => {
        chip.textContent = error instanceof Error ? error.message : "수정 실패";
      });
    });
  });
}

function schedule() {
  window.clearTimeout(timer);
  timer = window.setTimeout(enhanceNow, 120);
}

export function registerFreshAssetVersionEnhancer() {
  if (registered || typeof window === "undefined") return;
  registered = true;
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("focus", () => { profilesCache = null; schedule(); });
  window.setInterval(schedule, 1200);
  schedule();
}
