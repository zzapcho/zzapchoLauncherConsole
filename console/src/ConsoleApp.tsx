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
import { clearSession, getSession, loadProfiles, login, saveProfiles } from "./api";
import {
  createEmptyProfile,
  MOD_LOADERS,
  type LauncherAsset,
  type LauncherProfile,
  type ProfilesManifest,
} from "../../shared/profileTypes";
import { validateProfilesManifest } from "../../shared/profileValidation";
import {
  getModrinthAsset,
  searchCurseForgeProjects,
  searchModrinthProjects,
  type ExternalProject,
  type ProjectKind,
  type SourceKind,
} from "./externalSources";

type AssetKind = "mods" | "resourcePacks" | "shaders";

type SaveStatus = {
  type: "success" | "error";
  message: string;
  sha?: string | null;
} | null;

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
  return value ? value.slice(0, 7) : "unknown";
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function localAsset(file: File): LauncherAsset {
  const name = file.name.replace(/\.(jar|zip)$/i, "");
  return { id: safeId(name), name, version: "local", required: false, url: "" };
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
      <div className="brand-orb"><Settings2 /></div>
      <p className="eyebrow">zzapcho Launcher</p>
      <h1>Console</h1>
      <p className="muted">관리자 계정으로 로그인해서 프로필과 콘텐츠를 관리합니다.</p>
      <Field label="아이디"><input value={username} onChange={(event) => setUsername(event.target.value)} /></Field>
      <Field label="비밀번호"><input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} /></Field>
      <button className="primary-button full" disabled={busy}>{busy ? "확인 중..." : "로그인"}</button>
      {error && <p className="inline-error"><AlertCircle size={15} />{error}</p>}
    </form>
  </main>;
}

function ProfileCard({ profile, active, onClick }: { profile: LauncherProfile; active: boolean; onClick: () => void }) {
  const count = profile.mods.length + profile.resourcePacks.length + profile.shaders.length;
  return <button type="button" className={`profile-card-v2${active ? " active" : ""}`} style={{ "--accent": profile.accentColor } as React.CSSProperties} onClick={onClick}>
    <span className="profile-dot" />
    <strong>{profile.name}</strong>
    <p>{profile.description || profile.customText}</p>
    <span className="profile-meta"><b>MC {profile.minecraftVersion}</b><b>{profile.modLoader}</b><b>{count} files</b></span>
    {active && <span className="editing-badge">편집 중</span>}
  </button>;
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
        <div className="split-grid">
          <Field label="마크 버전"><input value={profile.minecraftVersion} onChange={(event) => update({ minecraftVersion: event.target.value })} /></Field>
          <Field label="Java"><input type="number" value={profile.javaVersion} onChange={(event) => update({ javaVersion: Number(event.target.value) })} /></Field>
        </div>
        <div className="split-grid">
          <Field label="로더"><select value={profile.modLoader} onChange={(event) => update({ modLoader: event.target.value as LauncherProfile["modLoader"] })}>{MOD_LOADERS.map((loader) => <option key={loader}>{loader}</option>)}</select></Field>
          <Field label="로더 버전"><input value={profile.modLoaderVersion} onChange={(event) => update({ modLoaderVersion: event.target.value })} /></Field>
        </div>
        <div className="split-grid server-grid">
          <Field label="서버 이름"><input value={profile.defaultServer.name} onChange={(event) => updateServer({ name: event.target.value })} /></Field>
          <Field label="주소"><input value={profile.defaultServer.address} onChange={(event) => updateServer({ address: event.target.value })} /></Field>
          <Field label="포트"><input type="number" value={profile.defaultServer.port} onChange={(event) => updateServer({ port: Number(event.target.value) })} /></Field>
        </div>
        <div className="split-grid">
          <Field label="최소 MB"><input type="number" value={profile.launchOptions.minMemoryMb} onChange={(event) => updateLaunch({ minMemoryMb: Number(event.target.value) })} /></Field>
          <Field label="최대 MB"><input type="number" value={profile.launchOptions.maxMemoryMb} onChange={(event) => updateLaunch({ maxMemoryMb: Number(event.target.value) })} /></Field>
        </div>
        <Field label="강조색"><div className="color-input"><span>{profile.accentColor}</span><input type="color" value={profile.accentColor} onChange={(event) => update({ accentColor: event.target.value })} /></div></Field>
      </div>
    </div>

    <div className="notion-card">
      <div className="card-head-v2"><h3><Lock size={18} />런처 수정 허용</h3><small>true = 유저 수정 가능</small></div>
      <div className="toggle-grid">
        {(Object.entries(profile.editableFields) as Array<[keyof LauncherProfile["editableFields"], boolean]>).map(([key, value]) => <Toggle key={key} label={editableLabels[key]} checked={value} lock onChange={() => update({ editableFields: { ...profile.editableFields, [key]: !value } })} />)}
      </div>
    </div>
  </section>;
}

