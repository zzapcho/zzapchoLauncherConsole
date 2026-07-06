import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { clearSession, getSession, loadLauncherMeta, loadProfiles, login, saveProfiles, uploadAsset, type LauncherMeta } from "./api";
import { createEmptyProfile, guessJavaVersion, MOD_LOADERS, type LauncherAsset, type LauncherProfile, type ModLoader, type ProfilesManifest } from "../../shared/profileTypes";
import { createProfileFromModrinthModpack, getModrinthAsset, searchCurseForgeProjects, searchModrinthProjects, type ExternalProject, type ProjectKind, type SourceKind } from "./externalSources";

type AssetKind = "mods" | "resourcePacks" | "shaders";
type View = "home" | "new" | "editor" | "modpack";
type Toast = { tone: "ok" | "warn" | "bad"; text: string } | null;
type CurseForgeProject = ExternalProject & { fileId?: string; fileName?: string; fileVersion?: string; downloadUrl?: string; sha1?: string; sha256?: string };

const AUTOSAVE_DELAY = 900;
const PAGE_SIZE = 12;
const assetTabs: Array<{ id: AssetKind; label: string; kind: ProjectKind; accept: string; fallbackQuery: string }> = [
  { id: "mods", label: "모드", kind: "mod", accept: ".jar", fallbackQuery: "performance" },
  { id: "resourcePacks", label: "리팩", kind: "resourcepack", accept: ".zip", fallbackQuery: "faithful" },
  { id: "shaders", label: "쉐이더", kind: "shader", accept: ".zip", fallbackQuery: "shader" },
];
const editableLabels: Array<[keyof LauncherProfile["editableFields"], string]> = [
  ["mods", "모드"],
  ["resourcePacks", "리소스팩"],
  ["shaders", "쉐이더"],
  ["minecraftVersion", "마크 버전"],
  ["modLoader", "로더"],
  ["javaArgs", "Java Args"],
];

