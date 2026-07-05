import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { clearSession, getSession, loadLauncherMeta, loadProfiles, login, saveProfiles, type LauncherMeta } from "./api";
import { createEmptyProfile, MOD_LOADERS, type LauncherAsset, type LauncherProfile, type ProfilesManifest } from "../../shared/profileTypes";
import { validateProfilesManifest } from "../../shared/profileValidation";
import { getModrinthAsset, searchCurseForgeProjects, searchModrinthProjects, type ExternalProject, type ProjectKind, type SourceKind } from "./externalSources";

type View = "home" | "create" | "modpack" | "settings";
type AssetKind = "mods" | "resourcePacks" | "shaders";

type ContentSection = { key: AssetKind; title: string; projectKind: ProjectKind; editableKey: keyof LauncherProfile["editableFields"] };

const contentSections: ContentSection[] = [
  { key: "mods", title: "모드", projectKind: "mod", editableKey: "mods" },
  { key: "resourcePacks", title: "리소스팩", projectKind: "resourcepack", editableKey: "resourcePacks" },
  { key: "shaders", title: "쉐이더", projectKind: "shader", editableKey: "shaders" },
];

function safeId(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || `profile-${Date.now()}`;
}

function guessJavaVersion(version: string) {
  const [majorRaw, minorRaw] = version.split(".");
  const major = Number(majorRaw);
  const minor = Number(minorRaw);
  if (major > 1 || minor >= 20) return 21;
  if (minor >= 18) return 17;
  return 8;
}

function latestLoader(meta: LauncherMeta | null, loader: LauncherProfile["modLoader"]) {
  return loader === "vanilla" ? "" : meta?.loaders[loader]?.[0] ?? "";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="board-field"><span>{label}</span>{children}</label>;
}

function LoginScreen({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("admin");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await login(username, secret);
      onDone();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "로그인 실패");
    }
  };
  return <main className="board-login"><form className="board-login-card" onSubmit={submit}>
    <b>zzapcho Console</b>
    <Field label="아이디"><input value={username} onChange={(event) => setUsername(event.target.value)} /></Field>
    <Field label="비밀번호"><input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} /></Field>
    <button>로그인</button>
    {error && <p>{error}</p>}
  </form></main>;
}

function Header({ dirty, status, canSave, onHome, onReload, onSave, onLogout }: { dirty: boolean; status: string; canSave: boolean; onHome: () => void; onReload: () => void; onSave: () => void; onLogout: () => void }) {
  return <header className="board-header">
    <button className="ghost" onClick={onHome}>Profiles</button>
    <span className={dirty ? "board-pill dirty" : "board-pill"}>{dirty ? "수정됨" : "동기화됨"}</span>
    <span className="board-status">{status}</span>
    <div />
    <button onClick={onReload}>새로고침</button>
    <button className="primary" disabled={!canSave} onClick={onSave}>GitHub 저장</button>
    <button className="ghost" onClick={onLogout}>나가기</button>
  </header>;
}

function HomeView({ profiles, onOpen, onCreate }: { profiles: ProfilesManifest; onOpen: (id: string) => void; onCreate: () => void }) {
  return <section className="board-home">
    <aside className="board-left-title"><p>Launcher</p><h1>프로필</h1></aside>
    <div className="profile-card-grid">
      {profiles.map((profile) => <button className="profile-card" key={profile.id} onClick={() => onOpen(profile.id)} style={{ "--accent": profile.accentColor } as React.CSSProperties}>
        <span>{profile.modLoader}</span>
        <h2>{profile.name}</h2>
        <p>{profile.customText}</p>
        <small>{profile.minecraftVersion} · Java {profile.javaVersion}</small>
      </button>)}
      <button className="profile-card add-card" onClick={onCreate}><strong>+</strong><p>새 프로필</p></button>
    </div>
  </section>;
}

function CreateView({ onBack, onCustom, onModpack }: { onBack: () => void; onCustom: () => void; onModpack: () => void }) {
  return <section className="choice-screen">
    <button className="ghost back" onClick={onBack}>← 홈</button>
    <h1>새 프로필</h1>
    <div className="choice-grid">
      <button className="choice-card" onClick={onCustom}><h2>커스텀</h2><p>직접 버전, 로더, 콘텐츠를 정해서 만드는 프로필</p></button>
      <button className="choice-card" onClick={onModpack}><h2>모드팩</h2><p>Modrinth 또는 CurseForge에서 모드팩을 검색해서 시작</p></button>
    </div>
  </section>;
}