function ContentLibraryPanel({ profile, kind, onChange }: { profile: LauncherProfile; kind: AssetKind; onChange: (profile: LauncherProfile) => void }) {
  const section = contentSections[kind];
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<SourceKind>("modrinth");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ExternalProject[]>([]);
  const [message, setMessage] = useState("인기순");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const items = profile[kind];
  const updateItems = (next: LauncherAsset[]) => onChange({ ...profile, [kind]: next } as LauncherProfile);

  const search = async (term = query) => {
    setBusy(true);
    setMessage(term.trim() ? "검색 중..." : "인기순 불러오는 중...");
    try {
      const next = source === "modrinth"
        ? await searchModrinthProjects(section.projectKind, term)
        : await searchCurseForgeProjects(section.projectKind, term || section.title);
      setResults(next);
      setMessage(term.trim() ? `${next.length}개 찾음` : "인기순");
    } catch (error) {
      setResults([]);
      setMessage(error instanceof Error ? error.message : "검색 실패");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    setQuery("");
    void search("");
  }, [profile.id, kind, source]);

  const addFiles = (files: FileList | File[]) => {
    const nextFiles = Array.from(files).filter((file) => file.name.toLowerCase().endsWith(section.accept));
    if (!nextFiles.length) return;
    updateItems([...items, ...nextFiles.map(localAsset)]);
  };

  const addProject = async (project: ExternalProject) => {
    setBusy(true);
    setMessage("파일 정보 확인 중...");
    try {
      const asset = project.source === "modrinth"
        ? await getModrinthAsset(project, profile)
        : { id: `curseforge-${project.projectId}`, name: project.title, version: profile.minecraftVersion, required: true, url: `curseforge://${project.projectId}` } satisfies LauncherAsset;
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

    <div className="installed-stack-shot">
      {items.map((item, index) => <article className="installed-card-shot" key={`${item.id}-${index}`}>
        <span className="green-dot" />
        <div className="installed-info"><strong>{item.name}</strong><small>{item.version || "버전 없음"} · {item.required ? "필수" : "선택"}</small></div>
        <Toggle label="" checked={item.required} onChange={() => updateItems(items.map((asset, i) => i === index ? { ...asset, required: !asset.required } : asset))} />
        <button className="tiny-icon" type="button" onClick={() => updateItems(items.filter((_, i) => i !== index))}><X size={15} /></button>
      </article>)}
      {!items.length && <div className="empty-installed-shot"><span className="green-dot" />아직 적용된 {section.title} 없음</div>}
    </div>

    <div
      className={`drop-zone-shot${dragging ? " dragging" : ""}`}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}
    >
      파일을 여기에 끌어다 놓으세요
    </div>

    <div className="library-actions-shot">
      <input ref={inputRef} type="file" multiple accept={section.accept} hidden onChange={(event) => event.target.files && addFiles(event.target.files)} />
      <button type="button" className="folder-button-shot" onClick={() => inputRef.current?.click()}><FolderPlus size={16} />폴더에서 추가</button>
      <form className="library-search-shot" onSubmit={(event) => { event.preventDefault(); void search(query); }}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`${source === "modrinth" ? "Modrinth" : "CurseForge"} 검색`} />
        <button disabled={busy}>{busy ? "..." : "검색"}</button>
      </form>
    </div>

    <div className="source-heading-shot">
      <div className="source-tabs-shot"><button className={source === "modrinth" ? "active" : ""} onClick={() => setSource("modrinth")}>Modrinth</button><button className={source === "curseforge" ? "active" : ""} onClick={() => setSource("curseforge")}>CurseForge</button></div>
      <span>{message}</span>
    </div>

    <div className="project-list-shot">
      {results.map((project) => {
        const installed = items.some((asset) => asset.id === project.slug || asset.id === project.projectId || asset.id === `curseforge-${project.projectId}`);
        return <article className="project-row-shot" key={`${project.source}-${project.projectId}`}>
          {project.iconUrl ? <img src={project.iconUrl} alt="" /> : <span className="result-icon-shot"><Box size={18} /></span>}
          <div><strong>{project.title}</strong><small>{project.author ?? project.source} · {project.follows ? `${project.follows.toLocaleString("ko-KR")} 팔로우` : "호환 파일 확인"}</small></div>
          <button type="button" disabled={busy || installed} onClick={() => void addProject(project)}>{installed ? "설치됨" : "설치"}</button>
        </article>;
      })}
    </div>
  </section>;
}