function normalizeProfile(profile: LauncherProfile): LauncherProfile {
  return { ...profile, editableFields: { ...profile.editableFields, server: true, memory: true } };
}
function normalizeProfiles(profiles: ProfilesManifest): ProfilesManifest {
  return profiles.map(normalizeProfile);
}
function cloneProfile(profile: LauncherProfile): LauncherProfile {
  return JSON.parse(JSON.stringify(profile)) as LauncherProfile;
}
function ramGb(profile: LauncherProfile) {
  return Math.round((profile.launchOptions.maxMemoryMb / 1024) * 2) / 2;
}
function serverText(profile: LauncherProfile) {
  return profile.defaultServer.port === 25565 ? profile.defaultServer.address : `${profile.defaultServer.address}:${profile.defaultServer.port}`;
}
function parseServer(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return { address: "", port: 25565 };
  const index = trimmed.lastIndexOf(":");
  if (index <= 0) return { address: trimmed, port: 25565 };
  const address = trimmed.slice(0, index).trim();
  const port = Number(trimmed.slice(index + 1));
  return { address, port: Number.isFinite(port) && port > 0 && port < 65536 ? port : 25565 };
}
function newestLoader(meta: LauncherMeta | null, loader: ModLoader) {
  if (!meta || loader === "vanilla") return "";
  if (loader === "fabric") return meta.loaders.fabric[0] ?? "";
  if (loader === "forge") return meta.loaders.forge[0] ?? "";
  return meta.loaders.quilt[0] ?? "";
}
function loaderVersions(meta: LauncherMeta | null, loader: ModLoader, current: string) {
  if (loader === "vanilla") return [""];
  if (!meta) return [current].filter(Boolean);
  const list = loader === "fabric" ? meta.loaders.fabric : loader === "forge" ? meta.loaders.forge : meta.loaders.quilt;
  return list.includes(current) ? list : [current, ...list].filter(Boolean);
}
function mcVersions(meta: LauncherMeta | null, current: string) {
  const list = meta?.minecraft.releases ?? [];
  return list.includes(current) ? list : [current, ...list].filter(Boolean);
}
function countAssets(profile: LauncherProfile) {
  return profile.mods.length + profile.resourcePacks.length + profile.shaders.length;
}
function parseJavaVersion(value: string) {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed >= 8 ? parsed : 8;
}
function curseForgePage(slugOrId: string) {
  return `https://www.curseforge.com/minecraft/search?search=${encodeURIComponent(slugOrId)}`;
}
function curseForgeAsset(project: CurseForgeProject, kind: AssetKind): LauncherAsset {
  const defaultExt = kind === "mods" ? ".jar" : ".zip";
  const fileName = project.fileName ?? `${project.slug || project.projectId}${defaultExt}`;
  return {
    id: `curseforge-${project.projectId}`,
    name: project.title,
    version: project.fileVersion ?? fileName,
    required: true,
    url: project.downloadUrl ?? `curseforge://${project.projectId}/${project.fileId ?? "latest"}`,
    sha1: project.sha1,
    sha256: project.sha256,
    source: "curseforge",
    projectId: project.projectId,
    fileId: project.fileId,
    fileName,
    iconUrl: project.iconUrl,
    projectUrl: curseForgePage(project.slug ?? project.projectId),
  };
}
function isModpackAsset(asset: LauncherAsset) {
  return Boolean(asset.fromModpack);
}
function mergeModpackAssets(current: LauncherAsset[], updated: LauncherAsset[]) {
  const manual = current.filter((asset) => !isModpackAsset(asset));
  return [...updated.map((asset) => ({ ...asset, fromModpack: true })), ...manual];
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="fc-field"><span>{label}</span>{children}</label>;
}
function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: () => void }) {
  return <button type="button" className={`fc-toggle ${checked ? "on" : ""} ${label ? "" : "icon-only"}`} onClick={onChange}><span>{label}</span><b /></button>;
}
function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return <section className="fc-section"><div className="fc-section-head"><h3>{title}</h3>{hint && <small>{hint}</small>}</div>{children}</section>;
}

function Login({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(username, password);
      onDone();
    } catch (error) {
      setError(error instanceof Error ? error.message : "로그인 실패");
    } finally {
      setBusy(false);
    }
  }
  return <main id="fresh-console" className="fc-login"><form className="fc-login-card" onSubmit={submit}><p>zzapcho Launcher</p><h1>Console</h1><Field label="아이디"><input value={username} onChange={(event) => setUsername(event.target.value)} /></Field><Field label="비밀번호"><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></Field><button className="fc-primary" disabled={busy}>{busy ? "확인 중..." : "로그인"}</button>{error && <div className="fc-error">{error}</div>}</form></main>;
}

function Header({ status, onHome, onMenu }: { status: string; onHome: () => void; onMenu: () => void }) {
  return <header className="fc-header"><button type="button" className="fc-logo" onClick={onHome}>Console</button><div className="fc-header-right"><span className="fc-save-state">{status}</span><button className="fc-icon-btn" onClick={onMenu}>메뉴</button></div></header>;
}

function Home({ profiles, reorder, onToggleReorder, onOpen, onNew, onMove }: { profiles: ProfilesManifest; reorder: boolean; onToggleReorder: () => void; onOpen: (id: string) => void; onNew: () => void; onMove: (index: number, offset: -1 | 1) => void }) {
  return <main className="fc-page"><div className="fc-title-row"><div><p>Profiles</p><h2>프로필</h2></div><div className="fc-title-actions"><span>{profiles.length}개</span><button className="fc-soft" onClick={onToggleReorder}>{reorder ? "완료" : "위치 변경"}</button></div></div><div className="fc-profile-grid">{profiles.map((profile, index) => <article key={profile.id} className="fc-profile-card" style={{ "--accent": profile.accentColor } as React.CSSProperties}><button disabled={reorder} onClick={() => onOpen(profile.id)}><i /><strong>{profile.name}</strong><p>{profile.customText || profile.description || "프로필 설명 없음"}</p><span>MC {profile.minecraftVersion}</span><span>{profile.modLoader}</span><span>{countAssets(profile)} files</span></button>{reorder && <div className="fc-reorder"><button disabled={index === 0} onClick={() => onMove(index, -1)}>위</button><button disabled={index === profiles.length - 1} onClick={() => onMove(index, 1)}>아래</button></div>}</article>)}{!reorder && <button className="fc-add-card" onClick={onNew}>+ 새 프로필</button>}</div></main>;
}

