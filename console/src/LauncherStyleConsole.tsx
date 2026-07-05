import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { clearSession, getSession, loadLauncherMeta, loadProfiles, login, saveProfiles, type LauncherMeta } from "./api";
import { createEmptyProfile, MOD_LOADERS, type LauncherAsset, type LauncherProfile, type ProfilesManifest } from "../../shared/profileTypes";
import { validateProfilesManifest } from "../../shared/profileValidation";
import { getModrinthAsset, getModrinthModpackSeed, searchCurseForgeProjects, searchModrinthProjects, type ExternalProject, type ProjectKind, type SourceKind } from "./externalSources";

type View = "home" | "create" | "modpack" | "settings";
type SettingsTab = "profile" | "runtime" | "server" | "mods" | "resourcePacks" | "shaders";
type AssetKind = "mods" | "resourcePacks" | "shaders";

type ContentSection = { key: AssetKind; tab: SettingsTab; title: string; projectKind: ProjectKind; editableKey: keyof LauncherProfile["editableFields"] };

const sections: ContentSection[] = [
  { key: "mods", tab: "mods", title: "모드", projectKind: "mod", editableKey: "mods" },
  { key: "resourcePacks", tab: "resourcePacks", title: "리소스팩", projectKind: "resourcepack", editableKey: "resourcePacks" },
  { key: "shaders", tab: "shaders", title: "쉐이더", projectKind: "shader", editableKey: "shaders" },
];

const settingsTabs: Array<{ id: SettingsTab; label: string }> = [
  { id: "profile", label: "프로필" },
  { id: "runtime", label: "실행" },
  { id: "server", label: "서버" },
  { id: "mods", label: "모드" },
  { id: "resourcePacks", label: "리소스팩" },
  { id: "shaders", label: "쉐이더" },
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
  return <label className="console-field"><span>{label}</span>{children}</label>;
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <label className="ios-switch-row"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i /></label>;
}

function localFileAsset(file: File): LauncherAsset {
  const name = file.name.replace(/\.(jar|zip)$/i, "");
  return { id: safeId(name), name, version: "local", required: false, url: "" };
}

function LoginScreen({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("admin");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    try { await login(username, secret); onDone(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "로그인 실패"); }
  };
  return <main className="console-login"><form className="console-login-card" onSubmit={submit}>
    <span className="login-mark">z</span>
    <h1>zzapcho Console</h1>
    <p>관리자 계정으로 로그인</p>
    <Field label="아이디"><input value={username} onChange={(event) => setUsername(event.target.value)} /></Field>
    <Field label="비밀번호"><input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} /></Field>
    <button className="microsoft-login">로그인</button>
    {error && <p className="login-error">{error}</p>}
  </form></main>;
}

function TopBar({ dirty, status, onHome, onReload, onSave, onLogout }: { dirty: boolean; status: string; onHome: () => void; onReload: () => void; onSave: () => void; onLogout: () => void }) {
  return <header className="console-topbar">
    <button className="floating-control menu-button" onClick={onHome}><span /><span /><span /></button>
    <p className="console-status">{dirty ? "수정됨" : "동기화됨"} · {status}</p>
    <div className="console-actions"><button onClick={onReload}>새로고침</button><button className="save-button" onClick={onSave}>GitHub 저장</button><button onClick={onLogout}>나가기</button></div>
  </header>;
}

function Home({ profiles, onOpen, onCreate }: { profiles: ProfilesManifest; onOpen: (id: string) => void; onCreate: () => void }) {
  return <section className="console-home">
    <div className="console-home-title"><p className="eyebrow">zzapcho Launcher</p><h1>프로필</h1></div>
    <div className="console-profile-strip">
      {profiles.map((profile) => <button className="console-profile-card" key={profile.id} onClick={() => onOpen(profile.id)} style={{ "--accent": profile.accentColor, "--background": `linear-gradient(145deg, ${profile.accentColor}55, #101711)` } as React.CSSProperties}>
        <span className="version-badge"><span>{profile.minecraftVersion}</span>{profile.modLoader}</span>
        <h2>{profile.name}</h2>
        <p>{profile.customText}</p>
      </button>)}
      <button className="console-profile-card console-add-card" onClick={onCreate}><strong>+</strong><p>새 프로필</p></button>
    </div>
  </section>;
}

