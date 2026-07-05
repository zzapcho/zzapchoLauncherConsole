import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Box,
  CheckCircle2,
  Copy,
  FolderPlus,
  Github,
  Lock,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { clearSession, getSession, loadProfiles, login, saveProfiles, uploadAsset } from "./api";
import {
  createEmptyProfile,
  MOD_LOADERS,
  type LauncherAsset,
  type LauncherProfile,
  type ProfilesManifest,
} from "../../shared/profileTypes";
import { validateProfilesManifest } from "../../shared/profileValidation";
import {
  createProfileFromModrinthModpack,
  getModrinthAsset,
  searchCurseForgeProjects,
  searchModrinthProjects,
  type ExternalProject,
  type ProjectKind,
  type SourceKind,
} from "./externalSources";

type AssetKind = "mods" | "resourcePacks" | "shaders";
type View = "home" | "editor" | "new" | "modpack";
type SaveStatus = { type: "success" | "error"; message: string; sha?: string | null } | null;

const PAGE_SIZE = 12;

const contentSections: Record<AssetKind, { title: string; projectKind: ProjectKind; accept: string; emptyHint: string }> = {
  mods: { title: "모드", projectKind: "mod", accept: ".jar", emptyHint: ".jar 파일을 추가하세요." },
  resourcePacks: { title: "리소스팩", projectKind: "resourcepack", accept: ".zip", emptyHint: ".zip 리소스팩을 추가하세요." },
  shaders: { title: "쉐이더", projectKind: "shader", accept: ".zip", emptyHint: ".zip 쉐이더팩을 추가하세요." },
};

const tabs: Array<{ id: AssetKind; label: string }> = [
  { id: "mods", label: "모드" },
  { id: "resourcePacks", label: "리소스팩" },
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

function safeId(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || `profile-${Date.now()}`;
}

function shortSha(value?: string | null) {
  return value ? value.slice(0, 7) : "local";
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="ui-field"><span>{label}</span>{children}</label>;
}

function Toggle({ label, checked, onChange, lock }: { label: string; checked: boolean; onChange: () => void; lock?: boolean }) {
  return <button type="button" className="toggle-switch" onClick={onChange} aria-pressed={checked}>
    <span className="toggle-label">{lock && <Lock size={13} />}{label}</span>
    <span className={`switch-track${checked ? " checked" : ""}`}><span /></span>
  </button>;
}

function ConfirmDeleteModal({ profile, onCancel, onConfirm }: { profile: LauncherProfile; onCancel: () => void; onConfirm: () => void }) {
  const fileCount = profile.mods.length + profile.resourcePacks.length + profile.shaders.length;
  return <div className="modal-backdrop-v2" onClick={onCancel}>
    <section className="confirm-modal-v2" onClick={(event) => event.stopPropagation()}>
      <div className="danger-orb"><Trash2 size={22} /></div>
      <p className="eyebrow">Delete Profile</p>
      <h2>정말로 삭제할까요?</h2>
      <p className="muted"><b>{profile.name}</b> 프로필을 삭제합니다. 저장하면 이 프로필의 서버 업로드 파일 폴더도 함께 삭제됩니다.</p>
      <div className="delete-summary-v2"><span>프로필 ID</span><code>{profile.id}</code><span>등록 파일</span><code>{fileCount}개</code></div>
      <div className="modal-actions-v2"><button className="ghost-button" onClick={onCancel}>취소</button><button className="danger-button-v2" onClick={onConfirm}><Trash2 size={16} />삭제</button></div>
    </section>
  </div>;
}

function LoginScreen({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("admin");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(username, secret);
      onDone();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "로그인 실패");
    } finally {
      setBusy(false);
    }
  };

  return <main className="login-page notion-bg">
    <form className="login-card-v2" onSubmit={submit}>
      <p className="eyebrow">Admin</p>
      <h1>Console</h1>
      <p className="muted">관리자 계정으로 로그인해서 프로필과 콘텐츠를 관리합니다.</p>
      <Field label="아이디"><input value={username} onChange={(event) => setUsername(event.target.value)} /></Field>
      <Field label="비밀번호"><input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} /></Field>
      <button className="primary-button full" disabled={busy}>{busy ? "확인 중..." : "로그인"}</button>
      {error && <p className="inline-error"><AlertCircle size={15} />{error}</p>}
    </form>
  </main>;
}

