import type React from "react";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowDown, ArrowUp, Box, CheckCircle2, ChevronDown, Copy, Download, FolderPlus, Github, Lock, LogOut, Menu, Plus, RefreshCcw, Settings2, Trash2, X } from "lucide-react";
import { clearSession, getSession, loadLauncherMeta, loadProfiles, login, saveProfiles, uploadAsset, type LauncherMeta } from "./api";
import { createEmptyProfile, guessJavaVersion, MOD_LOADERS, type LauncherAsset, type LauncherProfile, type ProfilesManifest } from "../../shared/profileTypes";
import { createProfileFromModrinthModpack, getLatestModrinthAsset, getModrinthAsset, getModrinthVersionOptions, searchCurseForgeProjects, searchModrinthProjects, type AssetVersionOption, type ExternalProject, type ProjectKind, type SourceKind } from "./externalSources";

type AssetKind = "mods" | "resourcePacks" | "shaders";
type MobileSection = "settings" | AssetKind;
type View = "home" | "new" | "modpack" | "editor";
type SaveStatus = { type: "success" | "error"; message: string; sha?: string | null } | null;
type OpenPanels = { profile: boolean; permissions: boolean };

const PAGE_SIZE = 12;
const sections: Record<AssetKind, { title: string; kind: ProjectKind; accept: string }> = {
  mods: { title: "모드", kind: "mod", accept: ".jar" },
  resourcePacks: { title: "리소스팩", kind: "resourcepack", accept: ".zip" },
  shaders: { title: "쉐이더", kind: "shader", accept: ".zip" },
};
const tabs: Array<{ id: AssetKind; label: string }> = [
  { id: "mods", label: "모드" },
  { id: "resourcePacks", label: "리팩" },
  { id: "shaders", label: "쉐이더" },
];
const editableLabels: Record<keyof LauncherProfile["editableFields"], string> = {
  server: "대표 서버",
  mods: "모드",
  resourcePacks: "리소스팩",
  shaders: "쉐이더",
  minecraftVersion: "마크 버전",
  modLoader: "로더",
  javaArgs: "Java Args",
  memory: "메모리",
};

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function shortSha(value?: string | null) { return value ? value.slice(0, 7) : "local"; }
function ramGb(profile: LauncherProfile) { return Math.round((profile.launchOptions.maxMemoryMb / 1024) * 2) / 2; }
function parseServerInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return { address: "", port: 25565 };
  const [address, rawPort] = trimmed.split(":");
  const port = rawPort ? Number(rawPort) : 25565;
  return { address: address.trim(), port: Number.isFinite(port) && port >= 1 && port <= 65535 ? port : 25565 };
}
function serverInput(profile: LauncherProfile) {
  return profile.defaultServer.port === 25565 ? profile.defaultServer.address : `${profile.defaultServer.address}:${profile.defaultServer.port}`;
}
function latestLoader(meta: LauncherMeta | null, loader: LauncherProfile["modLoader"]) {
  if (!meta || loader === "vanilla") return "";
  if (loader === "fabric") return meta.loaders.fabric[0] ?? "";
  if (loader === "forge") return meta.loaders.forge[0] ?? "";
  return meta.loaders.quilt[0] ?? "";
}
function loaderVersions(meta: LauncherMeta | null, loader: LauncherProfile["modLoader"], fallback: string) {
  if (loader === "vanilla") return [""];
  if (!meta) return [fallback].filter(Boolean);
  if (loader === "fabric") return meta.loaders.fabric.length ? meta.loaders.fabric : [fallback].filter(Boolean);
  if (loader === "forge") return meta.loaders.forge.length ? meta.loaders.forge : [fallback].filter(Boolean);
  return meta.loaders.quilt.length ? meta.loaders.quilt : [fallback].filter(Boolean);
}
function mcVersions(meta: LauncherMeta | null, current: string) {
  const list = meta?.minecraft.releases ?? [];
  return list.includes(current) ? list : [current, ...list].filter(Boolean);
}
function isModpackManaged(asset: LauncherAsset, profile: LauncherProfile) {
  if (asset.fromModpack) return true;
  return Boolean(profile.modpack && asset.source === "modrinth" && asset.version === profile.modpack.version && asset.fileName && !asset.projectId);
}
function mergeModpackAssets(current: LauncherAsset[], updated: LauncherAsset[], profile: LauncherProfile) {
  const manual = current.filter((asset) => !isModpackManaged(asset, profile));
  return [...updated.map((asset) => ({ ...asset, fromModpack: true })), ...manual];
}
function mobileSectionLabel(section: MobileSection) {
  if (section === "settings") return "설정";
  if (section === "mods") return "모드";
  if (section === "resourcePacks") return "리팩";
  return "쉐이더";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="ui-field"><span>{label}</span>{children}</label>;
}
function Toggle({ label, checked, onChange, lock }: { label: string; checked: boolean; onChange: () => void; lock?: boolean }) {
  return <button type="button" className="toggle-switch" onClick={onChange} aria-pressed={checked}><span className="toggle-label">{lock && <Lock size={13} />}{label}</span><span className={`switch-track${checked ? " checked" : ""}`}><span /></span></button>;
}
function Collapsible({ title, subtitle, open, onToggle, children }: { title: React.ReactNode; subtitle?: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return <div className="notion-card collapsible-card"><button type="button" className="card-head-v2 collapsible-head" onClick={onToggle}><h3>{title}</h3>{subtitle && <small>{subtitle}</small>}<ChevronDown className={open ? "rotated" : ""} size={18} /></button>{open && children}</div>;
}

function LoginScreen({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("admin");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try { await login(username, secret); onDone(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "로그인 실패"); }
    finally { setBusy(false); }
  }
  return <main className="login-page notion-bg"><form className="login-card-v2" onSubmit={submit}><p className="eyebrow">Admin</p><h1>Console</h1><p className="muted">관리자 계정으로 로그인해서 프로필과 콘텐츠를 관리합니다.</p><Field label="아이디"><input value={username} onChange={(event) => setUsername(event.target.value)} /></Field><Field label="비밀번호"><input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} /></Field><button className="primary-button full" disabled={busy}>{busy ? "확인 중..." : "로그인"}</button>{error && <p className="inline-error"><AlertCircle size={15} />{error}</p>}</form></main>;
}