function ProfileSettings({ profile, meta, onChange, onDuplicate, onDelete, onUpdateModpack }: { profile: LauncherProfile; meta: LauncherMeta | null; onChange: (profile: LauncherProfile) => void; onUpdateModpack: () => void; onDuplicate: () => void; onDelete: () => void }) {
  function update(patch: Partial<LauncherProfile>) {
    onChange(normalizeProfile({ ...profile, ...patch }));
  }
  function setMemory(gb: number) {
    const mb = Math.round(gb * 1024);
    update({ launchOptions: { ...profile.launchOptions, minMemoryMb: mb, maxMemoryMb: mb } });
  }
  function setMcVersion(version: string) {
    update({ minecraftVersion: version, javaVersion: guessJavaVersion(version) });
  }
  function setLoader(loader: ModLoader) {
    update({ modLoader: loader, modLoaderVersion: newestLoader(meta, loader) });
  }
  const server = serverText(profile);
  return <aside className="fc-side" style={{ "--accent": profile.accentColor } as React.CSSProperties}><Section title="프로필 설정" hint="기본 실행 정보"><Field label="프로필 이름"><input value={profile.name} onChange={(event) => update({ name: event.target.value })} /></Field><Field label="문구"><input value={profile.customText} onChange={(event) => update({ customText: event.target.value })} /></Field><div className="fc-two"><Field label="마크 버전"><select value={profile.minecraftVersion} onChange={(event) => setMcVersion(event.target.value)}>{mcVersions(meta, profile.minecraftVersion).map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Java 런타임"><input type="number" min={8} max={99} step={1} value={profile.javaVersion} onChange={(event) => update({ javaVersion: parseJavaVersion(event.target.value) })} /></Field></div><div className="fc-two"><Field label="로더"><select value={profile.modLoader} onChange={(event) => setLoader(event.target.value as ModLoader)}>{MOD_LOADERS.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="로더 버전"><select value={profile.modLoaderVersion} onChange={(event) => update({ modLoaderVersion: event.target.value })}>{loaderVersions(meta, profile.modLoader, profile.modLoaderVersion).map((item) => <option key={item} value={item}>{item || "Vanilla"}</option>)}</select></Field></div><Field label="대표 서버"><input value={server} onChange={(event) => { const parsed = parseServer(event.target.value); update({ defaultServer: { ...profile.defaultServer, ...parsed } }); }} /></Field><Field label={`메모리 ${ramGb(profile)}GB`}><div className="fc-range"><input type="range" min={1} max={16} step={0.5} value={ramGb(profile)} onChange={(event) => setMemory(Number(event.target.value))} /><input type="number" min={1} max={64} step={0.5} value={ramGb(profile)} onChange={(event) => setMemory(Number(event.target.value))} /></div></Field><Field label="강조색"><div className="fc-color"><span>{profile.accentColor}</span><input type="color" value={profile.accentColor} onChange={(event) => update({ accentColor: event.target.value })} /></div></Field>{profile.modpack && <button className="fc-soft full" onClick={onUpdateModpack}>모드팩 업데이트</button>}</Section><Section title="런처 수정 허용" hint="대표 서버/메모리는 항상 수정 가능"><div className="fc-toggle-grid">{editableLabels.map(([key, label]) => <Toggle key={key} label={label} checked={Boolean(profile.editableFields[key])} onChange={() => update({ editableFields: { ...profile.editableFields, server: true, memory: true, [key]: !profile.editableFields[key] } })} />)}</div></Section><Section title="관리"><div className="fc-manage"><button className="fc-soft" onClick={onDuplicate}>복제</button><button className="fc-danger" onClick={onDelete}>삭제</button></div></Section></aside>;
}

function AssetPanel({ profile, kind, onChange }: { profile: LauncherProfile; kind: AssetKind; onChange: (profile: LauncherProfile) => void }) {
  const config = assetTabs.find((item) => item.id === kind) ?? assetTabs[0];
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [source, setSource] = useState<SourceKind>("modrinth");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ExternalProject[]>([]);
  const [message, setMessage] = useState("인기순");
  const [busy, setBusy] = useState(false);
  const items = profile[kind];
  function updateItems(next: LauncherAsset[]) {
    onChange(normalizeProfile({ ...profile, [kind]: next } as LauncherProfile));
  }
  async function search(term = query) {
    setBusy(true);
    setMessage(term.trim() ? "검색 중..." : "인기순 불러오는 중...");
    try {
      const searchTerm = source === "curseforge" && !term.trim() ? config.fallbackQuery : term;
      const next = source === "modrinth" ? await searchModrinthProjects(config.kind, searchTerm, 0, PAGE_SIZE) : await searchCurseForgeProjects(config.kind, searchTerm);
      setResults(next);
      setMessage(next.length ? `${next.length}개 표시` : "결과 없음");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "검색 실패");
      setResults([]);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { void search(""); }, [kind, source, profile.minecraftVersion, profile.modLoader]);
  async function addProject(project: ExternalProject) {
    setBusy(true);
    setMessage("파일 확인 중...");
    try {
      const asset = project.source === "modrinth" ? await getModrinthAsset(project, profile) : curseForgeAsset(project as CurseForgeProject, kind);
      const exists = items.some((item) => item.id === asset.id || (asset.projectId && item.projectId === asset.projectId));
      if (exists) {
        setMessage("이미 설치됨");
        return;
      }
      updateItems([...items, asset]);
      setMessage(asset.url.startsWith("curseforge://") ? "추가됨 · 다운로드 URL 없음" : "추가됨");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "추가 실패");
    } finally {
      setBusy(false);
    }
  }
  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setMessage("업로드 중...");
    try {
      const uploaded: LauncherAsset[] = [];
      for (const file of Array.from(files)) uploaded.push(await uploadAsset(profile.id, kind, file));
      updateItems([...items, ...uploaded]);
      setMessage(`${uploaded.length}개 업로드됨`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "업로드 실패");
    } finally {
      setBusy(false);
    }
  }
  return <section className="fc-assets"><div className="fc-assets-head"><h3>{config.label}</h3><span>{message}</span></div><div className="fc-installed">{items.length ? items.map((asset, index) => <article key={`${asset.id}-${index}`} className="fc-asset-row"><div>{asset.iconUrl ? <img src={asset.iconUrl} alt="" /> : <b />}</div><main><strong>{asset.name}</strong><small>{asset.version || asset.fileName || asset.source || "버전 없음"}</small></main><Toggle label="" checked={asset.required} onChange={() => updateItems(items.map((item, i) => i === index ? { ...item, required: !item.required } : item))} /><button className="fc-icon-btn small" onClick={() => updateItems(items.filter((_, i) => i !== index))}>×</button></article>) : <div className="fc-empty">아직 추가된 파일 없음</div>}</div><div className="fc-library-bar"><input ref={inputRef} type="file" hidden multiple accept={config.accept} onChange={(event) => { void addFiles(event.currentTarget.files); event.currentTarget.value = ""; }} /><button className="fc-soft" onClick={() => inputRef.current?.click()}>업로드</button><form onSubmit={(event) => { event.preventDefault(); void search(); }}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`${source === "modrinth" ? "Modrinth" : "CurseForge"} 검색`} /><button disabled={busy}>{busy ? "..." : "검색"}</button></form></div><div className="fc-source-tabs"><button className={source === "modrinth" ? "active" : ""} onClick={() => setSource("modrinth")}>Modrinth</button><button className={source === "curseforge" ? "active" : ""} onClick={() => setSource("curseforge")}>CurseForge</button></div><div className="fc-results">{results.map((project) => { const installed = items.some((asset) => asset.id === project.slug || asset.projectId === project.projectId || asset.id === `curseforge-${project.projectId}`); const cf = project as CurseForgeProject; return <article key={`${project.source}-${project.projectId}`} className="fc-result-row"><div>{project.iconUrl ? <img src={project.iconUrl} alt="" /> : <b />}</div><main><strong>{project.title}</strong><small>{project.author ?? project.source} · {cf.fileName ?? (project.follows ? `${project.follows.toLocaleString("ko-KR")} 인기` : "호환 파일 확인")}</small></main><button disabled={busy || installed} onClick={() => void addProject(project)}>{installed ? "설치됨" : "설치"}</button></article>; })}</div></section>;
}