function TopBar({ view, dirty, saveStatus, isSaving, canSave, onHome, onSave, onMenu }: { view: View; dirty: boolean; saveStatus: SaveStatus; isSaving: boolean; canSave: boolean; onHome: () => void; onSave: () => void; onMenu: () => void }) {
  return <header className="topbar-v2 clean-topbar">
    <div className="brand-line clean-brand"><button className="ghost-button" onClick={onHome}>홈</button><div className="brand-text"><h1>Console <span>{view === "home" ? "HOME" : dirty ? "EDIT" : "SYNC"}</span></h1></div></div>
    <div className="top-actions-v2">
      {saveStatus && <div className={`save-toast ${saveStatus.type}`}>{saveStatus.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}<span>{saveStatus.message}</span>{saveStatus.sha && <code>{shortSha(saveStatus.sha)}</code>}</div>}
      <button className="primary-button" onClick={onSave} disabled={isSaving || !canSave}>{isSaving ? "저장 중" : <><Github size={17} />저장</>}</button>
      <button className="mobile-menu-button" onClick={onMenu}><Menu /></button>
    </div>
  </header>;
}

function ProfileCard({ profile, active, onClick }: { profile: LauncherProfile; active?: boolean; onClick: () => void }) {
  const count = profile.mods.length + profile.resourcePacks.length + profile.shaders.length;
  return <button type="button" className={`profile-card-v2${active ? " active" : ""}`} style={{ "--accent": profile.accentColor } as React.CSSProperties} onClick={onClick}>
    <span className="profile-dot" />
    <strong>{profile.name}</strong>
    <p>{profile.description || profile.customText}</p>
    <span className="profile-meta"><b>MC {profile.minecraftVersion}</b><b>{profile.modLoader}</b><b>{count} files</b></span>
  </button>;
}

function HomeView({ profiles, onOpen, onNew }: { profiles: ProfilesManifest; onOpen: (id: string) => void; onNew: () => void }) {
  return <section className="home-only-panel">
    <div className="home-title"><p className="eyebrow">Profiles</p><h2>프로필</h2><span>{profiles.length}개</span></div>
    <div className="home-profile-grid">
      {profiles.map((profile) => <ProfileCard key={profile.id} profile={profile} onClick={() => onOpen(profile.id)} />)}
      <button className="add-profile-card home-add-card" onClick={onNew}><Plus /><span>새 프로필</span></button>
    </div>
  </section>;
}

function NewProfileChoice({ onCustom, onModpack, onBack }: { onCustom: () => void; onModpack: () => void; onBack: () => void }) {
  return <section className="new-choice-panel">
    <div className="home-title"><p className="eyebrow">Create</p><h2>새 프로필</h2><span>시작 방식 선택</span></div>
    <div className="new-choice-grid">
      <button onClick={onCustom}><strong>커스텀</strong><p>버전, 로더, 모드/리소스팩/쉐이더를 직접 설정합니다.</p></button>
      <button onClick={onModpack}><strong>모드팩</strong><p>Modrinth 모드팩을 가져와 .mrpack 내부 파일을 분해해서 프로필에 넣습니다.</p></button>
    </div>
    <button className="ghost-button" onClick={onBack}>홈으로</button>
  </section>;
}