function TopBar({ view, dirty, status, isSaving, onHome, onSave, onMenu }: { view: View; dirty: boolean; status: SaveStatus; isSaving: boolean; onHome: () => void; onSave: () => void; onMenu: () => void }) {
  return <header className="topbar-v2 clean-topbar"><div className="brand-line clean-brand"><button className="ghost-button" onClick={onHome}>홈</button><div className="brand-text"><h1>Console <span>{view === "home" ? "HOME" : dirty ? "EDIT" : "SYNC"}</span></h1></div></div><div className="top-actions-v2">{status && <div className={`save-toast ${status.type}`}>{status.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}<span>{status.message}</span>{status.sha && <code>{shortSha(status.sha)}</code>}</div>}<button className="primary-button" onClick={onSave} disabled={isSaving}>{isSaving ? "저장 중" : <><Github size={17} />저장</>}</button><button className="mobile-menu-button" onClick={onMenu}><Menu /></button></div></header>;
}

function ConfirmDeleteModal({ profile, onCancel, onConfirm }: { profile: LauncherProfile; onCancel: () => void; onConfirm: () => void }) {
  const fileCount = profile.mods.length + profile.resourcePacks.length + profile.shaders.length;
  return <div className="modal-backdrop-v2" onClick={onCancel}><section className="confirm-modal-v2" onClick={(event) => event.stopPropagation()}><div className="danger-orb"><Trash2 size={22} /></div><p className="eyebrow">Delete Profile</p><h2>정말로 삭제할까요?</h2><p className="muted"><b>{profile.name}</b> 프로필을 삭제합니다. 저장하면 서버 업로드 파일 폴더도 함께 삭제됩니다.</p><div className="delete-summary-v2"><span>프로필</span><code>{profile.name}</code><span>등록 파일</span><code>{fileCount}개</code></div><div className="modal-actions-v2"><button className="ghost-button" onClick={onCancel}>취소</button><button className="danger-button-v2" onClick={onConfirm}><Trash2 size={16} />삭제</button></div></section></div>;
}

