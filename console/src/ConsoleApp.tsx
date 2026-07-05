import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Box, CheckCircle2, Copy, Github, Lock, LogOut, Menu, Plus, Search, Settings2, Trash2, Upload, X } from "lucide-react";
import { clearSession, getSession, loadProfiles, login, saveProfiles } from "./api";
import { createEmptyProfile, MOD_LOADERS, type LauncherAsset, type LauncherProfile, type ProfilesManifest } from "../../shared/profileTypes";
import { validateProfilesManifest } from "../../shared/profileValidation";
import { ExternalAssetPicker } from "./ExternalAssetPicker";
import type { ExternalProject, ProjectKind } from "./externalSources";

type AssetKind = "mods" | "resourcePacks" | "shaders";
const tabs: Array<{ id: AssetKind; label: string }> = [{ id: "mods", label: "모드" }, { id: "resourcePacks", label: "리소스팩" }, { id: "shaders", label: "쉐이더" }];
const editableLabels: Record<keyof LauncherProfile["editableFields"], string> = { server: "대표 서버", mods: "모드", resourcePacks: "리소스팩", shaders: "쉐이더", minecraftVersion: "마크 버전", modLoader: "로더", javaArgs: "Java Args", memory: "메모리" };
const safeId = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || `profile-${Date.now()}`;
const shortSha = (value?: string | null) => value ? value.slice(0, 7) : "unknown";
const assetKey = (kind: ProjectKind): AssetKind => kind === "resourcepack" ? "resourcePacks" : kind === "shader" ? "shaders" : "mods";
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="ui-field"><span>{label}</span>{children}</label>;
}

function Toggle({ label, checked, onChange, lock }: { label: string; checked: boolean; onChange: () => void; lock?: boolean }) {
  return <button type="button" className="toggle-switch" onClick={onChange} aria-pressed={checked}><span className="toggle-label">{lock && <Lock size={13} />}{label}</span><span className={`switch-track${checked ? " checked" : ""}`}><span /></span></button>;
}

function LoginScreen({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("admin");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try { await login(username, secret); onDone(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "로그인 실패"); }
    finally { setBusy(false); }
  };
  return <main className="login-page notion-bg"><form className="login-card-v2" onSubmit={submit}><div className="brand-orb"><Settings2 /></div><p className="eyebrow">zzapcho Launcher</p><h1>Console</h1><p className="muted">관리자 계정으로 로그인해서 프로필과 콘텐츠를 관리합니다.</p><Field label="아이디"><input value={username} onChange={(e) => setUsername(e.target.value)} /></Field><Field label="비밀번호"><input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} /></Field><button className="primary-button full" disabled={busy}>{busy ? "확인 중..." : "로그인"}</button>{error && <p className="inline-error"><AlertCircle size={15} />{error}</p>}</form></main>;
}

function ProfileCard({ profile, active, onClick }: { profile: LauncherProfile; active: boolean; onClick: () => void }) {
  const count = profile.mods.length + profile.resourcePacks.length + profile.shaders.length;
  return <button type="button" className={`profile-card-v2${active ? " active" : ""}`} style={{ "--accent": profile.accentColor } as React.CSSProperties} onClick={onClick}><span className="profile-dot" /><strong>{profile.name}</strong><p>{profile.description || profile.customText}</p><span className="profile-meta"><b>MC {profile.minecraftVersion}</b><b>{profile.modLoader}</b><b>{count} files</b></span>{active && <span className="editing-badge">편집 중</span>}</button>;
}