function CreateChoice({ onBack, onCustom, onModpack }: { onBack: () => void; onCustom: () => void; onModpack: () => void }) {
  return <section className="console-choice section-panel">
    <header><h2>새 프로필</h2><span>커스텀 또는 모드팩으로 시작</span></header>
    <div className="console-choice-grid"><button onClick={onCustom}><h3>커스텀</h3><p>직접 버전, 로더, 콘텐츠를 정합니다.</p></button><button onClick={onModpack}><h3>모드팩</h3><p>Modrinth 또는 CurseForge에서 최신 모드팩을 가져옵니다.</p></button></div>
    <button className="section-action" onClick={onBack}>홈으로</button>
  </section>;
}

function ModpackPicker({ onBack, onCreate }: { onBack: () => void; onCreate: (project: ExternalProject) => Promise<void> }) {
  const [source, setSource] = useState<SourceKind>("modrinth");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ExternalProject[]>([]);
  const [status, setStatus] = useState("모드팩을 검색하세요.");
  const [busy, setBusy] = useState(false);
  const search = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setStatus("검색 중...");
    try {
      const results = source === "modrinth" ? await searchModrinthProjects("modpack", query) : await searchCurseForgeProjects("modpack", query);
      setItems(results);
      setStatus(`${results.length}개 찾음`);
    } catch (error) {
      setItems([]);
      setStatus(error instanceof Error ? error.message : "검색 실패");
    } finally {
      setBusy(false);
    }
  };
  return <section className="section-panel modpack-picker">
    <header><h2>모드팩 선택</h2><span>{status}</span></header>
    <div className="log-segmented source-switch"><button className={source === "modrinth" ? "active" : ""} onClick={() => setSource("modrinth")}>Modrinth</button><button className={source === "curseforge" ? "active" : ""} onClick={() => setSource("curseforge")}>CurseForge</button></div>
    <div className="content-toolbar"><button className="section-action" onClick={onBack}>뒤로</button><form onSubmit={(event) => { event.preventDefault(); void search(); }}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="모드팩 검색" /><button>{busy ? "..." : "검색"}</button></form></div>
    <div className="modrinth-results">{items.map((project) => <article key={`${project.source}-${project.projectId}`}><span className="project-placeholder" style={project.iconUrl ? { backgroundImage: `url(${project.iconUrl})`, backgroundSize: "cover" } : undefined} /><div><strong>{project.title}</strong><small>{project.source} · 최신 모드팩 버전 기준으로 생성</small></div><button onClick={() => void onCreate(project)}>선택</button></article>)}</div>
  </section>;
}

function ProfilePanel({ profile, onChange }: { profile: LauncherProfile; onChange: (profile: LauncherProfile) => void }) {
  const update = (patch: Partial<LauncherProfile>) => onChange({ ...profile, ...patch });
  return <div className="settings-grid console-form-grid"><article><span>프로필 이름</span><input value={profile.name} onChange={(event) => update({ name: event.target.value })} /></article><article><span>프로필 문구</span><input value={profile.customText} onChange={(event) => update({ customText: event.target.value })} /></article><article><span>강조색</span><input type="color" value={profile.accentColor} onChange={(event) => update({ accentColor: event.target.value })} /></article><article><span>ID</span><input value={profile.id} onChange={(event) => update({ id: safeId(event.target.value) })} /></article></div>;
}

function RuntimePanel({ profile, meta, onChange }: { profile: LauncherProfile; meta: LauncherMeta | null; onChange: (profile: LauncherProfile) => void }) {
  const update = (patch: Partial<LauncherProfile>) => onChange({ ...profile, ...patch });
  const applyLatest = () => { const minecraftVersion = meta?.minecraft.latestRelease ?? profile.minecraftVersion; update({ minecraftVersion, javaVersion: guessJavaVersion(minecraftVersion), modLoaderVersion: latestLoader(meta, profile.modLoader) || profile.modLoaderVersion }); };
  return <div className="settings-grid console-form-grid"><article><span>버전</span><input list="mc-versions" value={profile.minecraftVersion} onChange={(event) => update({ minecraftVersion: event.target.value, javaVersion: guessJavaVersion(event.target.value) })} /></article><article><span>자바</span><input type="number" value={profile.javaVersion} onChange={(event) => update({ javaVersion: Number(event.target.value) })} /></article><article><span>로더</span><select value={profile.modLoader} onChange={(event) => update({ modLoader: event.target.value as LauncherProfile["modLoader"], modLoaderVersion: latestLoader(meta, event.target.value as LauncherProfile["modLoader"]) })}>{MOD_LOADERS.map((loader) => <option key={loader}>{loader}</option>)}</select></article><article><span>로더버전</span><input list="loader-versions" value={profile.modLoaderVersion} onChange={(event) => update({ modLoaderVersion: event.target.value })} /></article><button className="section-action" onClick={applyLatest} disabled={!meta}>최신 적용</button><datalist id="mc-versions">{meta?.minecraft.releases.map((version) => <option key={version} value={version} />)}</datalist><datalist id="loader-versions">{profile.modLoader !== "vanilla" && meta?.loaders[profile.modLoader].map((version) => <option key={version} value={version} />)}</datalist></div>;
}

