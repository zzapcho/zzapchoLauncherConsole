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

const kindMeta: Record<AssetKind, { label: string; ext: string }> = {
  mods: { label: "모드", ext: ".jar" },
  resourcePacks: { label: "리소스팩", ext: ".zip" },
  shaders: { label: "쉐이더", ext: ".zip" },
};

let profilesCache: ProfilesManifest | null = null;
let loading = false;
let registered = false;
let timer = 0;

function injectStyle() {
  if (document.getElementById("fresh-asset-sheet-style")) return;
  const style = document.createElement("style");
  style.id = "fresh-asset-sheet-style";
  style.textContent = `
    #fresh-console .fc-version-chip{display:inline-flex;align-items:center;gap:5px;width:fit-content;max-width:100%;min-height:22px;padding:3px 8px;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(255,255,255,.055);color:#cbd5e1;cursor:pointer;font-size:.72rem;font-weight:850;line-height:1;white-space:nowrap}
    #fresh-console .fc-version-chip:hover{border-color:rgba(255,255,255,.22);background:rgba(255,255,255,.08);color:#eef2f7}
    #fresh-console .fc-version-chip.has-warning{border-color:rgba(251,191,36,.32);background:rgba(251,191,36,.08);color:#fbbf24}
    #fresh-console .fc-library-bar{grid-template-columns:100px 82px minmax(0,1fr)}
    #fresh-console .fc-link-add-button{white-space:nowrap}
    #fresh-console .fc-results{max-height:none!important;overflow:visible!important}
    #fresh-console .fc-assets{min-height:720px}
    #fresh-console .fc-side{align-self:stretch}.fc-side .fc-section:last-child{min-height:126px}
    .fc-sheet-backdrop{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:18px;background:rgba(0,0,0,.48);backdrop-filter:blur(10px)}
    .fc-asset-sheet{width:min(560px,100%);max-height:min(720px,calc(100svh - 36px));display:flex;flex-direction:column;border:1px solid rgba(255,255,255,.14);border-radius:26px;background:#101722;color:#eef2f7;box-shadow:0 24px 80px rgba(0,0,0,.55);overflow:hidden;animation:fc-sheet-in .18s ease both}
    .fc-asset-sheet header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 16px 12px;border-bottom:1px solid rgba(255,255,255,.08)}
    .fc-asset-sheet header p{margin:0 0 4px;color:#98a3b3;font-size:.72rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.fc-asset-sheet header h3{margin:0;font-size:1.06rem;letter-spacing:-.03em}.fc-asset-sheet header button{width:36px;height:36px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:#171f2b;color:#eef2f7}
    .fc-asset-sheet-body{min-height:0;overflow:auto;padding:14px 16px 16px}.fc-asset-sheet-note{margin:0 0 12px;color:#98a3b3;font-size:.84rem;line-height:1.45}
    .fc-sheet-input{display:grid;gap:7px;margin-bottom:10px}.fc-sheet-input span{color:#98a3b3;font-size:.75rem;font-weight:850}.fc-sheet-input input{width:100%;min-height:44px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:#0c1119;color:#eef2f7;padding:0 12px;font:inherit;outline:none}.fc-sheet-input input:focus{border-color:rgba(125,211,252,.55)}
    .fc-version-list{display:grid;gap:8px}.fc-version-option{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;width:100%;min-height:58px;padding:10px;border:1px solid rgba(255,255,255,.09);border-radius:16px;background:#0d1118;color:#eef2f7;text-align:left}.fc-version-option:hover{border-color:rgba(255,255,255,.18);background:#141c29}.fc-version-option strong,.fc-version-option small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fc-version-option small{margin-top:3px;color:#98a3b3}.fc-version-option b{padding:5px 8px;border-radius:999px;background:rgba(255,255,255,.08);font-size:.72rem}.fc-version-option.warn b{color:#fbbf24;background:rgba(251,191,36,.09)}
    .fc-sheet-actions{display:flex;gap:8px;margin-top:12px}.fc-sheet-actions button{flex:1;min-height:44px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:#171f2b;color:#eef2f7;font-weight:850}.fc-sheet-actions button.primary{background:#e5e7eb;color:#070a0f}
    @keyframes fc-sheet-in{from{opacity:0;transform:translateY(12px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
    @media(max-width:860px){#fresh-console .fc-version-chip{min-height:21px;padding:3px 7px;font-size:.68rem}#fresh-console .fc-library-bar{grid-template-columns:76px 62px minmax(0,1fr)!important}#fresh-console .fc-assets{min-height:calc(100svh - 180px)}.fc-sheet-backdrop{align-items:end;padding:10px 10px calc(10px + env(safe-area-inset-bottom))}.fc-asset-sheet{max-height:min(680px,calc(100svh - 24px));border-radius:24px}.fc-version-option{grid-template-columns:1fr}.fc-version-option b{width:max-content}}
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
  const lines = [`버전: ${cleanVersion(asset.version || asset.fileName || "버전 없음")}`, "클릭해서 버전 선택"];
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

function optionLabel(version: ModrinthVersion, profile: LauncherProfile) {
  const versions = version.game_versions ?? [];
  const warning = versions.length > 0 && !versions.includes(profile.minecraftVersion);
  return { support: shortSupportLabel(versions), warning };
}

function buildUpdatedAsset(asset: LauncherAsset, version: ModrinthVersion): LauncherAsset {
  const file = versionFile(version);
  return {
    ...asset,
    version: version.version_number,
    url: file?.url ?? asset.url,
    sha1: file?.hashes?.sha1,
    sha512: file?.hashes?.sha512,
    fileId: version.id,
    fileName: file?.filename ?? asset.fileName,
    supportedGameVersions: version.game_versions ?? [],
  };
}

async function saveAsset(profile: LauncherProfile, kind: AssetKind, asset: LauncherAsset, nextAsset: LauncherAsset) {
  const profiles = profilesCache ?? (await freshProfiles());
  const profileIndex = profiles.findIndex((item) => item.id === profile.id);
  if (profileIndex < 0) throw new Error("현재 프로필을 찾지 못했습니다.");
  const nextProfiles = profiles.map((item) => ({ ...item }));
  const targetProfile = { ...nextProfiles[profileIndex] };
  const nextItems = [...targetProfile[kind]];
  const assetIndex = nextItems.findIndex((item) => item.id === asset.id && item.name === asset.name);
  if (assetIndex < 0) throw new Error("파일을 찾지 못했습니다.");
  nextItems[assetIndex] = nextAsset;
  targetProfile[kind] = nextItems as never;
  nextProfiles[profileIndex] = targetProfile;
  await saveProfiles(nextProfiles);
  profilesCache = nextProfiles;
}

function sheet(title: string, subtitle: string) {
  closeSheets();
  const backdrop = document.createElement("div");
  backdrop.className = "fc-sheet-backdrop";
  const panel = document.createElement("section");
  panel.className = "fc-asset-sheet";
  panel.innerHTML = `<header><div><p>${subtitle}</p><h3>${title}</h3></div><button type="button" aria-label="닫기">×</button></header><div class="fc-asset-sheet-body"></div>`;
  panel.querySelector("button")?.addEventListener("click", closeSheets);
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) closeSheets(); });
  backdrop.append(panel);
  document.body.append(backdrop);
  return panel.querySelector<HTMLElement>(".fc-asset-sheet-body")!;
}

function closeSheets() {
  document.querySelectorAll(".fc-sheet-backdrop").forEach((node) => node.remove());
}

async function openVersionSheet(profile: LauncherProfile, kind: AssetKind, asset: LauncherAsset, chip: HTMLElement) {
  const body = sheet(asset.name, "Version");
  const current = cleanVersion(asset.version || asset.fileName || "버전 없음");
  body.innerHTML = `<p class="fc-asset-sheet-note">현재 버전: <b>${current}</b><br/>버전을 고르면 파일 URL과 지원 버전도 같이 저장됩니다.</p>`;

  if (asset.source !== "modrinth" || !asset.projectId) {
    body.insertAdjacentHTML("beforeend", `<label class="fc-sheet-input"><span>표시 버전</span><input value="${current.replace(/"/g, "&quot;")}" /></label><div class="fc-sheet-actions"><button type="button">취소</button><button type="button" class="primary">저장</button></div>`);
    const input = body.querySelector<HTMLInputElement>("input")!;
    const buttons = body.querySelectorAll<HTMLButtonElement>(".fc-sheet-actions button");
    buttons[0].addEventListener("click", closeSheets);
    buttons[1].addEventListener("click", () => void (async () => {
      const value = input.value.trim();
      if (!value) return;
      buttons[1].textContent = "저장 중";
      await saveAsset(profile, kind, asset, { ...asset, version: value });
      chip.textContent = value;
      closeSheets();
      schedule();
    })());
    input.focus();
    return;
  }

  body.insertAdjacentHTML("beforeend", `<label class="fc-sheet-input"><span>버전 검색</span><input placeholder="버전 번호 / 파일명 검색" /></label><div class="fc-version-list"><p class="fc-asset-sheet-note">버전 불러오는 중...</p></div>`);
  const input = body.querySelector<HTMLInputElement>("input")!;
  const list = body.querySelector<HTMLElement>(".fc-version-list")!;
  const versions = await fetchModrinthVersions(asset);

  function render(filter = "") {
    const keyword = filter.trim().toLowerCase();
    const visible = versions.filter((version) => {
      const file = versionFile(version);
      return !keyword || version.version_number.toLowerCase().includes(keyword) || file?.filename.toLowerCase().includes(keyword);
    }).slice(0, 48);
    list.innerHTML = "";
    if (!visible.length) {
      list.innerHTML = `<p class="fc-asset-sheet-note">표시할 버전 없음</p>`;
      return;
    }
    for (const version of visible) {
      const file = versionFile(version);
      const info = optionLabel(version, profile);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `fc-version-option ${info.warning ? "warn" : ""}`;
      button.title = `지원 버전: ${(version.game_versions ?? []).join(", ")}`;
      button.innerHTML = `<span><strong>${version.version_number}</strong><small>${file?.filename ?? "파일 정보 없음"}</small></span><b>${info.warning ? "⚠ " : ""}${info.support}</b>`;
      button.addEventListener("click", () => void (async () => {
        button.querySelector("b")!.textContent = "저장 중";
        const nextAsset = buildUpdatedAsset(asset, version);
        await saveAsset(profile, kind, asset, nextAsset);
        chip.textContent = displayVersion(profile, nextAsset);
        chip.title = fullSupportTitle(profile, nextAsset);
        chip.classList.toggle("has-warning", chip.textContent.includes("⚠"));
        closeSheets();
        schedule();
      })());
      list.append(button);
    }
  }

  input.addEventListener("input", () => render(input.value));
  render();
  input.focus();
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