function ModpackView({ onBack, onCreate }: { onBack: () => void; onCreate: (project: ExternalProject) => void }) {
  const [source, setSource] = useState<SourceKind>("modrinth");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ExternalProject[]>([]);
  const [status, setStatus] = useState("모드팩을 검색하세요.");
  const search = async () => {
    if (!query.trim()) return;
    setStatus("검색 중...");
    try {
      const result = source === "modrinth" ? await searchModrinthProjects("modpack", query) : await searchCurseForgeProjects("modpack", query);
      setItems(result);
      setStatus(`${result.length}개 찾음`);
    } catch (error) {
      setItems([]);
      setStatus(error instanceof Error ? error.message : "검색 실패");
    }
  };
  return <section className="modpack-screen">
    <button className="ghost back" onClick={onBack}>← 선택</button>
    <h1>모드팩 선택</h1>
    <div className="source-tabs"><button className={source === "modrinth" ? "active" : ""} onClick={() => setSource("modrinth")}>Modrinth</button><button className={source === "curseforge" ? "active" : ""} onClick={() => setSource("curseforge")}>CurseForge</button></div>
    <form className="search-row" onSubmit={(event) => { event.preventDefault(); void search(); }}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="모드팩 검색" /><button>검색</button></form>
    <p className="board-status">{status}</p>
    <div className="project-grid">{items.map((item) => <button className="project-card" key={`${item.source}-${item.projectId}`} onClick={() => onCreate(item)}>{item.iconUrl ? <img src={item.iconUrl} alt="" /> : <span /> }<div><b>{item.title}</b><p>{item.description}</p><small>{item.source}</small></div></button>)}</div>
  </section>;
}