export function ConsoleApp() {
  const [sessionReady, setSessionReady] = useState(Boolean(getSession()));
  const [profiles, setProfiles] = useState<ProfilesManifest>([]);
  const [selectedId, setSelectedId] = useState("");
  const [activeTab, setActiveTab] = useState<AssetKind>("shaders");
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("서버 연결 대기 중");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const selected = profiles.find((profile) => profile.id === selectedId) ?? profiles[0];
  const validation = useMemo(() => validateProfilesManifest(profiles), [profiles]);

  const reload = async () => {
    setStatus("불러오는 중...");
    const result = await loadProfiles();
    setProfiles(result.profiles);
    setSelectedId(result.profiles[0]?.id ?? "");
    setDirty(false);
    setStatus(result.source === "github" ? `GitHub에서 불러옴 · ${shortSha(result.sha)}` : "GITHUB_TOKEN 없음: 빈 manifest로 시작");
  };

  useEffect(() => {
    if (sessionReady) reload().catch((error) => setStatus(error instanceof Error ? error.message : "불러오기 실패"));
  }, [sessionReady]);

  const setProfile = (next: LauncherProfile) => {
    setProfiles((items) => items.map((item) => item.id === selected?.id ? next : item));
    setSelectedId(next.id);
    setDirty(true);
  };

  const addProfile = () => {
    const profile = createEmptyProfile();
    setProfiles((items) => [...items, profile]);
    setSelectedId(profile.id);
    setDirty(true);
    setTimeout(() => document.getElementById("profile-settings-section")?.scrollIntoView({ behavior: "smooth" }), 80);
  };

  const duplicate = () => {
    if (!selected) return;
    const profile = clone(selected);
    profile.id = `${selected.id}-copy-${Date.now().toString().slice(-4)}`;
    profile.name = `${selected.name} Copy`;
    setProfiles((items) => [...items, profile]);
    setSelectedId(profile.id);
    setDirty(true);
  };

  const remove = () => {
    if (!selected) return;
    setProfiles((items) => items.filter((item) => item.id !== selected.id));
    setSelectedId("");
    setDirty(true);
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
    setStatus("GitHub에 저장 중...");
    try {
      const result = await saveProfiles(profiles);
      setDirty(false);
      setStatus(`저장 완료 · ${shortSha(result.sha)}`);
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

  if (!selected) return <main className="app-v2 notion-bg">
    <header className="topbar-v2"><div className="brand-line"><div className="brand-orb"><Settings2 /></div><div><p className="eyebrow">zzapcho Launcher</p><h1>Console</h1></div></div><button className="primary-button" onClick={addProfile}><Plus size={17} />새 프로필</button></header>
    <div className="blank-state"><h2>프로필 없음</h2><p>새 프로필을 만들어 시작하세요.</p></div>
  </main>;

  return <main className="app-v2 notion-bg">
    <header className="topbar-v2">
      <div className="brand-line"><div className="brand-orb"><Settings2 size={20} /></div><div className="brand-text"><p className="eyebrow">zzapcho Launcher</p><h1>Console <span>BETA</span></h1></div></div>
      <div className="top-actions-v2">
        {saveStatus && <div className={`save-toast ${saveStatus.type}`}>{saveStatus.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}<span>{saveStatus.message}</span>{saveStatus.sha && <code>{shortSha(saveStatus.sha)}</code>}</div>}
        <button className="ghost-button hide-mobile" onClick={exportJson}><Copy size={16} />JSON</button>
        <button className="primary-button" onClick={save} disabled={isSaving || !validation.ok}>{isSaving ? "저장 중" : <><Github size={17} />저장</>}</button>
        <button className="mobile-menu-button" onClick={() => setMenuOpen(true)}><Menu /></button>
      </div>
    </header>

    {menuOpen && <div className="mobile-sheet-backdrop" onClick={() => setMenuOpen(false)}><div className="mobile-sheet" onClick={(event) => event.stopPropagation()}><button className="sheet-close" onClick={() => setMenuOpen(false)}><X /></button><button onClick={exportJson}><Copy size={16} />JSON 복사</button><button onClick={() => { clearSession(); setSessionReady(false); }}><LogOut size={16} />나가기</button></div></div>}

    <section className="profile-section-v2">
      <div className="section-title-row"><h2><Box size={18} />프로필</h2><span>{profiles.length}개 · {dirty ? "수정됨" : "동기화됨"}</span></div>
      <div className="profile-rail-v2"><button className="add-profile-card" onClick={addProfile}><Plus /><span>새 프로필</span></button>{profiles.map((profile) => <ProfileCard key={profile.id} profile={profile} active={profile.id === selected.id} onClick={() => setSelectedId(profile.id)} />)}</div>
      <div className="quick-actions-v2"><button onClick={duplicate}>복제</button><button className="danger-text" onClick={remove}>삭제</button></div>
    </section>

    <div className="workspace-v2 launcher-style-workspace">
      <ProfileSettings profile={selected} onChange={setProfile} />
      <section className="content-column">
        <div className="notion-card tab-shell-shot">{tabs.map((tab) => <button key={tab.id} className={activeTab === tab.id ? "active" : ""} onClick={() => setActiveTab(tab.id)}>{tab.label}<b>{selected[tab.id].length}</b></button>)}</div>
        <ContentLibraryPanel profile={selected} kind={activeTab} onChange={setProfile} />
      </section>
      <aside className="validation-panel-v2"><div className="notion-card sticky-card"><div className="card-head-v2"><h3>{validation.ok ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}검증</h3><span className={validation.ok ? "state-ok" : "state-bad"}>{validation.ok ? "OK" : "ERROR"}</span></div>{validation.ok ? <p className="muted">저장 가능한 상태입니다.</p> : <ul className="errors-v2">{validation.errors.map((error) => <li key={error}>{error}</li>)}</ul>}<p className="status-box">{status}</p></div></aside>
    </div>
  </main>;
}