function ProfileSettings({ profile, onChange }: { profile: LauncherProfile; onChange: (profile: LauncherProfile) => void }) {
  const update = (patch: Partial<LauncherProfile>) => onChange({ ...profile, ...patch });
  const updateServer = (patch: Partial<LauncherProfile["defaultServer"]>) => update({ defaultServer: { ...profile.defaultServer, ...patch } });
  const updateLaunch = (patch: Partial<LauncherProfile["launchOptions"]>) => update({ launchOptions: { ...profile.launchOptions, ...patch } });

  return <section className="settings-column" id="profile-settings-section">
    <div className="notion-card profile-preview-card" style={{ "--accent": profile.accentColor } as React.CSSProperties}>
      <div className="preview-glow" />
      <p className="eyebrow">Profile Preview</p>
      <h2>{profile.customText}</h2>
      <p>{profile.name} · MC {profile.minecraftVersion} · Java {profile.javaVersion}</p>
    </div>

    <div className="notion-card">
      <div className="card-head-v2"><h3><Settings2 size={18} />프로필 설정</h3><small>런처 화면과 실행 기준</small></div>
      <div className="form-stack">
        <Field label="ID"><input value={profile.id} onChange={(event) => update({ id: safeId(event.target.value) })} /></Field>
        <Field label="이름"><input value={profile.name} onChange={(event) => update({ name: event.target.value })} /></Field>
        <Field label="설명"><textarea value={profile.description} onChange={(event) => update({ description: event.target.value })} /></Field>
        <Field label="커스텀 문구"><input value={profile.customText} onChange={(event) => update({ customText: event.target.value })} /></Field>
        <div className="split-grid"><Field label="마크 버전"><input value={profile.minecraftVersion} onChange={(event) => update({ minecraftVersion: event.target.value })} /></Field><Field label="Java"><input type="number" value={profile.javaVersion} onChange={(event) => update({ javaVersion: Number(event.target.value) })} /></Field></div>
        <div className="split-grid"><Field label="로더"><select value={profile.modLoader} onChange={(event) => update({ modLoader: event.target.value as LauncherProfile["modLoader"] })}>{MOD_LOADERS.map((loader) => <option key={loader}>{loader}</option>)}</select></Field><Field label="로더 버전"><input value={profile.modLoaderVersion} onChange={(event) => update({ modLoaderVersion: event.target.value })} /></Field></div>
        <div className="split-grid server-grid"><Field label="서버 이름"><input value={profile.defaultServer.name} onChange={(event) => updateServer({ name: event.target.value })} /></Field><Field label="주소"><input value={profile.defaultServer.address} onChange={(event) => updateServer({ address: event.target.value })} /></Field><Field label="포트"><input type="number" value={profile.defaultServer.port} onChange={(event) => updateServer({ port: Number(event.target.value) })} /></Field></div>
        <div className="split-grid"><Field label="최소 MB"><input type="number" value={profile.launchOptions.minMemoryMb} onChange={(event) => updateLaunch({ minMemoryMb: Number(event.target.value) })} /></Field><Field label="최대 MB"><input type="number" value={profile.launchOptions.maxMemoryMb} onChange={(event) => updateLaunch({ maxMemoryMb: Number(event.target.value) })} /></Field></div>
        <Field label="강조색"><div className="color-input"><span>{profile.accentColor}</span><input type="color" value={profile.accentColor} onChange={(event) => update({ accentColor: event.target.value })} /></div></Field>
      </div>
    </div>

    <div className="notion-card">
      <div className="card-head-v2"><h3><Lock size={18} />런처 수정 허용</h3><small>true = 유저 수정 가능</small></div>
      <div className="toggle-grid">{(Object.entries(profile.editableFields) as Array<[keyof LauncherProfile["editableFields"], boolean]>).map(([key, value]) => <Toggle key={key} label={editableLabels[key]} checked={value} lock onChange={() => update({ editableFields: { ...profile.editableFields, [key]: !value } })} />)}</div>
    </div>
  </section>;
}