function AssetList({ kind, items, onChange }: { kind: AssetKind; items: LauncherAsset[]; onChange: (items: LauncherAsset[]) => void }) {
  const update = (index: number, patch: Partial<LauncherAsset>) => onChange(items.map((item, i) => i === index ? { ...item, ...patch } : item));
  if (!items.length) return <div className="empty-drop-card"><Upload size={34} /><strong>아직 등록된 파일이 없습니다</strong><p>{kind === "mods" ? ".jar" : ".zip"} 파일을 추가하세요.</p></div>;
  return <div className="asset-list-v2">{items.map((item, index) => <article className="asset-row-v2" key={`${item.id}-${index}`}><div className="asset-main-v2"><div className="asset-icon"><Box size={20} /></div><div className="asset-text"><div className="asset-title-line"><input value={item.name} onChange={(e) => update(index, { name: e.target.value })} /><span className="source-badge remote">{item.url.startsWith("curseforge://") ? "CURSEFORGE" : item.url ? "REMOTE" : "MANUAL"}</span></div><div className="asset-subgrid"><input value={item.id} onChange={(e) => update(index, { id: safeId(e.target.value) })} /><input value={item.version} onChange={(e) => update(index, { version: e.target.value })} /></div><input className="asset-url" value={item.url} onChange={(e) => update(index, { url: e.target.value })} placeholder="download url" /></div></div><div className="asset-controls-v2"><Toggle label="필수" checked={item.required} onChange={() => update(index, { required: !item.required })} /><button type="button" className="icon-danger" onClick={() => onChange(items.filter((_, i) => i !== index))}><Trash2 size={17} /></button></div></article>)}</div>;
}

function ProfileSettings({ profile, onChange }: { profile: LauncherProfile; onChange: (profile: LauncherProfile) => void }) {
  const update = (patch: Partial<LauncherProfile>) => onChange({ ...profile, ...patch });
  const updateServer = (patch: Partial<LauncherProfile["defaultServer"]>) => update({ defaultServer: { ...profile.defaultServer, ...patch } });
  const updateLaunch = (patch: Partial<LauncherProfile["launchOptions"]>) => update({ launchOptions: { ...profile.launchOptions, ...patch } });
  return <section className="settings-column" id="profile-settings-section"><div className="notion-card profile-preview-card" style={{ "--accent": profile.accentColor } as React.CSSProperties}><div className="preview-glow" /><p className="eyebrow">Profile Preview</p><h2>{profile.customText}</h2><p>{profile.name} · MC {profile.minecraftVersion} · Java {profile.javaVersion}</p></div><div className="notion-card"><div className="card-head-v2"><h3><Settings2 size={18} />프로필 설정</h3><small>런처 화면과 실행 기준</small></div><div className="form-stack"><Field label="ID"><input value={profile.id} onChange={(e) => update({ id: safeId(e.target.value) })} /></Field><Field label="이름"><input value={profile.name} onChange={(e) => update({ name: e.target.value })} /></Field><Field label="설명"><textarea value={profile.description} onChange={(e) => update({ description: e.target.value })} /></Field><Field label="커스텀 문구"><input value={profile.customText} onChange={(e) => update({ customText: e.target.value })} /></Field><div className="split-grid"><Field label="마크 버전"><input value={profile.minecraftVersion} onChange={(e) => update({ minecraftVersion: e.target.value })} /></Field><Field label="Java"><input type="number" value={profile.javaVersion} onChange={(e) => update({ javaVersion: Number(e.target.value) })} /></Field></div><div className="split-grid"><Field label="로더"><select value={profile.modLoader} onChange={(e) => update({ modLoader: e.target.value as LauncherProfile["modLoader"] })}>{MOD_LOADERS.map((loader) => <option key={loader}>{loader}</option>)}</select></Field><Field label="로더 버전"><input value={profile.modLoaderVersion} onChange={(e) => update({ modLoaderVersion: e.target.value })} /></Field></div><div className="split-grid server-grid"><Field label="서버 이름"><input value={profile.defaultServer.name} onChange={(e) => updateServer({ name: e.target.value })} /></Field><Field label="주소"><input value={profile.defaultServer.address} onChange={(e) => updateServer({ address: e.target.value })} /></Field><Field label="포트"><input type="number" value={profile.defaultServer.port} onChange={(e) => updateServer({ port: Number(e.target.value) })} /></Field></div><div className="split-grid"><Field label="최소 MB"><input type="number" value={profile.launchOptions.minMemoryMb} onChange={(e) => updateLaunch({ minMemoryMb: Number(e.target.value) })} /></Field><Field label="최대 MB"><input type="number" value={profile.launchOptions.maxMemoryMb} onChange={(e) => updateLaunch({ maxMemoryMb: Number(e.target.value) })} /></Field></div><Field label="강조색"><div className="color-input"><span>{profile.accentColor}</span><input type="color" value={profile.accentColor} onChange={(e) => update({ accentColor: e.target.value })} /></div></Field></div></div><div className="notion-card"><div className="card-head-v2"><h3><Lock size={18} />런처 수정 허용</h3><small>true = 유저 수정 가능</small></div><div className="toggle-grid">{(Object.entries(profile.editableFields) as Array<[keyof LauncherProfile["editableFields"], boolean]>).map(([key, value]) => <Toggle key={key} label={editableLabels[key]} checked={value} lock onChange={() => update({ editableFields: { ...profile.editableFields, [key]: !value } })} />)}</div></div></section>;
}