function ContentEditor({ profile, section, onChange }: { profile: LauncherProfile; section: ContentSection; onChange: (profile: LauncherProfile) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ExternalProject[]>([]);
  const [busy, setBusy] = useState(false);
  const locked = !profile.editableFields[section.editableKey];
  const items = profile[section.key];
  const update = (patch: Partial<LauncherProfile>) => onChange({ ...profile, ...patch });
  const updateItems = (next: LauncherAsset[]) => update({ [section.key]: next } as Partial<LauncherProfile>);
  const search = async () => {
    if (!query.trim()) return;
    setBusy(true);
    try { setResults(await searchModrinthProjects(section.projectKind, query)); }
    finally { setBusy(false); }
  };
  const addProject = async (project: ExternalProject) => {
    let asset: LauncherAsset = { id: project.slug, name: project.title, version: profile.minecraftVersion, required: true, url: `modrinth://${project.slug}` };
    try { asset = await getModrinthAsset(project, profile); } catch { /* UI-first fallback */ }
    updateItems([...items, asset]);
  };
  return <section className="settings-card content-card">
    <div className="settings-card-head"><div><h3>{section.title}</h3><p>필수 항목과 유저 커스텀 잠금</p></div><label className="lock-toggle"><input type="checkbox" checked={locked} onChange={(event) => update({ editableFields: { ...profile.editableFields, [section.editableKey]: !event.target.checked } })} />유저 커스텀 잠금</label></div>
    <div className="asset-list">{items.map((item, index) => <div className="asset-item" key={`${item.id}-${index}`}><b>{item.name}</b><small>{item.version}</small><label><input type="checkbox" checked={item.required} onChange={(event) => updateItems(items.map((current, i) => i === index ? { ...current, required: event.target.checked } : current))} />필수</label><button onClick={() => updateItems(items.filter((_, i) => i !== index))}>삭제</button></div>)}</div>
    <form className="mini-search" onSubmit={(event) => { event.preventDefault(); void search(); }}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Modrinth 검색" /><button>{busy ? "..." : "검색"}</button></form>
    <div className="mini-results">{results.slice(0, 5).map((project) => <button key={project.projectId} onClick={() => void addProject(project)}>{project.title}</button>)}</div>
  </section>;
}

function SettingsView({ profile, meta, onBack, onChange }: { profile: LauncherProfile; meta: LauncherMeta | null; onBack: () => void; onChange: (profile: LauncherProfile) => void }) {
  const update = (patch: Partial<LauncherProfile>) => onChange({ ...profile, ...patch });
  const updateServer = (patch: Partial<LauncherProfile["defaultServer"]>) => update({ defaultServer: { ...profile.defaultServer, ...patch } });
  const applyLatest = () => {
    const minecraftVersion = meta?.minecraft.latestRelease ?? profile.minecraftVersion;
    update({ minecraftVersion, javaVersion: guessJavaVersion(minecraftVersion), modLoaderVersion: latestLoader(meta, profile.modLoader) || profile.modLoaderVersion });
  };
  return <section className="settings-screen">
    <button className="ghost back" onClick={onBack}>← 홈</button>
    <div className="settings-title"><div><p>Profile Settings</p><h1>{profile.name}</h1></div><button onClick={applyLatest} disabled={!meta}>최신 실행정보 적용</button></div>
    <section className="settings-card"><h3>프로필</h3><div className="settings-grid two"><Field label="프로필 이름"><input value={profile.name} onChange={(event) => update({ name: event.target.value })} /></Field><Field label="프로필 문구"><input value={profile.customText} onChange={(event) => update({ customText: event.target.value })} /></Field><Field label="강조색"><input type="color" value={profile.accentColor} onChange={(event) => update({ accentColor: event.target.value })} /></Field></div></section>
    <section className="settings-card"><div className="settings-card-head"><h3>실행정보</h3><p>최신 Minecraft/Loader 목록 자동</p></div><div className="settings-grid four"><Field label="버전"><input list="mc-versions" value={profile.minecraftVersion} onChange={(event) => update({ minecraftVersion: event.target.value, javaVersion: guessJavaVersion(event.target.value) })} /></Field><Field label="자바"><input type="number" value={profile.javaVersion} onChange={(event) => update({ javaVersion: Number(event.target.value) })} /></Field><Field label="로더"><select value={profile.modLoader} onChange={(event) => update({ modLoader: event.target.value as LauncherProfile["modLoader"], modLoaderVersion: latestLoader(meta, event.target.value as LauncherProfile["modLoader"]) })}>{MOD_LOADERS.map((loader) => <option key={loader}>{loader}</option>)}</select></Field><Field label="로더버전"><input list="loader-versions" value={profile.modLoaderVersion} onChange={(event) => update({ modLoaderVersion: event.target.value })} /></Field></div><datalist id="mc-versions">{meta?.minecraft.releases.map((version) => <option key={version} value={version} />)}</datalist><datalist id="loader-versions">{profile.modLoader !== "vanilla" && meta?.loaders[profile.modLoader].map((version) => <option key={version} value={version} />)}</datalist></section>
    <section className="settings-card"><h3>대표 서버</h3><div className="settings-grid three"><Field label="서버 이름"><input value={profile.defaultServer.name} onChange={(event) => updateServer({ name: event.target.value })} /></Field><Field label="주소"><input value={profile.defaultServer.address} onChange={(event) => updateServer({ address: event.target.value })} placeholder="선택" /></Field><Field label="포트"><input type="number" value={profile.defaultServer.port} onChange={(event) => updateServer({ port: Number(event.target.value) })} /></Field></div></section>
    {contentSections.map((section) => <ContentEditor key={section.key} profile={profile} section={section} onChange={onChange} />)}
  </section>;
}

export function BoardApp() {
  const [ready, setReady] = useState(Boolean(getSession()));
  const [profiles, setProfiles] = useState<ProfilesManifest>([]);
  const [selectedId, setSelectedId] = useState("");
  const [view, setView] = useState<View>("home");
  const [meta, setMeta] = useState<LauncherMeta | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("대기");
  const selected = profiles.find((profile) => profile.id === selectedId);
  const validation = useMemo(() => validateProfilesManifest(profiles), [profiles]);
  const reload = async () => { const result = await loadProfiles(); setProfiles(result.profiles); setDirty(false); setStatus("GitHub 동기화됨"); };
  useEffect(() => { if (ready) reload().catch((error) => setStatus(error instanceof Error ? error.message : "불러오기 실패")); }, [ready]);
  useEffect(() => { if (ready) loadLauncherMeta(selected?.minecraftVersion).then(setMeta).catch(() => setMeta(null)); }, [ready, selected?.minecraftVersion]);
  const setProfile = (next: LauncherProfile) => { setProfiles((items) => items.map((item) => item.id === selectedId ? next : item)); setSelectedId(next.id); setDirty(true); };
  const createCustom = () => { const profile = createEmptyProfile(); setProfiles((items) => [...items, profile]); setSelectedId(profile.id); setDirty(true); setView("settings"); };
  const createPack = (project: ExternalProject) => { const profile = createEmptyProfile(); profile.id = safeId(project.slug); profile.name = project.title; profile.description = project.description; profile.customText = `${project.title} 플레이`; profile.mods = [{ id: project.slug, name: project.title, version: "modpack", required: true, url: `${project.source}://${project.slug}` }]; setProfiles((items) => [...items, profile]); setSelectedId(profile.id); setDirty(true); setView("settings"); };
  const save = async () => { if (!validation.ok) { setStatus("검증 오류"); return; } await saveProfiles(profiles); setDirty(false); setStatus("저장 완료"); };
  if (!ready) return <LoginScreen onDone={() => setReady(true)} />;
  return <main className="board-shell">
    <Header dirty={dirty} status={status} canSave={validation.ok} onHome={() => setView("home")} onReload={() => void reload()} onSave={() => void save()} onLogout={() => { clearSession(); setReady(false); }} />
    {view === "home" && <HomeView profiles={profiles} onOpen={(id) => { setSelectedId(id); setView("settings"); }} onCreate={() => setView("create")} />}
    {view === "create" && <CreateView onBack={() => setView("home")} onCustom={createCustom} onModpack={() => setView("modpack")} />}
    {view === "modpack" && <ModpackView onBack={() => setView("create")} onCreate={createPack} />}
    {view === "settings" && selected && <SettingsView profile={selected} meta={meta} onBack={() => setView("home")} onChange={setProfile} />}
  </main>;
}
