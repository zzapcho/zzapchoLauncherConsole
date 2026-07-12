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

const kindMeta: Record<AssetKind, { label: string; ext: string; source: LauncherAsset["source"] }> = {
  mods: { label: "모드", ext: ".jar", source: "manual" },
  resourcePacks: { label: "리소스팩", ext: ".zip", source: "manual" },
  shaders: { label: "쉐이더", ext: ".zip", source: "manual" },
};

let profilesCache: ProfilesManifest | null = null;
let loading = false;
let registered = false;
let timer = 0;

function injectStyle() {
  if (document.getElementById("fresh-asset-link-style")) return;
  const style = document.createElement("style");
  style.id = "fresh-asset-link-style";
  style.textContent = `
    #fresh-console .fc-version-chip{display:inline-flex;align-items:center;width:fit-content;max-width:100%;min-height:22px;padding:3px 8px;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(255,255,255,.055);color:#cbd5e1;cursor:pointer;font-size:.72rem;font-weight:850;line-height:1}
    #fresh-console .fc-version-chip:hover{border-color:rgba(255,255,255,.22);background:rgba(255,255,255,.08);color:#eef2f7}
    #fresh-console .fc-version-chip.has-warning{border-color:rgba(251,191,36,.32);background:rgba(251,191,36,.08);color:#fbbf24}
    #fresh-console .fc-library-bar{grid-template-columns:100px 82px minmax(0,1fr)}
    #fresh-console .fc-link-add-button{white-space:nowrap}
    @media(max-width:860px){#fresh-console .fc-version-chip{min-height:21px;padding:3px 7px;font-size:.68rem}#fresh-console .fc-library-bar{grid-template-columns:76px 62px minmax(0,1fr)!important}}
  `;
  document.head.append(style);
}

function stripCount(value: string) {
  return value.replace(/\d+/g, "").trim();
}

function cleanVersion(value: string) {
  return value.replace(/\s·\s지원\s.*$/u, "").replace(/\s·\s⚠\s.*$/u, "").replace(/\s·\s⚠$/u, "").trim();
}

function activeProfileName() {
  return document.querySelector<HTMLElement>("#fresh-console .fc-editor-title h2")?.textContent?.trim() ?? "";
}

function activeKind(): AssetKind | null {
  const label = stripCount(document.querySelector<HTMLElement>("#fresh-console .fc-tabs button.active")?.textContent ?? "");
  return labelToKind[label] ?? null;
}

function fullSupportTitle(profile: LauncherProfile, asset: LauncherAsset) {
  const versions = asset.supportedGameVersions ?? [];
  const lines = [`버전: ${cleanVersion(asset.version || asset.fileName || "버전 없음")}`, "클릭해서 버전 수정"];
  if (versions.length) {
    lines.unshift(`지원 버전: ${versions.join(", ")}`);
    if (!versions.includes(profile.minecraftVersion)) lines.unshift(`⚠ 현재 프로필 ${profile.minecraftVersion}와 지원 버전이 다름`);
  }
  return lines.join("\n");
}

function displayVersion(profile: LauncherProfile, asset: LauncherAsset) {
  const base = cleanVersion(asset.version || asset.fileName || asset.source || "버전 없음");
  const versions = asset.supportedGameVersions ?? [];
  const warning = versions.length > 0 && !versions.includes(profile.minecraftVersion);
  return warning ? `${base} · ⚠` : base;
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

async function freshProfiles() {
  const profiles = (await loadProfiles()).profiles;
  profilesCache = profiles;
  return profiles;
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

function shortSupportLabel(versions: string[]) {
  if (!versions.length) return "지원 버전 알 수 없음";
  if (versions.length <= 3) return `지원 ${versions.join(", ")}`;
  return `지원 ${versions[0]} 외 ${versions.length - 1}개`;
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

  const profiles = profilesCache ?? (await freshProfiles());
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

function urlFileName(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const last = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");
    return last || `linked-file-${Date.now()}`;
  } catch {
    const last = rawUrl.split("?")[0].split("/").filter(Boolean).pop() ?? "";
    return decodeURIComponent(last) || `linked-file-${Date.now()}`;
  }
}

function nameFromFileName(fileName: string) {
  return fileName.replace(/\.(jar|zip)$/i, "").replace(/[-_]+/g, " ").trim() || fileName;
}

function isValidUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function makeLinkedAsset(kind: AssetKind, rawUrl: string): LauncherAsset {
  const meta = kindMeta[kind];
  const fileName = urlFileName(rawUrl);
  if (!fileName.toLowerCase().endsWith(meta.ext)) {
    throw new Error(`${meta.label} 링크는 ${meta.ext} 파일 링크여야 합니다.`);
  }
  return {
    id: `link-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: nameFromFileName(fileName),
    version: "link",
    required: true,
    url: rawUrl,
    source: meta.source,
    fileName,
  };
}

async function addLinkAsset(button: HTMLButtonElement) {
  const kind = activeKind();
  const profile = findProfile();
  if (!kind || !profile) return;

  const raw = window.prompt(`${kindMeta[kind].label} 다운로드 파일 링크를 붙여넣기`, "https://");
  if (raw === null) return;
  const url = raw.trim();
  if (!isValidUrl(url)) {
    window.alert("http/https 파일 링크만 추가할 수 있음");
    return;
  }

  try {
    button.disabled = true;
    button.textContent = "추가 중";
    const profiles = await freshProfiles();
    const profileIndex = profiles.findIndex((item) => item.id === profile.id);
    if (profileIndex < 0) throw new Error("현재 프로필을 찾지 못했습니다.");
    const nextProfiles = profiles.map((item) => ({ ...item }));
    const targetProfile = { ...nextProfiles[profileIndex] };
    targetProfile[kind] = [...targetProfile[kind], makeLinkedAsset(kind, url)] as never;
    nextProfiles[profileIndex] = targetProfile;
    await saveProfiles(nextProfiles);
    profilesCache = nextProfiles;
    button.textContent = "추가됨";
    window.setTimeout(() => window.location.reload(), 350);
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "링크 추가 실패");
    button.textContent = "링크";
    button.disabled = false;
  }
}

function ensureLinkButton() {
  const bar = document.querySelector<HTMLElement>("#fresh-console .fc-library-bar");
  if (!bar || bar.querySelector(".fc-link-add-button")) return;
  const uploadButton = bar.querySelector<HTMLButtonElement>("button.fc-soft");
  if (!uploadButton) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "fc-soft fc-link-add-button";
  button.textContent = "링크";
  button.title = "다운로드 파일 링크로 추가";
  button.addEventListener("click", () => void addLinkAsset(button));
  uploadButton.insertAdjacentElement("afterend", button);
}

function enhanceNow() {
  void ensureProfiles();
  injectStyle();
  ensureLinkButton();
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
    chip.title = fullSupportTitle(profile, asset);
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
  injectStyle();
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("focus", () => { profilesCache = null; schedule(); });
  window.setInterval(schedule, 1200);
  schedule();
}