function ModpackPicker({ onBack, onCreate }: { onBack: () => void; onCreate: (profile: LauncherProfile) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ExternalProject[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("인기 모드팩");
  async function search(term = query) {
    setBusy(true);
    try {
      const next = await searchModrinthProjects("modpack", term, 0, PAGE_SIZE);
      setResults(next);
      setMessage(next.length ? `${next.length}개 표시` : "결과 없음");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "검색 실패");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { void search(""); }, []);
  async function select(project: ExternalProject) {
    setBusy(true);
    setMessage("모드팩 분석 중...");
    try {
      onCreate(normalizeProfile(await createProfileFromModrinthModpack(project)));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "모드팩 생성 실패");
    } finally {
      setBusy(false);
    }
  }
  return <main className="fc-page"><div className="fc-title-row"><div><p>Modpack</p><h2>모드팩 선택</h2></div><button className="fc-soft" onClick={onBack}>뒤로</button></div><form className="fc-wide-search" onSubmit={(event) => { event.preventDefault(); void search(); }}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Modrinth 모드팩 검색" /><button disabled={busy}>{busy ? "..." : "검색"}</button></form><p className="fc-note">{message}</p><div className="fc-results modpack">{results.map((project) => <article key={project.projectId} className="fc-result-row"><div>{project.iconUrl ? <img src={project.iconUrl} alt="" /> : <b />}</div><main><strong>{project.title}</strong><small>{project.author ?? "Modrinth"}</small></main><button disabled={busy} onClick={() => void select(project)}>선택</button></article>)}</div></main>;
}

export function ConsoleAppFresh() {
  const [ready, setReady] = useState(Boolean(getSession()));
  const [profiles, setProfiles] = useState<ProfilesManifest>([]);
  const [selectedId, setSelectedId] = useState("");
  const [view, setView] = useState<View>("home");
  const [tab, setTab] = useState<AssetKind>("mods");
  const [meta, setMeta] = useState<LauncherMeta | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [menu, setMenu] = useState(false);
  const [reorder, setReorder] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LauncherProfile | null>(null);
  const timer = useRef<number | null>(null);
  const changeId = useRef(0);
  const selected = useMemo(() => profiles.find((profile) => profile.id === selectedId) ?? profiles[0], [profiles, selectedId]);
  const saveState = saving ? "자동 저장 중" : dirty ? "변경됨" : "저장됨";

  function markChanged() {
    changeId.current += 1;
    setDirty(true);
  }

  useEffect(() => { void loadLauncherMeta().then(setMeta).catch(() => undefined); }, []);
  useEffect(() => { if (selected?.minecraftVersion) void loadLauncherMeta(selected.minecraftVersion).then(setMeta).catch(() => undefined); }, [selected?.minecraftVersion]);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  async function reload() {
    setToast({ tone: "warn", text: "불러오는 중..." });
    const result = await loadProfiles();
    const next = normalizeProfiles(result.profiles);
    setProfiles(next);
    setSelectedId(next[0]?.id ?? "");
    setView("home");
    setDirty(false);
    setToast({ tone: "ok", text: result.source === "empty" ? "새 콘솔 준비됨" : "불러옴" });
  }
  useEffect(() => { if (ready) reload().catch((error) => setToast({ tone: "bad", text: error instanceof Error ? error.message : "불러오기 실패" })); }, [ready]);
  useEffect(() => {
    if (!ready || !dirty || saving) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void saveNow(), AUTOSAVE_DELAY);
  }, [profiles, dirty, ready, saving]);

  async function saveNow() {
    const saveId = changeId.current;
    const snapshot = normalizeProfiles(profiles);
    setSaving(true);
    try {
      await saveProfiles(snapshot);
      if (changeId.current === saveId) setDirty(false);
      setToast({ tone: "ok", text: "저장됨" });
    } catch (error) {
      setDirty(true);
      setToast({ tone: "bad", text: error instanceof Error ? error.message : "저장 실패" });
    } finally {
      setSaving(false);
    }
  }
  function setProfile(profile: LauncherProfile) {
    const next = normalizeProfile(profile);
    setProfiles((items) => items.map((item) => item.id === next.id ? next : item));
    setSelectedId(next.id);
    markChanged();
  }
  function makeCustom() {
    const profile = normalizeProfile(createEmptyProfile());
    if (meta?.minecraft.latestRelease) {
      profile.minecraftVersion = meta.minecraft.latestRelease;
      profile.javaVersion = guessJavaVersion(profile.minecraftVersion);
      profile.modLoaderVersion = newestLoader(meta, profile.modLoader) || profile.modLoaderVersion;
    }
    setProfiles((items) => [...items, profile]);
    setSelectedId(profile.id);
    setView("editor");
    markChanged();
  }
  function makeModpack(profile: LauncherProfile) {
    const next = normalizeProfile(profile);
    setProfiles((items) => [...items, next]);
    setSelectedId(next.id);
    setView("editor");
    markChanged();
  }
  function duplicate() {
    if (!selected) return;
    const copy = cloneProfile(selected);
    copy.id = `${selected.id}-copy-${Date.now().toString().slice(-4)}`;
    copy.name = `${selected.name} Copy`;
    setProfiles((items) => [...items, copy]);
    setSelectedId(copy.id);
    markChanged();
  }
  function removeSelected() {
    if (!deleteTarget) return;
    setProfiles((items) => items.filter((item) => item.id !== deleteTarget.id));
    setDeleteTarget(null);
    setSelectedId("");
    setView("home");
    markChanged();
  }
  function moveProfile(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= profiles.length) return;
    const next = [...profiles];
    [next[index], next[target]] = [next[target], next[index]];
    setProfiles(next);
    markChanged();
  }
  async function updateSelectedModpack() {
    if (!selected?.modpack) return;
    if (selected.modpack.source !== "modrinth") {
      setToast({ tone: "warn", text: "CurseForge 모드팩 업데이트는 아직 준비 중" });
      return;
    }
    setToast({ tone: "warn", text: "모드팩 업데이트 중..." });
    try {
      const updated = normalizeProfile(await createProfileFromModrinthModpack({
        source: "modrinth",
        projectId: selected.modpack.projectId,
        slug: selected.modpack.slug,
        title: selected.modpack.title,
        description: selected.description,
        projectType: "modpack",
      }));
      setProfile({
        ...selected,
        minecraftVersion: updated.minecraftVersion,
        javaVersion: updated.javaVersion,
        modLoader: updated.modLoader,
        modLoaderVersion: updated.modLoaderVersion,
        modpack: updated.modpack ?? selected.modpack,
        mods: mergeModpackAssets(selected.mods, updated.mods),
        resourcePacks: mergeModpackAssets(selected.resourcePacks, updated.resourcePacks),
        shaders: mergeModpackAssets(selected.shaders, updated.shaders),
      });
      setToast({ tone: "ok", text: "모드팩 업데이트됨" });
    } catch (error) {
      setToast({ tone: "bad", text: error instanceof Error ? error.message : "모드팩 업데이트 실패" });
    }
  }

  if (!ready) return <Login onDone={() => setReady(true)} />;
  return <div id="fresh-console" className="fc-shell"><Header status={saveState} onHome={() => { setView("home"); setMenu(false); }} onMenu={() => setMenu(true)} />{menu && <div className="fc-backdrop" onClick={() => setMenu(false)}><div className="fc-menu" onClick={(event) => event.stopPropagation()}><div><strong>메뉴</strong><button onClick={() => setMenu(false)}>×</button></div><button onClick={() => { setView("home"); setReorder((value) => !value); setMenu(false); }}>위치 변경 {reorder ? "끄기" : "켜기"}</button><button onClick={() => { void navigator.clipboard.writeText(JSON.stringify(normalizeProfiles(profiles), null, 2)); setToast({ tone: "ok", text: "JSON 복사됨" }); setMenu(false); }}>JSON 복사</button><button onClick={() => { setMenu(false); void reload(); }}>다시 불러오기</button><button className="danger" onClick={() => { clearSession(); setReady(false); }}>로그아웃</button></div></div>}{deleteTarget && <div className="fc-backdrop" onClick={() => setDeleteTarget(null)}><div className="fc-confirm" onClick={(event) => event.stopPropagation()}><h3>삭제할까?</h3><p>{deleteTarget.name} 프로필을 삭제합니다. 자동 저장 후 업로드 폴더도 정리됩니다.</p><div><button className="fc-soft" onClick={() => setDeleteTarget(null)}>취소</button><button className="fc-danger" onClick={removeSelected}>삭제</button></div></div></div>}{view === "home" && <Home profiles={profiles} reorder={reorder} onToggleReorder={() => setReorder((value) => !value)} onOpen={(id) => { setSelectedId(id); setView("editor"); }} onNew={() => setView("new")} onMove={moveProfile} />}{view === "new" && <main className="fc-page"><div className="fc-title-row"><div><p>Create</p><h2>새 프로필</h2></div><button className="fc-soft" onClick={() => setView("home")}>뒤로</button></div><div className="fc-choice"><button onClick={makeCustom}><strong>커스텀</strong><span>직접 버전/로더/파일을 구성</span></button><button onClick={() => setView("modpack")}><strong>모드팩</strong><span>Modrinth 모드팩에서 자동 생성</span></button></div></main>}{view === "modpack" && <ModpackPicker onBack={() => setView("new")} onCreate={makeModpack} />}{view === "editor" && selected && <main className="fc-editor" style={{ "--accent": selected.accentColor } as React.CSSProperties}><div className="fc-editor-title"><div><p>Profile</p><h2>{selected.name}</h2></div><span>{saveState}</span></div><div className="fc-editor-grid"><ProfileSettings profile={selected} meta={meta} onChange={setProfile} onDuplicate={duplicate} onDelete={() => setDeleteTarget(selected)} onUpdateModpack={() => void updateSelectedModpack()} /><section className="fc-main-panel"><nav className="fc-tabs">{assetTabs.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>{item.label}<b>{selected[item.id].length}</b></button>)}</nav><AssetPanel profile={selected} kind={tab} onChange={setProfile} /></section></div></main>}{toast && <div className={`fc-toast ${toast.tone}`} onClick={() => setToast(null)}>{toast.text}</div>}</div>;
}