export function ConsoleApp() {
  const [sessionReady, setSessionReady] = useState(Boolean(getSession()));
  const [profiles, setProfiles] = useState<ProfilesManifest>([]);
  const [selectedId, setSelectedId] = useState("");
  const [activeTab, setActiveTab] = useState<AssetKind>("mods");
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("서버 연결 대기 중");
  const [saveStatus, setSaveStatus] = useState<{ type: "success" | "error"; message: string; sha?: string | null } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const selected = profiles.find((profile) => profile.id === selectedId) ?? profiles[0];
  const validation = useMemo(() => validateProfilesManifest(profiles), [profiles]);

  const reload = async () => { setStatus("불러오는 중..."); const result = await loadProfiles(); setProfiles(result.profiles); setSelectedId(result.profiles[0]?.id ?? ""); setDirty(false); setStatus(result.source === "github" ? `GitHub에서 불러옴 · ${shortSha(result.sha)}` : "GITHUB_TOKEN 없음: 빈 manifest로 시작"); };
  useEffect(() => { if (sessionReady) reload().catch((e) => setStatus(e instanceof Error ? e.message : "불러오기 실패")); }, [sessionReady]);
  const setProfile = (next: LauncherProfile) => { setProfiles((items) => items.map((item) => item.id === selected?.id ? next : item)); setSelectedId(next.id); setDirty(true); };
  const addProfile = () => { const profile = createEmptyProfile(); setProfiles((items) => [...items, profile]); setSelectedId(profile.id); setDirty(true); setTimeout(() => document.getElementById("profile-settings-section")?.scrollIntoView({ behavior: "smooth" }), 80); };
  const duplicate = () => { if (!selected) return; const profile = clone(selected); profile.id = `${selected.id}-copy-${Date.now().toString().slice(-4)}`; profile.name = `${selected.name} Copy`; setProfiles((items) => [...items, profile]); setSelectedId(profile.id); setDirty(true); };
  const remove = () => { if (!selected) return; setProfiles((items) => items.filter((item) => item.id !== selected.id)); setSelectedId(""); setDirty(true); };
  const exportJson = () => { void navigator.clipboard.writeText(JSON.stringify(profiles, null, 2)); setStatus("JSON 클립보드 복사 완료"); };
  const createFromPack = (project: ExternalProject) => { const profile = createEmptyProfile(); profile.id = safeId(project.slug); profile.name = project.title; profile.description = project.description; profile.customText = `${project.title} 모드팩`; profile.mods = []; setProfiles((items) => [...items, profile]); setSelectedId(profile.id); setDirty(true); };
  const addExternalAsset = (kind: ProjectKind, asset: LauncherAsset) => { if (!selected || kind === "modpack") return; const key = assetKey(kind); setProfile({ ...selected, [key]: [...selected[key], asset] } as LauncherProfile); };
  const save = async () => { if (!validation.ok) return setSaveStatus({ type: "error", message: "검증 오류" }); setIsSaving(true); setStatus("GitHub에 저장 중..."); try { const result = await saveProfiles(profiles); setDirty(false); setStatus(`저장 완료 · ${shortSha(result.sha)}`); setSaveStatus({ type: "success", message: "저장됨", sha: result.sha }); } catch (e) { const message = e instanceof Error ? e.message : "저장 실패"; setStatus(message); setSaveStatus({ type: "error", message }); } finally { setIsSaving(false); } };
  if (!sessionReady) return <LoginScreen onDone={() => setSessionReady(true)} />;
  if (!selected) return <main className="app-v2 notion-bg"><header className="topbar-v2"><div className="brand-line"><div className="brand-orb"><Settings2 /></div><div><p className="eyebrow">zzapcho Launcher</p><h1>Console</h1></div></div><button className="primary-button" onClick={addProfile}><Plus size={17} />새 프로필</button></header><div className="blank-state"><h2>프로필 없음</h2><p>새 프로필을 만들어 시작하세요.</p></div></main>;
  return <main className="app-v2 notion-bg"><header className="topbar-v2"><div className="brand-line"><div className="brand-orb"><Settings2 size={20} /></div><div className="brand-text"><p className="eyebrow">zzapcho Launcher</p><h1>Console <span>BETA</span></h1></div></div><div className="top-actions-v2">{saveStatus && <div className={`save-toast ${saveStatus.type}`}>{saveStatus.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}<span>{saveStatus.message}</span>{saveStatus.sha && <code>{shortSha(saveStatus.sha)}</code>}</div>}<button className="ghost-button hide-mobile" onClick={exportJson}><Copy size={16} />JSON</button><button className="primary-button" onClick={save} disabled={isSaving || !validation.ok}>{isSaving ? "저장 중" : <><Github size={17} />저장</>}</button><button className="mobile-menu-button" onClick={() => setMenuOpen(true)}><Menu /></button></div></header>{menuOpen && <div className="mobile-sheet-backdrop" onClick={() => setMenuOpen(false)}><div className="mobile-sheet" onClick={(e) => e.stopPropagation()}><button className="sheet-close" onClick={() => setMenuOpen(false)}><X /></button><button onClick={exportJson}><Copy size={16} />JSON 복사</button><button onClick={() => { clearSession(); setSessionReady(false); }}><LogOut size={16} />나가기</button></div></div>}<section className="profile-section-v2"><div className="section-title-row"><h2><Box size={18} />프로필</h2><span>{profiles.length}개 · {dirty ? "수정됨" : "동기화됨"}</span></div><div className="profile-rail-v2"><button className="add-profile-card" onClick={addProfile}><Plus /><span>새 프로필</span></button>{profiles.map((profile) => <ProfileCard key={profile.id} profile={profile} active={profile.id === selected.id} onClick={() => setSelectedId(profile.id)} />)}</div><div className="quick-actions-v2"><button onClick={duplicate}>복제</button><button className="danger-text" onClick={remove}>삭제</button></div></section><div className="workspace-v2"><ProfileSettings profile={selected} onChange={setProfile} /><section className="content-column"><ExternalAssetPicker profile={selected} onAddAsset={addExternalAsset} onCreatePack={createFromPack} /><div className="notion-card content-card-v2"><div className="tab-strip-v2">{tabs.map((tab) => <button key={tab.id} className={activeTab === tab.id ? "active" : ""} onClick={() => setActiveTab(tab.id)}><span>{tab.label}</span><b>{selected[tab.id].length}</b></button>)}</div><div className="content-toolbar-v2"><div className="mini-search"><Search size={17} /><input placeholder="현재 목록" readOnly /></div><button className="secondary-button"><Upload size={16} />파일 직접 추가</button></div><div className="content-body-v2"><AssetList kind={activeTab} items={selected[activeTab]} onChange={(items) => setProfile({ ...selected, [activeTab]: items })} /></div></div></section><aside className="validation-panel-v2"><div className="notion-card sticky-card"><div className="card-head-v2"><h3>{validation.ok ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}검증</h3><span className={validation.ok ? "state-ok" : "state-bad"}>{validation.ok ? "OK" : "ERROR"}</span></div>{validation.ok ? <p className="muted">저장 가능한 상태입니다.</p> : <ul className="errors-v2">{validation.errors.map((error) => <li key={error}>{error}</li>)}</ul>}<p className="status-box">{status}</p></div></aside></div></main>;
}