function ServerPanel({ profile, onChange }: { profile: LauncherProfile; onChange: (profile: LauncherProfile) => void }) {
  const updateServer = (patch: Partial<LauncherProfile["defaultServer"]>) => onChange({ ...profile, defaultServer: { ...profile.defaultServer, ...patch } });
  return <div className="settings-grid console-form-grid"><article><span>서버 이름</span><input value={profile.defaultServer.name} onChange={(event) => updateServer({ name: event.target.value })} placeholder="선택" /></article><article><span>주소</span><input value={profile.defaultServer.address} onChange={(event) => updateServer({ address: event.target.value })} placeholder="선택" /></article><article><span>포트</span><input type="number" value={profile.defaultServer.port} onChange={(event) => updateServer({ port: Number(event.target.value) })} /></article></div>;
}

function ContentPanel({ profile, section, onChange }: { profile: LauncherProfile; section: ContentSection; onChange: (profile: LauncherProfile) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ExternalProject[]>([]);
  const [dragging, setDragging] = useState(false);
  const items = profile[section.key];
  const locked = !profile.editableFields[section.editableKey];
  const updateItems = (next: LauncherAsset[]) => onChange({ ...profile, [section.key]: next } as LauncherProfile);
  const updateEditable = (canEdit: boolean) => onChange({ ...profile, editableFields: { ...profile.editableFields, [section.editableKey]: canEdit } });
  const addFiles = (files: FileList | File[]) => updateItems([...items, ...Array.from(files).map(localFileAsset)]);
  const search = async () => { if (!query.trim()) return; setResults(await searchModrinthProjects(section.projectKind, query)); };
  const addProject = async (project: ExternalProject) => { let asset: LauncherAsset = { id: project.slug, name: project.title, version: profile.minecraftVersion, required: true, url: `modrinth://${project.slug}` }; try { asset = await getModrinthAsset(project, profile); } catch { /* fallback for UI */ } updateItems([...items, asset]); };
  return <div className="content-manager console-content-manager">
    <div className="content-toolbar console-content-toolbar"><Switch label="수정 제한" checked={locked} onChange={(value) => updateEditable(!value)} /><form onSubmit={(event) => { event.preventDefault(); void search(); }}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Modrinth 검색" /><button>검색</button></form></div>
    <div className={`drop-zone${dragging ? " is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}>파일을 여기에 끌어다 놓으세요</div>
    <div className="content-list">{items.length ? items.map((item, index) => <div className="content-row console-content-row" key={`${item.id}-${index}`}><span className="content-indicator" /><div className="content-name"><strong>{item.name}</strong><small>{item.version || "version 없음"} · {item.url || "드롭/수동 추가"}</small></div><Switch label="필수" checked={item.required} onChange={(value) => updateItems(items.map((current, i) => i === index ? { ...current, required: value } : current))} /><button className="remove-content" onClick={() => updateItems(items.filter((_, i) => i !== index))}>×</button></div>) : <div className="section-empty">현재 선택된 {section.title}가 없습니다.</div>}</div>
    <div className="modrinth-section"><div className="modrinth-heading"><strong>Modrinth</strong><span>프로필 버전에 맞춰 추가</span></div><div className="modrinth-results">{results.map((project) => <article key={project.projectId}><span className="project-placeholder" style={project.iconUrl ? { backgroundImage: `url(${project.iconUrl})`, backgroundSize: "cover" } : undefined} /><div><strong>{project.title}</strong><small>{project.author || "unknown"}</small></div><button onClick={() => void addProject(project)}>추가</button></article>)}</div></div>
  </div>;
}

function Settings({ profile, meta, active, onTab, onBack, onChange }: { profile: LauncherProfile; meta: LauncherMeta | null; active: SettingsTab; onTab: (tab: SettingsTab) => void; onBack: () => void; onChange: (profile: LauncherProfile) => void }) {
  const content = sections.find((section) => section.tab === active);
  return <section className="console-settings launcher-shell" style={{ "--accent": profile.accentColor, "--background": `linear-gradient(145deg, ${profile.accentColor}55, #0b100c)` } as React.CSSProperties}>
    <div className="edge-distortion" />
    <aside className="console-settings-menu launcher-menu-panel"><nav><button onClick={onBack}>← 홈</button>{settingsTabs.map((tab) => <button key={tab.id} className={active === tab.id ? "active" : ""} onClick={() => onTab(tab.id)}>{tab.label}</button>)}</nav></aside>
    <main className="section-panel console-settings-panel"><header><h2>{settingsTabs.find((tab) => tab.id === active)?.label}</h2><span>{profile.name} · {profile.minecraftVersion}</span></header>{active === "profile" && <ProfilePanel profile={profile} onChange={onChange} />}{active === "runtime" && <RuntimePanel profile={profile} meta={meta} onChange={onChange} />}{active === "server" && <ServerPanel profile={profile} onChange={onChange} />}{content && <ContentPanel profile={profile} section={content} onChange={onChange} />}</main>
  </section>;
}

export function LauncherStyleConsole() {
  const [ready, setReady] = useState(Boolean(getSession()));
  const [profiles, setProfiles] = useState<ProfilesManifest>([]);
  const [selectedId, setSelectedId] = useState("");
  const [view, setView] = useState<View>("home");
  const [tab, setTab] = useState<SettingsTab>("profile");
  const [meta, setMeta] = useState<LauncherMeta | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("대기");
  const selected = profiles.find((profile) => profile.id === selectedId);
  const validation = useMemo(() => validateProfilesManifest(profiles), [profiles]);
  const reload = async () => { const result = await loadProfiles(); setProfiles(result.profiles); setDirty(false); setStatus("GitHub 동기화됨"); };
  useEffect(() => { if (ready) reload().catch((error) => setStatus(error instanceof Error ? error.message : "불러오기 실패")); }, [ready]);
  useEffect(() => { if (ready) loadLauncherMeta(selected?.minecraftVersion).then(setMeta).catch(() => setMeta(null)); }, [ready, selected?.minecraftVersion]);
  const setProfile = (next: LauncherProfile) => { setProfiles((items) => items.map((item) => item.id === selectedId ? next : item)); setSelectedId(next.id); setDirty(true); };
  const createCustom = () => { const profile = createEmptyProfile(); setProfiles((items) => [...items, profile]); setSelectedId(profile.id); setDirty(true); setTab("profile"); setView("settings"); };
  const createPack = async (project: ExternalProject) => { const profile = createEmptyProfile(); profile.id = safeId(project.slug); profile.name = project.title; profile.description = project.description; profile.customText = `${project.title} 플레이`; if (project.source === "modrinth") { try { const seed = await getModrinthModpackSeed(project); if (seed.minecraftVersion) profile.minecraftVersion = seed.minecraftVersion; if (seed.modLoader) profile.modLoader = seed.modLoader; profile.javaVersion = guessJavaVersion(profile.minecraftVersion); profile.modLoaderVersion = latestLoader(meta, profile.modLoader); Object.assign(profile, { modpack: seed }); } catch { Object.assign(profile, { modpack: { project } }); } } else { Object.assign(profile, { modpack: { project } }); } setProfiles((items) => [...items, profile]); setSelectedId(profile.id); setDirty(true); setTab("runtime"); setView("settings"); };
  const save = async () => {
    if (!validation.ok) {
      setStatus(`검증 오류: ${validation.errors[0] ?? "확인 필요"}`);
      return;
    }
    setStatus("GitHub 저장 중...");
    try {
      const result = await saveProfiles(profiles);
      setDirty(false);
      setStatus(`GitHub 저장 완료${result.sha ? ` · ${result.sha.slice(0, 7)}` : ""}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "GitHub 저장 실패");
    }
  };
  if (!ready) return <LoginScreen onDone={() => setReady(true)} />;
  return <main className="console-root"><TopBar dirty={dirty} status={status} onHome={() => setView("home")} onReload={() => void reload()} onSave={() => void save()} onLogout={() => { clearSession(); setReady(false); }} />{view === "home" && <Home profiles={profiles} onOpen={(id) => { setSelectedId(id); setTab("profile"); setView("settings"); }} onCreate={() => setView("create")} />}{view === "create" && <CreateChoice onBack={() => setView("home")} onCustom={createCustom} onModpack={() => setView("modpack")} />}{view === "modpack" && <ModpackPicker onBack={() => setView("create")} onCreate={createPack} />}{view === "settings" && selected && <Settings profile={selected} meta={meta} active={tab} onTab={setTab} onBack={() => setView("home")} onChange={setProfile} />}</main>;
}