function ProfileCard({ profile, index, total, onClick, onMove }: { profile: LauncherProfile; index: number; total: number; onClick: () => void; onMove: (index: number, offset: -1 | 1) => void }) {
  const count = profile.mods.length + profile.resourcePacks.length + profile.shaders.length;
  return <article className="profile-card-frame" style={{ "--accent": profile.accentColor } as React.CSSProperties}><button type="button" className="profile-card-v2 profile-open-button" onClick={onClick}><span className="profile-dot" /><strong>{profile.name}</strong><p>{profile.customText}</p><span className="profile-meta"><b>MC {profile.minecraftVersion}</b><b>{profile.modLoader}</b><b>{count} files</b></span></button><div className="profile-order-actions" aria-label="프로필 순서 변경"><button type="button" disabled={index === 0} onClick={() => onMove(index, -1)} title="위로"><ArrowUp size={14} /><span>위</span></button><button type="button" disabled={index === total - 1} onClick={() => onMove(index, 1)} title="아래로"><ArrowDown size={14} /><span>아래</span></button></div></article>;
}
function HomeView({ profiles, onOpen, onNew, onMove }: { profiles: ProfilesManifest; onOpen: (id: string) => void; onNew: () => void; onMove: (index: number, offset: -1 | 1) => void }) {
  return <section className="home-only-panel"><div className="home-title"><p className="eyebrow">Profiles</p><h2>프로필</h2><span>{profiles.length}개</span></div><div className="home-profile-grid">{profiles.map((profile, index) => <ProfileCard key={profile.id} profile={profile} index={index} total={profiles.length} onClick={() => onOpen(profile.id)} onMove={onMove} />)}<button className="add-profile-card home-add-card" onClick={onNew}><Plus /><span>새 프로필</span></button></div></section>;
}
function NewProfileChoice({ onCustom, onModpack, onBack }: { onCustom: () => void; onModpack: () => void; onBack: () => void }) {
  return <section className="new-choice-panel"><div className="home-title"><p className="eyebrow">Create</p><h2>새 프로필</h2><span>시작 방식 선택</span></div><div className="new-choice-grid"><button onClick={onCustom}><strong>커스텀</strong><p>최신 마크/로더를 기본값으로 직접 구성합니다.</p></button><button onClick={onModpack}><strong>모드팩</strong><p>Modrinth 모드팩을 가져와 내부 파일을 분해합니다.</p></button></div><button className="ghost-button" onClick={onBack}>홈으로</button></section>;
}

function ProfileSettings({ profile, meta, openPanels, setOpenPanels, onChange, onUpdateModpack, mobileActive }: { profile: LauncherProfile; meta: LauncherMeta | null; openPanels: OpenPanels; setOpenPanels: (next: OpenPanels) => void; onChange: (profile: LauncherProfile) => void; onUpdateModpack: () => void; mobileActive: boolean }) {
  const update = (patch: Partial<LauncherProfile>) => onChange({ ...profile, ...patch });
  const setMemoryGb = (gb: number) => update({ launchOptions: { ...profile.launchOptions, minMemoryMb: Math.round(gb * 1024), maxMemoryMb: Math.round(gb * 1024) } });
  const setMcVersion = (minecraftVersion: string) => update({ minecraftVersion, javaVersion: guessJavaVersion(minecraftVersion) });
  const setLoader = (modLoader: LauncherProfile["modLoader"]) => update({ modLoader, modLoaderVersion: latestLoader(meta, modLoader) });
  const setServer = (value: string) => { const parsed = parseServerInput(value); update({ defaultServer: { ...profile.defaultServer, address: parsed.address, port: parsed.port } }); };
  const ram = ramGb(profile);
  useEffect(() => { const latest = latestLoader(meta, profile.modLoader); if (profile.modLoader !== "vanilla" && latest && profile.modLoaderVersion !== latest) update({ modLoaderVersion: latest }); }, [meta?.loaders.fabric?.[0], meta?.loaders.forge?.[0], meta?.loaders.quilt?.[0], profile.modLoader]);
  return <section className={`settings-column mobile-pane ${mobileActive ? "mobile-pane-active" : "mobile-pane-hidden"}`} id="profile-settings-section"><Collapsible title={<><Settings2 size={18} />프로필 설정</>} subtitle="실행 기준" open={openPanels.profile} onToggle={() => setOpenPanels({ ...openPanels, profile: !openPanels.profile })}><div className="form-stack"><Field label="프로필 이름"><input value={profile.name} onChange={(event) => update({ name: event.target.value })} /></Field><Field label="커스텀 문구"><input value={profile.customText} onChange={(event) => update({ customText: event.target.value })} /></Field><div className="split-grid"><Field label="마크 버전"><select value={profile.minecraftVersion} onChange={(event) => setMcVersion(event.target.value)}>{mcVersions(meta, profile.minecraftVersion).map((version) => <option key={version}>{version}</option>)}</select></Field><Field label="Java"><input value={`Java ${profile.javaVersion}`} readOnly /></Field></div><div className="split-grid"><Field label="로더"><select value={profile.modLoader} onChange={(event) => setLoader(event.target.value as LauncherProfile["modLoader"])}>{MOD_LOADERS.map((loader) => <option key={loader}>{loader}</option>)}</select></Field><Field label="로더 버전"><select value={profile.modLoaderVersion} onChange={(event) => update({ modLoaderVersion: event.target.value })}>{loaderVersions(meta, profile.modLoader, profile.modLoaderVersion).map((version) => <option key={version} value={version}>{version || "Vanilla"}</option>)}</select></Field></div><Field label="서버 주소"><input value={serverInput(profile)} placeholder="mc.zzapcho.kr 또는 mc.zzapcho.kr:25565" onChange={(event) => setServer(event.target.value)} /></Field><Field label={`RAM ${ram}GB`}><div className="ram-control"><input type="range" min={1} max={16} step={0.5} value={ram} onChange={(event) => setMemoryGb(Number(event.target.value))} /><input type="number" min={1} max={64} step={0.5} value={ram} onChange={(event) => setMemoryGb(Number(event.target.value))} /></div></Field><Field label="강조색"><div className="color-input"><span>{profile.accentColor}</span><input type="color" value={profile.accentColor} onChange={(event) => update({ accentColor: event.target.value })} /></div></Field>{profile.modpack && <button className="secondary-button modpack-update-button" type="button" onClick={onUpdateModpack}><Download size={16} />모드팩 업데이트 하기</button>}</div></Collapsible><Collapsible title={<><Lock size={18} />런처 수정 허용</>} subtitle="true = 유저 수정 가능" open={openPanels.permissions} onToggle={() => setOpenPanels({ ...openPanels, permissions: !openPanels.permissions })}><div className="toggle-grid">{(Object.entries(profile.editableFields) as Array<[keyof LauncherProfile["editableFields"], boolean]>).map(([key, value]) => <Toggle key={key} label={editableLabels[key]} checked={value} lock onChange={() => update({ editableFields: { ...profile.editableFields, [key]: !value } })} />)}</div></Collapsible></section>;
}