function ContentLibraryPanel({ profile, kind, onChange }: { profile: LauncherProfile; kind: AssetKind; onChange: (profile: LauncherProfile) => void }) {
  const section = contentSections[kind];
  const inputRef = useRef<HTMLInputElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState<SourceKind>("modrinth");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ExternalProject[]>([]);
  const [message, setMessage] = useState("인기순");
  const [busy, setBusy] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [dragging, setDragging] = useState(false);
  const items = profile[kind];
  const updateItems = (next: LauncherAsset[]) => onChange({ ...profile, [kind]: next } as LauncherProfile);

  const loadProjects = async (term = query, reset = true) => {
    if (busy) return;
    setBusy(true);
    const offset = reset ? 0 : results.length;
    setMessage(term.trim() ? "검색 중..." : "인기순 불러오는 중...");
    try {
      const next = source === "modrinth"
        ? await searchModrinthProjects(section.projectKind, term, offset, PAGE_SIZE)
        : await searchCurseForgeProjects(section.projectKind, term || section.title);
      setResults((current) => reset ? next : [...current, ...next.filter((item) => !current.some((old) => old.projectId === item.projectId))]);
      setHasMore(source === "modrinth" && next.length >= PAGE_SIZE);
      setMessage(term.trim() ? `${reset ? next.length : offset + next.length}개 표시` : "인기순");
    } catch (error) {
      if (reset) setResults([]);
      setHasMore(false);
      setMessage(error instanceof Error ? error.message : "검색 실패");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    setQuery("");
    setHasMore(true);
    void loadProjects("", true);
  }, [profile.id, kind, source]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMore && !busy && source === "modrinth") void loadProjects(query, false);
    }, { rootMargin: "160px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, busy, query, results.length, source]);

  const addFiles = async (files: FileList | File[]) => {
    const nextFiles = Array.from(files).filter((file) => file.name.toLowerCase().endsWith(section.accept));
    if (!nextFiles.length) {
      setMessage(`${section.accept} 파일만 추가할 수 있습니다.`);
      return;
    }
    setBusy(true);
    setMessage("서버에 업로드 중...");
    try {
      const uploaded: LauncherAsset[] = [];
      for (const file of nextFiles) uploaded.push(await uploadAsset(profile.id, kind, file));
      updateItems([...items, ...uploaded]);
      setMessage(`${uploaded.length}개 파일 업로드 완료`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "업로드 실패");
    } finally {
      setBusy(false);
    }
  };

  const addProject = async (project: ExternalProject) => {
    setBusy(true);
    setMessage("파일 정보 확인 중...");
    try {
      const asset = project.source === "modrinth"
        ? await getModrinthAsset(project, profile)
        : { id: `curseforge-${project.projectId}`, name: project.title, version: profile.minecraftVersion, required: true, url: `curseforge://${project.projectId}`, source: "curseforge" as const, projectId: project.projectId } satisfies LauncherAsset;
      updateItems([...items, asset]);
      setMessage(`${project.title} 추가됨`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "추가 실패");
    } finally {
      setBusy(false);
    }
  };

  return <section className="launcher-content-surface">
    <h2 className="content-title-shot">{section.title}</h2>
    <div className="installed-stack-shot">{items.map((item, index) => <article className="installed-card-shot" key={`${item.id}-${index}`}><span className="green-dot" /><div className="installed-info"><strong>{item.name}</strong><small>{item.version || "버전 없음"} · {item.required ? "필수" : "선택"}</small></div><Toggle label="" checked={item.required} onChange={() => updateItems(items.map((asset, i) => i === index ? { ...asset, required: !asset.required } : asset))} /><button className="tiny-icon" type="button" onClick={() => updateItems(items.filter((_, i) => i !== index))}><X size={15} /></button></article>)}{!items.length && <div className="empty-installed-shot"><span className="green-dot" />아직 적용된 {section.title} 없음</div>}</div>
    <div className={`drop-zone-shot${dragging ? " dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void addFiles(event.dataTransfer.files); }}>파일을 여기에 끌어다 놓으세요</div>
    <div className="library-actions-shot"><input ref={inputRef} type="file" multiple accept={section.accept} hidden onChange={(event) => { if (event.target.files) void addFiles(event.target.files); event.currentTarget.value = ""; }} /><button type="button" className="folder-button-shot" onClick={() => inputRef.current?.click()}><FolderPlus size={16} />폴더에서 추가</button><form className="library-search-shot" onSubmit={(event) => { event.preventDefault(); void loadProjects(query, true); }}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`${source === "modrinth" ? "Modrinth" : "CurseForge"} 검색`} /><button disabled={busy}>{busy ? "..." : "검색"}</button></form></div>
    <div className="source-heading-shot"><div className="source-tabs-shot"><button className={source === "modrinth" ? "active" : ""} onClick={() => setSource("modrinth")}>Modrinth</button><button className={source === "curseforge" ? "active" : ""} onClick={() => setSource("curseforge")}>CurseForge</button></div><span>{message}</span></div>
    <div className="project-list-shot">{results.map((project) => { const installed = items.some((asset) => asset.id === project.slug || asset.projectId === project.projectId || asset.id === `curseforge-${project.projectId}`); return <article className="project-row-shot" key={`${project.source}-${project.projectId}`}>{project.iconUrl ? <img src={project.iconUrl} alt="" /> : <span className="result-icon-shot"><Box size={18} /></span>}<div><strong>{project.title}</strong><small>{project.author ?? project.source} · {project.follows ? `${project.follows.toLocaleString("ko-KR")} 인기` : "호환 파일 확인"}</small></div><button type="button" disabled={busy || installed} onClick={() => void addProject(project)}>{installed ? "설치됨" : "설치"}</button></article>; })}<div className="load-more-shot" ref={loadMoreRef}>{busy ? "불러오는 중..." : hasMore && source === "modrinth" ? "더 불러오는 중..." : results.length ? "끝" : "결과 없음"}</div></div>
  </section>;
}

function ModpackPicker({ onBack, onCreate }: { onBack: () => void; onCreate: (profile: LauncherProfile) => void }) {
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ExternalProject[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("인기 모드팩");
  const [hasMore, setHasMore] = useState(true);

  const load = async (term = query, reset = true) => {
    if (busy) return;
    setBusy(true);
    const offset = reset ? 0 : results.length;
    setMessage(term.trim() ? "검색 중..." : "인기 모드팩");
    try {
      const next = await searchModrinthProjects("modpack", term, offset, PAGE_SIZE);
      setResults((current) => reset ? next : [...current, ...next.filter((item) => !current.some((old) => old.projectId === item.projectId))]);
      setHasMore(next.length >= PAGE_SIZE);
    } catch (error) {
      if (reset) setResults([]);
      setHasMore(false);
      setMessage(error instanceof Error ? error.message : "검색 실패");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { void load("", true); }, []);
  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMore && !busy) void load(query, false);
    }, { rootMargin: "180px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, busy, query, results.length]);

  const select = async (project: ExternalProject) => {
    setBusy(true);
    setMessage(".mrpack 분석 중...");
    try {
      const profile = await createProfileFromModrinthModpack(project);
      onCreate(profile);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "모드팩 분석 실패");
    } finally {
      setBusy(false);
    }
  };

  return <section className="modpack-page-shot"><div className="home-title"><p className="eyebrow">Modpacks</p><h2>모드팩 선택</h2><span>{message}</span></div><form className="library-search-shot modpack-search" onSubmit={(event) => { event.preventDefault(); void load(query, true); }}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Modrinth 모드팩 검색" /><button disabled={busy}>{busy ? "..." : "검색"}</button></form><div className="project-list-shot modpack-list">{results.map((project) => <article className="project-row-shot" key={project.projectId}>{project.iconUrl ? <img src={project.iconUrl} alt="" /> : <span className="result-icon-shot"><Box size={18} /></span>}<div><strong>{project.title}</strong><small>{project.author ?? "Modrinth"} · 선택하면 내부 파일을 mods/resourcePacks/shaders로 분해</small></div><button disabled={busy} onClick={() => void select(project)}>선택</button></article>)}<div className="load-more-shot" ref={loadMoreRef}>{busy ? "불러오는 중..." : hasMore ? "더 불러오는 중..." : "끝"}</div></div><button className="ghost-button" onClick={onBack}>뒤로</button></section>;
}

export function ConsoleApp() {
  const [sessionReady, setSessionReady] = useState(Boolean(getSession()));
  const [profiles, setProfiles] = useState<ProfilesManifest>([]);
  const [selectedId, setSelectedId] = useState("");
  const [view, setView] = useState<View>("home");
  const [activeTab, setActiveTab] = useState<AssetKind>("shaders");
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("서버 연결 대기 중");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LauncherProfile | null>(null);
  const selected = profiles.find((profile) => profile.id === selectedId) ?? profiles[0];
  const validation = useMemo(() => validateProfilesManifest(profiles), [profiles]);

  const reload = async () => {
    setStatus("불러오는 중...");
    const result = await loadProfiles();
    setProfiles(result.profiles);
    setSelectedId(result.profiles[0]?.id ?? "");
    setDirty(false);
    setView("home");
    setStatus(result.source === "local" ? "서버 로컬 저장소에서 불러옴" : "아직 저장된 프로필 없음");
  };

  useEffect(() => {
    if (sessionReady) reload().catch((error) => setStatus(error instanceof Error ? error.message : "불러오기 실패"));
  }, [sessionReady]);

  const setProfile = (next: LauncherProfile) => {
    setProfiles((items) => items.map((item) => item.id === selected?.id ? next : item));
    setSelectedId(next.id);
    setDirty(true);
  };

  const createCustomProfile = () => {
    const profile = createEmptyProfile();
    setProfiles((items) => [...items, profile]);
    setSelectedId(profile.id);
    setView("editor");
    setDirty(true);
  };

  const createModpackProfile = (profile: LauncherProfile) => {
    setProfiles((items) => [...items, profile]);
    setSelectedId(profile.id);
    setView("editor");
    setDirty(true);
  };

  const duplicate = () => {
    if (!selected) return;
    const profile = clone(selected);
    profile.id = `${selected.id}-copy-${Date.now().toString().slice(-4)}`;
    profile.name = `${selected.name} Copy`;
    setProfiles((items) => [...items, profile]);
    setSelectedId(profile.id);
    setView("editor");
    setDirty(true);
  };

  const requestRemove = () => {
    if (!selected) return;
    setDeleteTarget(selected);
  };

  const confirmRemove = () => {
    if (!deleteTarget) return;
    setProfiles((items) => items.filter((item) => item.id !== deleteTarget.id));
    setSelectedId("");
    setDeleteTarget(null);
    setView("home");
    setDirty(true);
    setStatus("프로필 삭제됨. 저장하면 서버 업로드 파일도 정리됩니다.");
  };

  const exportJson = () => {
    void navigator.clipboard.writeText(JSON.stringify(profiles, null, 2));
    setStatus("JSON 클립보드 복사 완료");
  };

  const save = async () => {
    if (!validation.ok) {
      setSaveStatus({ type: "error", message: "검증 오류" });
      return;
    }
    setIsSaving(true);
    setStatus("서버에 저장 중...");
    try {
      const result = await saveProfiles(profiles);
      setDirty(false);
      const deletedText = result.deletedProfileUploads ? ` · 삭제 프로필 파일 ${result.deletedProfileUploads}개 정리` : "";
      setStatus(`서버 저장 완료${deletedText}`);
      setSaveStatus({ type: "success", message: "저장됨", sha: result.sha });
    } catch (error) {
      const message = error instanceof Error ? error.message : "저장 실패";
      setStatus(message);
      setSaveStatus({ type: "error", message });
    } finally {
      setIsSaving(false);
    }
  };

  if (!sessionReady) return <LoginScreen onDone={() => setSessionReady(true)} />;

  return <main className="app-v2 notion-bg">
    <TopBar view={view} dirty={dirty} saveStatus={saveStatus} isSaving={isSaving} canSave={validation.ok} onHome={() => setView("home")} onSave={save} onMenu={() => setMenuOpen(true)} />
    {menuOpen && <div className="mobile-sheet-backdrop" onClick={() => setMenuOpen(false)}><div className="mobile-sheet" onClick={(event) => event.stopPropagation()}><button className="sheet-close" onClick={() => setMenuOpen(false)}><X /></button><button onClick={exportJson}><Copy size={16} />JSON 복사</button><button onClick={() => { clearSession(); setSessionReady(false); }}><LogOut size={16} />나가기</button></div></div>}
    {deleteTarget && <ConfirmDeleteModal profile={deleteTarget} onCancel={() => setDeleteTarget(null)} onConfirm={confirmRemove} />}

    {view === "home" && <HomeView profiles={profiles} onNew={() => setView("new")} onOpen={(id) => { setSelectedId(id); setView("editor"); }} />}
    {view === "new" && <NewProfileChoice onCustom={createCustomProfile} onModpack={() => setView("modpack")} onBack={() => setView("home")} />}
    {view === "modpack" && <ModpackPicker onBack={() => setView("new")} onCreate={createModpackProfile} />}
    {view === "editor" && selected && <>
      <section className="profile-section-v2"><div className="section-title-row"><h2><Box size={18} />{selected.name}</h2><span>{dirty ? "수정됨" : "동기화됨"}</span></div><div className="quick-actions-v2"><button onClick={duplicate}>복제</button><button className="danger-text" onClick={requestRemove}>삭제</button></div></section>
      <div className="workspace-v2 launcher-style-workspace"><ProfileSettings profile={selected} onChange={setProfile} /><section className="content-column"><div className="notion-card tab-shell-shot">{tabs.map((tab) => <button key={tab.id} className={activeTab === tab.id ? "active" : ""} onClick={() => setActiveTab(tab.id)}>{tab.label}<b>{selected[tab.id].length}</b></button>)}</div><ContentLibraryPanel profile={selected} kind={activeTab} onChange={setProfile} /></section><aside className="validation-panel-v2"><div className="notion-card sticky-card"><div className="card-head-v2"><h3>{validation.ok ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}검증</h3><span className={validation.ok ? "state-ok" : "state-bad"}>{validation.ok ? "OK" : "ERROR"}</span></div>{validation.ok ? <p className="muted">저장 가능한 상태입니다.</p> : <ul className="errors-v2">{validation.errors.map((error) => <li key={error}>{error}</li>)}</ul>}<p className="status-box">{status}</p></div></aside></div>
    </>}
  </main>;
}