function makeLinkedAsset(kind: AssetKind, rawUrl: string, name: string, version: string): LauncherAsset {
  const meta = kindMeta[kind];
  const fileName = urlFileName(rawUrl);
  if (!fileName.toLowerCase().endsWith(meta.ext)) throw new Error(`${meta.label} 링크는 ${meta.ext} 파일 링크여야 합니다.`);
  return {
    id: `link-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: name || nameFromFileName(fileName),
    version: version || "link",
    required: true,
    url: rawUrl,
    source: "manual",
    fileName,
  };
}

function openLinkSheet() {
  const kind = activeKind();
  const profile = findProfile();
  if (!kind || !profile) return;
  const meta = kindMeta[kind];
  const body = sheet(`${meta.label} 링크 추가`, "Link");
  body.innerHTML = `<p class="fc-asset-sheet-note">브라우저 팝업 없이 사이트 안에서 파일 링크를 추가합니다.</p><label class="fc-sheet-input"><span>파일 링크</span><input class="link-url" placeholder="https://example.com/file${meta.ext}" /></label><label class="fc-sheet-input"><span>표시 이름</span><input class="link-name" placeholder="비워두면 파일명으로 자동" /></label><label class="fc-sheet-input"><span>버전</span><input class="link-version" placeholder="예: 1.0.0 / link" /></label><div class="fc-sheet-actions"><button type="button">취소</button><button type="button" class="primary">추가</button></div>`;
  const urlInput = body.querySelector<HTMLInputElement>(".link-url")!;
  const nameInput = body.querySelector<HTMLInputElement>(".link-name")!;
  const versionInput = body.querySelector<HTMLInputElement>(".link-version")!;
  const buttons = body.querySelectorAll<HTMLButtonElement>(".fc-sheet-actions button");
  urlInput.addEventListener("input", () => {
    const fileName = urlFileName(urlInput.value.trim());
    if (!nameInput.value.trim()) nameInput.value = nameFromFileName(fileName);
  });
  buttons[0].addEventListener("click", closeSheets);
  buttons[1].addEventListener("click", () => void (async () => {
    const url = urlInput.value.trim();
    if (!isValidUrl(url)) {
      urlInput.focus();
      urlInput.setCustomValidity("http/https 파일 링크만 가능");
      urlInput.reportValidity();
      urlInput.setCustomValidity("");
      return;
    }
    buttons[1].textContent = "추가 중";
    buttons[1].disabled = true;
    const profiles = await freshProfiles();
    const profileIndex = profiles.findIndex((item) => item.id === profile.id);
    if (profileIndex < 0) throw new Error("현재 프로필을 찾지 못했습니다.");
    const nextProfiles = profiles.map((item) => ({ ...item }));
    const targetProfile = { ...nextProfiles[profileIndex] };
    targetProfile[kind] = [...targetProfile[kind], makeLinkedAsset(kind, url, nameInput.value.trim(), versionInput.value.trim())] as never;
    nextProfiles[profileIndex] = targetProfile;
    await saveProfiles(nextProfiles);
    profilesCache = nextProfiles;
    closeSheets();
    window.location.reload();
  })().catch((error) => {
    buttons[1].textContent = error instanceof Error ? error.message : "추가 실패";
    buttons[1].disabled = false;
  }));
  urlInput.focus();
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
  button.addEventListener("click", openLinkSheet);
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
    chip.addEventListener("click", () => void openVersionSheet(profile, kind, asset, chip).catch((error) => {
      chip.textContent = error instanceof Error ? error.message : "버전 불러오기 실패";
    }));
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