function AssetIcon({ asset, profile }: { asset: LauncherAsset; profile: LauncherProfile }) {
  if (isModpackManaged(asset, profile)) return <span className="modpack-asset-badge" title="모드팩 포함 파일">M</span>;
  if (asset.iconUrl) return <img src={asset.iconUrl} alt="" />;
  return <Box size={18} />;
}

function ContentLibraryPanel({ profile, kind, onChange }: { profile: LauncherProfile; kind: AssetKind; onChange: (profile: LauncherProfile) => void }) {
  const section = sections[kind];
  const inputRef = useRef<HTMLInputElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState<SourceKind>("modrinth");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ExternalProject[]>([]);
  const [message, setMessage] = useState("인기순");
  const [busy, setBusy] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [updates, setUpdates] = useState<Record<string, LauncherAsset>>({});
  const [versionList, setVersionList] = useState<Record<string, AssetVersionOption[]>>({});
  const items = profile[kind];
  const updateItems = (next: LauncherAsset[]) => onChange({ ...profile, [kind]: next } as LauncherProfile);
  async function loadProjects(term = query, reset = true) {
    if (busy) return;
    setBusy(true);
    const offset = reset ? 0 : results.length;
    setMessage(term.trim() ? "검색 중..." : "인기순 불러오는 중...");
    try {
      const next = source === "modrinth" ? await searchModrinthProjects(section.kind, term, offset, PAGE_SIZE) : await searchCurseForgeProjects(section.kind, term || section.title);
      setResults((current) => reset ? next : [...current, ...next.filter((item) => !current.some((old) => old.projectId === item.projectId))]);
      setHasMore(source === "modrinth" && next.length >= PAGE_SIZE);
      setMessage(term.trim() ? `${reset ? next.length : offset + next.length}개 표시` : "인기순");
    } catch (error) { if (reset) setResults([]); setHasMore(false); setMessage(error instanceof Error ? error.message : "검색 실패"); }
    finally { setBusy(false); }
  }
  useEffect(() => { setQuery(""); setHasMore(true); void loadProjects("", true); }, [profile.id, kind, source]);
  useEffect(() => { const target = loadMoreRef.current; if (!target) return; const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting && hasMore && !busy && source === "modrinth") void loadProjects(query, false); }, { rootMargin: "160px" }); observer.observe(target); return () => observer.disconnect(); }, [hasMore, busy, query, results.length, source]);
  useEffect(() => { let cancelled = false; async function check() { const pairs = await Promise.all(items.map(async (asset) => { if (isModpackManaged(asset, profile) || asset.source !== "modrinth" || !asset.projectId) return null; try { const latest = await getLatestModrinthAsset(asset, profile); return latest.version !== asset.version ? [asset.id, latest] as const : null; } catch { return null; } })); if (!cancelled) setUpdates(Object.fromEntries(pairs.filter(Boolean) as Array<readonly [string, LauncherAsset]>)); } void check(); return () => { cancelled = true; }; }, [profile.minecraftVersion, profile.modLoader, profile.modpack?.version, items.map((item) => `${item.id}:${item.version}:${item.fromModpack ? "m" : ""}`).join("|")]);
  async function addFiles(files: FileList | File[]) { const nextFiles = Array.from(files).filter((file) => file.name.toLowerCase().endsWith(section.accept)); if (!nextFiles.length) { setMessage(`${section.accept} 파일만 추가할 수 있습니다.`); return; } setBusy(true); setMessage("서버에 업로드 중..."); try { const uploaded: LauncherAsset[] = []; for (const file of nextFiles) uploaded.push(await uploadAsset(profile.id, kind, file)); updateItems([...items, ...uploaded]); setMessage(`${uploaded.length}개 파일 업로드 완료`); } catch (error) { setMessage(error instanceof Error ? error.message : "업로드 실패"); } finally { setBusy(false); } }
  async function addProject(project: ExternalProject) { setBusy(true); setMessage("파일 정보 확인 중..."); try { const asset = project.source === "modrinth" ? await getModrinthAsset(project, profile) : { id: `curseforge-${project.projectId}`, name: project.title, version: profile.minecraftVersion, required: true, url: `curseforge://${project.projectId}`, source: "curseforge" as const, projectId: project.projectId, iconUrl: project.iconUrl } satisfies LauncherAsset; updateItems([...items, asset]); setMessage(`${project.title} 추가됨`); } catch (error) { setMessage(error instanceof Error ? error.message : "추가 실패"); } finally { setBusy(false); } }
  function applyUpdate(index: number) { const latest = updates[items[index].id]; if (latest) updateItems(items.map((item, i) => i === index ? latest : item)); }
  async function toggleVersions(asset: LauncherAsset) { if (versionList[asset.id]?.length) { setVersionList({ ...versionList, [asset.id]: [] }); return; } try { setVersionList({ ...versionList, [asset.id]: await getModrinthVersionOptions(asset, profile) }); } catch (error) { setMessage(error instanceof Error ? error.message : "버전 목록 실패"); } }
  function setAssetVersion(index: number, option: AssetVersionOption) { const assetId = items[index].id; updateItems(items.map((item, i) => i === index ? { ...item, version: option.version, url: option.url, sha1: option.sha1, sha512: option.sha512, fileId: option.id, fileName: option.fileName } : item)); setVersionList({ ...versionList, [assetId]: [] }); }
  return <section className="launcher-content-surface asset-clean-surface"><h2 className="content-title-shot">{section.title}</h2><div className="content-unified-scroll"><div className="installed-stack-shot installed-scroll-shot">{items.map((item, index) => <article className="installed-card-wrap" key={`${item.id}-${index}`}><div className="installed-card-shot"><span className="asset-icon-shot" onDoubleClick={() => item.projectUrl && window.open(item.projectUrl, "_blank", "noopener,noreferrer")}><AssetIcon asset={item} profile={profile} /></span><div className="installed-info"><strong>{item.name}</strong><button className="version-link-shot" onClick={() => void toggleVersions(item)}>{item.version || "버전 없음"}</button></div>{updates[item.id] && <button className="update-icon-shot" title="업데이트" onClick={() => applyUpdate(index)}><Download size={16} /></button>}<Toggle label="" checked={item.required} onChange={() => updateItems(items.map((asset, i) => i === index ? { ...asset, required: !asset.required } : asset))} /><button className="tiny-icon" type="button" onClick={() => updateItems(items.filter((_, i) => i !== index))}><X size={15} /></button></div>{versionList[item.id]?.length ? <div className="version-popover-shot">{versionList[item.id].map((option) => <button key={option.id} onClick={() => setAssetVersion(index, option)}>{option.version}<small>{option.fileName}</small></button>)}</div> : null}</article>)}{!items.length && <div className="empty-installed-shot"><span className="green-dot" />아직 적용된 {section.title} 없음</div>}</div><div className={`drop-zone-shot${dragging ? " dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void addFiles(event.dataTransfer.files); }}>파일을 여기에 끌어다 놓으세요</div><div className="library-actions-shot"><input ref={inputRef} type="file" multiple accept={section.accept} hidden onChange={(event) => { if (event.target.files) void addFiles(event.target.files); event.currentTarget.value = ""; }} /><button type="button" className="folder-button-shot equal-height-shot" onClick={() => inputRef.current?.click()}><FolderPlus size={16} />폴더에서 추가</button><form className="library-search-shot equal-height-shot" onSubmit={(event) => { event.preventDefault(); void loadProjects(query, true); }}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`${source === "modrinth" ? "Modrinth" : "CurseForge"} 검색`} /><button disabled={busy}>{busy ? "..." : "검색"}</button></form></div><div className="source-heading-shot"><div className="source-tabs-shot"><button className={source === "modrinth" ? "active" : ""} onClick={() => setSource("modrinth")}>Modrinth</button><button className={source === "curseforge" ? "active" : ""} onClick={() => setSource("curseforge")}>CurseForge</button></div><span>{message}</span></div><div className="project-list-shot project-scroll-shot">{results.map((project) => { const installed = items.some((asset) => asset.id === project.slug || asset.projectId === project.projectId || asset.id === `curseforge-${project.projectId}`); return <article className="project-row-shot" key={`${project.source}-${project.projectId}`}>{project.iconUrl ? <img src={project.iconUrl} alt="" /> : <span className="result-icon-shot"><Box size={18} /></span>}<div><strong>{project.title}</strong><small>{project.author ?? project.source} · {project.follows ? `${project.follows.toLocaleString("ko-KR")} 인기` : "호환 파일 확인"}</small></div><button type="button" disabled={busy || installed} onClick={() => void addProject(project)}>{installed ? "설치됨" : "설치"}</button></article>; })}<div className="load-more-shot" ref={loadMoreRef}>{busy ? "불러오는 중..." : hasMore && source === "modrinth" ? "더 불러오는 중..." : results.length ? "끝" : "결과 없음"}</div></div></div></section>;
}

function ModpackPicker({ onBack, onCreate }: { onBack: () => void; onCreate: (profile: LauncherProfile) => void }) {
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ExternalProject[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("인기 모드팩");
  const [hasMore, setHasMore] = useState(true);
  async function load(term = query, reset = true) { if (busy) return; setBusy(true); const offset = reset ? 0 : results.length; setMessage(term.trim() ? "검색 중..." : "인기 모드팩"); try { const next = await searchModrinthProjects("modpack", term, offset, PAGE_SIZE); setResults((current) => reset ? next : [...current, ...next.filter((item) => !current.some((old) => old.projectId === item.projectId))]); setHasMore(next.length >= PAGE_SIZE); } catch (error) { if (reset) setResults([]); setHasMore(false); setMessage(error instanceof Error ? error.message : "검색 실패"); } finally { setBusy(false); } }
  useEffect(() => { void load("", true); }, []);
  useEffect(() => { const target = loadMoreRef.current; if (!target) return; const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting && hasMore && !busy) void load(query, false); }, { rootMargin: "180px" }); observer.observe(target); return () => observer.disconnect(); }, [hasMore, busy, query, results.length]);
  async function select(project: ExternalProject) { setBusy(true); setMessage(".mrpack 분석 중..."); try { onCreate(await createProfileFromModrinthModpack(project)); } catch (error) { setMessage(error instanceof Error ? error.message : "모드팩 분석 실패"); } finally { setBusy(false); } }
  return <section className="modpack-page-shot"><div className="home-title"><p className="eyebrow">Modpacks</p><h2>모드팩 선택</h2><span>{message}</span></div><form className="library-search-shot modpack-search" onSubmit={(event) => { event.preventDefault(); void load(query, true); }}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Modrinth 모드팩 검색" /><button disabled={busy}>{busy ? "..." : "검색"}</button></form><div className="project-list-shot modpack-list">{results.map((project) => <article className="project-row-shot" key={project.projectId}>{project.iconUrl ? <img src={project.iconUrl} alt="" /> : <span className="result-icon-shot"><Box size={18} /></span>}<div><strong>{project.title}</strong><small>{project.author ?? "Modrinth"} · 내부 파일을 mods/resourcePacks/shaders로 분해</small></div><button disabled={busy} onClick={() => void select(project)}>선택</button></article>)}<div className="load-more-shot" ref={loadMoreRef}>{busy ? "불러오는 중..." : hasMore ? "더 불러오는 중..." : "끝"}</div></div><button className="ghost-button" onClick={onBack}>뒤로</button></section>;
}

function MobileEditorNav({ profile, active, onSelect }: { profile: LauncherProfile; active: MobileSection; onSelect: (section: MobileSection) => void }) {
  const items: Array<{ id: MobileSection; label: string; count?: number }> = [
    { id: "settings", label: "설정" },
    { id: "mods", label: "모드", count: profile.mods.length },
    { id: "resourcePacks", label: "리팩", count: profile.resourcePacks.length },
    { id: "shaders", label: "쉐이더", count: profile.shaders.length },
  ];
  return <nav className="mobile-editor-nav" aria-label="모바일 프로필 탭"><div className="mobile-editor-nav-title"><strong>{profile.name}</strong><span>{mobileSectionLabel(active)}</span></div><div className="mobile-editor-nav-tabs">{items.map((item) => <button key={item.id} className={active === item.id ? "active" : ""} onClick={() => onSelect(item.id)}>{item.label}{typeof item.count === "number" && <b>{item.count}</b>}</button>)}</div></nav>;
}

export function ConsoleApp() {
  const [sessionReady, setSessionReady] = useState(Boolean(getSession()));
  const [profiles, setProfiles] = useState<ProfilesManifest>([]);
  const [selectedId, setSelectedId] = useState("");
  const [view, setView] = useState<View>("home");
  const [activeTab, setActiveTab] = useState<AssetKind>("shaders");
  const [mobileSection, setMobileSection] = useState<MobileSection>("settings");
  const [dirty, setDirty] = useState(false);
  const [statusText, setStatusText] = useState("서버 연결 대기 중");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LauncherProfile | null>(null);
  const [meta, setMeta] = useState<LauncherMeta | null>(null);
  const [openPanels, setOpenPanels] = useState<OpenPanels>({ profile: true, permissions: true });
  const selected = profiles.find((profile) => profile.id === selectedId) ?? profiles[0];
  useEffect(() => { void loadLauncherMeta().then(setMeta).catch(() => undefined); }, []);
  useEffect(() => { if (selected?.minecraftVersion) void loadLauncherMeta(selected.minecraftVersion).then(setMeta).catch(() => undefined); }, [selected?.minecraftVersion]);
  async function reload() { setStatusText("불러오는 중..."); const result = await loadProfiles(); setProfiles(result.profiles); setSelectedId(result.profiles[0]?.id ?? ""); setDirty(false); setView("home"); setMobileSection("settings"); setStatusText(result.source === "local" ? "서버 로컬 저장소에서 불러옴" : "아직 저장된 프로필 없음"); }
  useEffect(() => { if (sessionReady) reload().catch((error) => setStatusText(error instanceof Error ? error.message : "불러오기 실패")); }, [sessionReady]);
  function setProfile(next: LauncherProfile) { setProfiles((items) => items.map((item) => item.id === selected?.id ? next : item)); setSelectedId(next.id); setDirty(true); }
  function createCustomProfile() { const profile = createEmptyProfile(); if (meta?.minecraft.latestRelease) { profile.minecraftVersion = meta.minecraft.latestRelease; profile.javaVersion = guessJavaVersion(profile.minecraftVersion); profile.modLoaderVersion = latestLoader(meta, profile.modLoader) || profile.modLoaderVersion; } setProfiles((items) => [...items, profile]); setSelectedId(profile.id); setView("editor"); setMobileSection("settings"); setDirty(true); }
  function createModpackProfile(profile: LauncherProfile) { setProfiles((items) => [...items, profile]); setSelectedId(profile.id); setView("editor"); setMobileSection("settings"); setDirty(true); }
  function openProfile(id: string) { setSelectedId(id); setView("editor"); setMobileSection("settings"); }
  function selectMobile(section: MobileSection) { setMobileSection(section); if (section !== "settings") setActiveTab(section); }
  function selectAssetTab(tab: AssetKind) { setActiveTab(tab); setMobileSection(tab); }
  function moveProfile(index: number, offset: -1 | 1) { const target = index + offset; if (target < 0 || target >= profiles.length) return; setProfiles((items) => { const next = [...items]; const current = next[index]; next[index] = next[target]; next[target] = current; return next; }); setDirty(true); setStatusText("프로필 순서 변경됨. 저장하면 반영됩니다."); }
  function duplicate() { if (!selected) return; const profile = clone(selected); profile.id = `${selected.id}-copy-${Date.now().toString().slice(-4)}`; profile.name = `${selected.name} Copy`; setProfiles((items) => [...items, profile]); setSelectedId(profile.id); setView("editor"); setMobileSection("settings"); setDirty(true); }
  function confirmRemove() { if (!deleteTarget) return; setProfiles((items) => items.filter((item) => item.id !== deleteTarget.id)); setSelectedId(""); setDeleteTarget(null); setView("home"); setMobileSection("settings"); setDirty(true); setStatusText("프로필 삭제됨. 저장하면 서버 업로드 파일도 정리됩니다."); }
  function exportJson() { void navigator.clipboard.writeText(JSON.stringify(profiles, null, 2)); setStatusText("JSON 클립보드 복사 완료"); }
  async function updateModpack() {
    if (!selected?.modpack) return;
    if (selected.modpack.source !== "modrinth") { setStatusText("현재 CurseForge 모드팩 업데이트는 아직 준비 중입니다."); return; }
    const project: ExternalProject = { source: "modrinth", projectId: selected.modpack.projectId, slug: selected.modpack.slug, title: selected.modpack.title, description: selected.description, projectType: "modpack" };
    setStatusText("모드팩 업데이트 확인 중...");
    try {
      const updated = await createProfileFromModrinthModpack(project);
      setProfile({
        ...selected,
        mods: mergeModpackAssets(selected.mods, updated.mods, selected),
        resourcePacks: mergeModpackAssets(selected.resourcePacks, updated.resourcePacks, selected),
        shaders: mergeModpackAssets(selected.shaders, updated.shaders, selected),
        modpack: updated.modpack ?? selected.modpack,
      });
      setStatusText("모드팩 포함 파일만 업데이트됨. 직접 추가한 파일은 유지했습니다.");
    } catch (error) { setStatusText(error instanceof Error ? error.message : "모드팩 업데이트 실패"); }
  }
  async function save() { setIsSaving(true); setStatusText("서버에 저장 중..."); try { const result = await saveProfiles(profiles); setDirty(false); const deletedText = result.deletedProfileUploads ? ` · 삭제 프로필 파일 ${result.deletedProfileUploads}개 정리` : ""; setStatusText(`서버 저장 완료${deletedText}`); setSaveStatus({ type: "success", message: "저장됨", sha: result.sha }); } catch (error) { const message = error instanceof Error ? error.message : "저장 실패"; setStatusText(message); setSaveStatus({ type: "error", message }); } finally { setIsSaving(false); } }
  if (!sessionReady) return <LoginScreen onDone={() => setSessionReady(true)} />;
  return <main className="app-v2 notion-bg"><TopBar view={view} dirty={dirty} status={saveStatus} isSaving={isSaving} onHome={() => setView("home")} onSave={save} onMenu={() => setMenuOpen(true)} />{menuOpen && <div className="mobile-sheet-backdrop" onClick={() => setMenuOpen(false)}><div className="mobile-sheet console-mobile-menu" onClick={(event) => event.stopPropagation()}><button className="sheet-close" onClick={() => setMenuOpen(false)}><X /></button><div className="mobile-menu-heading"><strong>콘솔 메뉴</strong><span>{dirty ? "저장 필요" : "동기화됨"}</span></div><button onClick={() => { exportJson(); setMenuOpen(false); }}><Copy size={16} />프로필 JSON 복사</button><button onClick={() => { setMenuOpen(false); void reload().catch((error) => setStatusText(error instanceof Error ? error.message : "불러오기 실패")); }}><RefreshCcw size={16} />서버에서 다시 불러오기</button><button className="mobile-menu-danger" onClick={() => { clearSession(); setMenuOpen(false); setSessionReady(false); }}><LogOut size={16} />로그아웃</button></div></div>}{deleteTarget && <ConfirmDeleteModal profile={deleteTarget} onCancel={() => setDeleteTarget(null)} onConfirm={confirmRemove} />}{view === "home" && <HomeView profiles={profiles} onNew={() => setView("new")} onOpen={openProfile} onMove={moveProfile} />}{view === "new" && <NewProfileChoice onCustom={createCustomProfile} onModpack={() => setView("modpack")} onBack={() => setView("home")} />}{view === "modpack" && <ModpackPicker onBack={() => setView("new")} onCreate={createModpackProfile} />}{view === "editor" && selected && <><section className="profile-section-v2 compact-profile-header"><div className="section-title-row"><h2><Box size={18} />{selected.name}</h2><span>{dirty ? "수정됨" : "동기화됨"}</span></div><div className="quick-actions-v2"><button onClick={duplicate}>복제</button><button className="danger-text" onClick={() => setDeleteTarget(selected)}>삭제</button></div></section><div className="workspace-v2 launcher-style-workspace editor-no-page-scroll"><ProfileSettings profile={selected} meta={meta} openPanels={openPanels} setOpenPanels={setOpenPanels} onChange={setProfile} onUpdateModpack={() => void updateModpack()} mobileActive={mobileSection === "settings"} /><section className={`content-column content-column-fixed mobile-pane ${mobileSection === "settings" ? "mobile-pane-hidden" : "mobile-pane-active"}`}><div className="notion-card tab-shell-shot">{tabs.map((tab) => <button key={tab.id} className={activeTab === tab.id ? "active" : ""} onClick={() => selectAssetTab(tab.id)}>{tab.label}<b>{selected[tab.id].length}</b></button>)}</div><ContentLibraryPanel profile={selected} kind={activeTab} onChange={setProfile} /></section></div><p className="status-box editor-status-box">{statusText}</p><MobileEditorNav profile={selected} active={mobileSection} onSelect={selectMobile} /></>}</main>;
}
