import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Box, CheckCircle2, ChevronDown, Copy, Github, Lock, LogOut, Menu, Plus, Save, Search, Settings2, Sparkles, Trash2, Upload, X } from "lucide-react";
import { clearSession, getSession, loadProfiles, login, saveProfiles } from "./api";
import { createEmptyProfile, MOD_LOADERS, type LauncherAsset, type LauncherProfile, type ProfilesManifest } from "../../shared/profileTypes";
import { validateProfilesManifest } from "../../shared/profileValidation";
import { ExternalAssetPicker } from "./ExternalAssetPicker";
import type { ExternalProject, ProjectKind } from "./externalSources";

type AssetKind = "mods" | "resourcePacks" | "shaders";
type SaveStatus = { type: "success" | "error"; message: string; sha?: string | null } | null;

const assetTabs: Array<{ id: AssetKind; label: string; hint: string }> = [
  { id: "mods", label: "모드", hint: ".jar" },
  { id: "resourcePacks", label: "리소스팩", hint: ".zip" },
  { id: "shaders", label: "쉐이더", hint: ".zip" },
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

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function safeId(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || `profile-${Date.now()}`;
}

function assetKey(kind: ProjectKind): AssetKind {
  return kind === "resourcepack" ? "resourcePacks" : kind === "shader" ? "shaders" : "mods";
}

function shortSha(value?: string | null) {
  return value ? value.slice(0, 7) : "unknown";
}

function getJavaVersionLabel(version: number) {
  return `Java ${version}`;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="ui-field"><span>{label}</span>{hint && <small>{hint}</small>}{children}</label>;
}

function ToggleSwitch({ label, checked, onChange, lockedIcon }: { label: string; checked: boolean; onChange: () => void; lockedIcon?: boolean }) {
  return <button type="button" className="toggle-switch" onClick={onChange} aria-pressed={checked}>
    <span className="toggle-label">{lockedIcon && <Lock size={13} />}{label}</span>
    <span className={`switch-track${checked ? " checked" : ""}`}><span /></span>
  </button>;
}

function LoginScreen({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("admin");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
      <div className="brand-orb"><Settings2 size={24} /></div>
      <p className="eyebrow">zzapcho Launcher</p>
      <h1>Console</h1>
      <p className="muted">server/.env의 관리자 계정으로 로그인해서 프로필과 파일 정책을 관리합니다.</p>
      <Field label="아이디"><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></Field>
      <Field label="비밀번호"><input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="ADMIN_PASSWORD" autoComplete="current-password" /></Field>
      <button className="primary-button full" disabled={busy}>{busy ? "확인 중..." : "로그인"}</button>
      {error && <p className="inline-error"><AlertCircle size={15} />{error}</p>}
    </form>
  </main>;
}

function ProfileCard({ profile, active, onClick }: { profile: LauncherProfile; active: boolean; onClick: () => void }) {
  const totalAssets = profile.mods.length + profile.resourcePacks.length + profile.shaders.length;
  return <button type="button" className={`profile-card-v2${active ? " active" : ""}`} onClick={onClick} style={{ "--accent": profile.accentColor } as React.CSSProperties}>
    <span className="profile-dot" />
    <strong>{profile.name}</strong>
    <p>{profile.description || profile.customText}</p>
    <span className="profile-meta"><b>MC {profile.minecraftVersion}</b><b>{profile.modLoader}</b><b>{totalAssets} files</b></span>
    {active && <span className="editing-badge">편집 중</span>}
  </button>;
}

function AssetSourceBadge({ asset }: { asset: LauncherAsset }) {
  const raw = asset.url.startsWith("curseforge://") ? "curseforge" : asset.url.startsWith("http") ? "remote" : asset.url.startsWith("/uploads") ? "upload" : "manual";
  const label = raw === "curseforge" ? "CURSEFORGE" : raw === "remote" ? "REMOTE" : raw === "upload" ? "UPLOAD" : "MANUAL";
  return <span className={`source-badge ${raw}`}>{label}</span>;
}

function AssetEditor({ kind, items, onChange }: { kind: AssetKind; items: LauncherAsset[]; onChange: (items: LauncherAsset[]) => void }) {
  const update = (index: number, patch: Partial<LauncherAsset>) => onChange(items.map((item, i) => i === index ? { ...item, ...patch } : item));
  const remove = (index: number) => onChange(items.filter((_, i) => i !== index));

  if (!items.length) {
    return <div className="empty-drop-card">
      <Upload size={34} />
      <strong>아직 등록된 파일이 없습니다</strong>
      <p>{kind === "mods" ? ".jar" : ".zip"} 파일을 직접 추가하거나 위 검색에서 가져오면 됩니다.</p>
    </div>;
  }

  return <div className="asset-list-v2">
    {items.map((item, index) => <article className="asset-row-v2" key={`${item.id}-${index}`}>
      <div className="asset-main-v2">
        <div className="asset-icon"><Box size={20} /></div>
        <div className="asset-text">
          <div className="asset-title-line"><input value={item.name} onChange={(event) => update(index, { name: event.target.value })} aria-label="asset name" /><AssetSourceBadge asset={item} /></div>
          <div className="asset-subgrid">
            <input value={item.id} onChange={(event) => update(index, { id: safeId(event.target.value) })} placeholder="id" aria-label="asset id" />
            <input value={item.version} onChange={(event) => update(index, { version: event.target.value })} placeholder="version" aria-label="asset version" />
          </div>
          <input className="asset-url" value={item.url} onChange={(event) => update(index, { url: event.target.value })} placeholder="download url" aria-label="asset url" />
        </div>
      </div>
      <div className="asset-controls-v2">
        <ToggleSwitch label="필수" checked={item.required} onChange={() => update(index, { required: !item.required })} />
        <button type="button" className="icon-danger" onClick={() => remove(index)} title="삭제"><Trash2 size={17} /></button>
      </div>
    </article>)}
  </div>;
}

function ProfileSettings({ profile, onChange }: { profile: LauncherProfile; onChange: (profile: LauncherProfile) => void }) {
  const update = (patch: Partial<LauncherProfile>) => onChange({ ...profile, ...patch });
  const updateServer = (patch: Partial<LauncherProfile["defaultServer"]>) => update({ defaultServer: { ...profile.defaultServer, ...patch } });
  const updateLaunch = (patch: Partial<LauncherProfile["launchOptions"]>) => update({ launchOptions: { ...profile.launchOptions, ...patch } });
  const updateEditable = (key: keyof LauncherProfile["editableFields"], value: boolean) => update({ editableFields: { ...profile.editableFields, [key]: value } });

  return <section className="settings-column" id="profile-settings-section">
    <div className="notion-card profile-preview-card" style={{ "--accent": profile.accentColor } as React.CSSProperties}>
      <div className="preview-glow" />
      <p className="eyebrow">Profile Preview</p>
      <h2>{profile.customText}</h2>
      <p>{profile.name} · MC {profile.minecraftVersion} · {getJavaVersionLabel(profile.javaVersion)}</p>
    </div>

    <div className="notion-card">
      <div className="card-head-v2"><h3><Settings2 size={18} />프로필 설정</h3><small>런처 화면과 실행 기준</small></div>
      <div className="form-stack">
        <Field label="프로필 ID" hint="영문/숫자/하이픈"><input value={profile.id} onChange={(event) => update({ id: safeId(event.target.value) })} /></Field>
        <Field label="프로필 이름"><input value={profile.name} onChange={(event) => update({ name: event.target.value })} /></Field>
        <Field label="설명"><textarea value={profile.description} onChange={(event) => update({ description: event.target.value })} /></Field>
        <Field label="커스텀 문구"><input value={profile.customText} onChange={(event) => update({ customText: event.target.value })} /></Field>
        <Field label="배경 이미지"><input value={profile.backgroundImage} onChange={(event) => update({ backgroundImage: event.target.value })} /></Field>
        <div className="split-grid">
          <Field label="마크 버전"><input value={profile.minecraftVersion} onChange={(event) => update({ minecraftVersion: event.target.value })} /></Field>
          <Field label="Java"><input type="number" min={8} value={profile.javaVersion} onChange={(event) => update({ javaVersion: Number(event.target.value) })} /></Field>
        </div>
        <div className="split-grid">
          <Field label="로더"><select value={profile.modLoader} onChange={(event) => update({ modLoader: event.target.value as LauncherProfile["modLoader"] })}>{MOD_LOADERS.map((loader) => <option key={loader}>{loader}</option>)}</select></Field>
          <Field label="로더 버전"><input value={profile.modLoaderVersion} onChange={(event) => update({ modLoaderVersion: event.target.value })} /></Field>
        </div>
        <div className="split-grid server-grid">
          <Field label="대표 서버 이름"><input value={profile.defaultServer.name} onChange={(event) => updateServer({ name: event.target.value })} placeholder="선택 사항" /></Field>
          <Field label="주소"><input value={profile.defaultServer.address} onChange={(event) => updateServer({ address: event.target.value })} placeholder="mc.example.com" /></Field>
          <Field label="포트"><input type="number" min={1} max={65535} value={profile.defaultServer.port} onChange={(event) => updateServer({ port: Number(event.target.value) })} /></Field>
        </div>
        <div className="split-grid">
          <Field label="최소 메모리 MB"><input type="number" min={512} value={profile.launchOptions.minMemoryMb} onChange={(event) => updateLaunch({ minMemoryMb: Number(event.target.value) })} /></Field>
          <Field label="최대 메모리 MB"><input type="number" min={512} value={profile.launchOptions.maxMemoryMb} onChange={(event) => updateLaunch({ maxMemoryMb: Number(event.target.value) })} /></Field>
        </div>
        <Field label="Java Args"><input value={profile.launchOptions.javaArgs.join(" ")} onChange={(event) => updateLaunch({ javaArgs: event.target.value.split(" ").filter(Boolean) })} /></Field>
        <Field label="강조색"><div className="color-input"><span>{profile.accentColor}</span><input type="color" value={profile.accentColor} onChange={(event) => update({ accentColor: event.target.value })} /></div></Field>
      </div>
    </div>

    <div className="notion-card">
      <div className="card-head-v2"><h3><Lock size={18} />런처 수정 허용</h3><small>true = 유저가 런처에서 수정 가능</small></div>
      <div className="toggle-grid">
        {(Object.entries(profile.editableFields) as Array<[keyof LauncherProfile["editableFields"], boolean]>).map(([key, value]) => <ToggleSwitch key={key} label={editableLabels[key] ?? key} checked={value} onChange={() => updateEditable(key, !value)} lockedIcon />)}
      </div>
    </div>
  </section>;
}

function ContentPanel({ profile, activeTab, onTabChange, onChange, onCreateProfileFromPack }: { profile: LauncherProfile; activeTab: AssetKind; onTabChange: (tab: AssetKind) => void; onChange: (profile: LauncherProfile) => void; onCreateProfileFromPack: (project: ExternalProject) => void }) {
  const update = (patch: Partial<LauncherProfile>) => onChange({ ...profile, ...patch });
  const addExternalAsset = (kind: ProjectKind, asset: LauncherAsset) => {
    if (kind === "modpack") return;
    const key = assetKey(kind);
    update({ [key]: [...profile[key], asset] } as Partial<LauncherProfile>);
  };

  return <section className="content-column">
    <ExternalAssetPicker profile={profile} onAddAsset={addExternalAsset} onCreatePack={onCreateProfileFromPack} />

    <div className="notion-card content-card-v2">
      <div className="tab-strip-v2">
        {assetTabs.map((tab) => <button key={tab.id} type="button" className={activeTab === tab.id ? "active" : ""} onClick={() => onTabChange(tab.id)}>
          <span>{tab.label}</span><small>{tab.hint}</small><b>{profile[tab.id].length}</b>
        </button>)}
      </div>
      <div className="content-toolbar-v2">
        <div className="mini-search"><Search size={17} /><input placeholder="현재 목록 안에서 빠르게 확인" readOnly /></div>
        <button type="button" className="secondary-button"><Upload size={16} />파일 직접 추가</button>
      </div>
      <div className="content-body-v2">
        <AssetEditor kind={activeTab} items={profile[activeTab]} onChange={(items) => update({ [activeTab]: items } as Partial<LauncherProfile>)} />
      </div>
    </div>
  </section>;
}

function ValidationPanel({ validation, status }: { validation: ReturnType<typeof validateProfilesManifest>; status: string }) {
  return <aside className="validation-panel-v2">
    <div className="notion-card sticky-card">
      <div className="card-head-v2"><h3>{validation.ok ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}검증</h3><span className={validation.ok ? "state-ok" : "state-bad"}>{validation.ok ? "OK" : "ERROR"}</span></div>
      {validation.ok ? <p className="muted">저장 가능한 상태입니다.</p> : <ul className="errors-v2">{validation.errors.map((error) => <li key={error}>{error}</li>)}</ul>}
      <p className="status-box">{status}</p>
    </div>
  </aside>;
}

export function App() {
  const [sessionReady, setSessionReady] = useState(Boolean(getSession()));
  const [profiles, setProfiles] = useState<ProfilesManifest>([]);
  const [selectedId, setSelectedId] = useState("");
  const [activeContentTab, setActiveContentTab] = useState<AssetKind>("mods");
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("서버 연결 대기 중");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const selected = profiles.find((profile) => profile.id === selectedId) ?? profiles[0];
  const validation = useMemo(() => validateProfilesManifest(profiles), [profiles]);

  const reload = async () => {
    setStatus("런처 manifest 불러오는 중...");
    const result = await loadProfiles();
    setProfiles(result.profiles);
    setSelectedId(result.profiles[0]?.id ?? "");
    setDirty(false);
    setSaveStatus(null);
    setStatus(result.source === "github" ? `GitHub에서 불러옴 · ${shortSha(result.sha)}` : "GITHUB_TOKEN 없음: 빈 manifest로 시작");
  };

  useEffect(() => {
    if (!sessionReady) return;
    reload().catch((error) => setStatus(error instanceof Error ? error.message : "불러오기 실패"));
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
    window.setTimeout(() => document.getElementById("profile-settings-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };

  const duplicate = () => {
    if (!selected) return;
    const profile = copy(selected);
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

  const createFromPack = (project: ExternalProject) => {
    const profile = createEmptyProfile();
    profile.id = safeId(project.slug);
    profile.name = project.title;
    profile.description = project.description;
    profile.customText = `${project.title} 모드팩`;
    profile.mods = [];
    setProfiles((items) => [...items, profile]);
    setSelectedId(profile.id);
    setDirty(true);
  };

  const save = async () => {
    if (!validation.ok) {
      setStatus("검증 오류 때문에 저장 불가");
      setSaveStatus({ type: "error", message: "검증 오류" });
      return;
    }
    setIsSaving(true);
    setStatus("GitHub에 저장 중...");
    setSaveStatus(null);
    try {
      const result = await saveProfiles(profiles);
      setDirty(false);
      setStatus(`런처 profiles.json 저장 완료 · ${shortSha(result.sha)}`);
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

  if (!selected) {
    return <main className="app-v2 notion-bg"><header className="topbar-v2"><div className="brand-line"><div className="brand-orb"><Settings2 size={20} /></div><div><p className="eyebrow">zzapcho Launcher</p><h1>Console</h1></div></div><button className="primary-button" onClick={addProfile}><Plus size={17} />새 프로필</button></header><div className="blank-state"><h2>프로필 없음</h2><p>새 프로필을 만들어 시작하세요.</p></div></main>;
  }

  return <main className="app-v2 notion-bg">
    <header className="topbar-v2">
      <div className="brand-line">
        <div className="brand-orb"><Settings2 size={20} /></div>
        <div className="brand-text"><p className="eyebrow">zzapcho Launcher</p><h1>Console <span>BETA</span></h1></div>
      </div>
      <div className="top-actions-v2">
        {saveStatus && <div className={`save-toast ${saveStatus.type}`}>
          {saveStatus.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{saveStatus.message}</span>{saveStatus.sha && <code>{shortSha(saveStatus.sha)}</code>}
        </div>}
        <button className="ghost-button hide-mobile" onClick={exportJson}><Copy size={16} />JSON</button>
        <button className="ghost-button hide-mobile" onClick={() => reload().catch((error) => setStatus(error instanceof Error ? error.message : "새로고침 실패"))}><ChevronDown size={16} />새로고침</button>
        <button className="primary-button" onClick={save} disabled={isSaving || !validation.ok}>{isSaving ? <span className="spinner" /> : <Github size={17} />}{isSaving ? "저장 중" : "저장"}</button>
        <button className="mobile-menu-button" onClick={() => setMobileMenuOpen(true)}><Menu size={20} /></button>
      </div>
    </header>

    {mobileMenuOpen && <div className="mobile-sheet-backdrop" onClick={() => setMobileMenuOpen(false)}><div className="mobile-sheet" onClick={(event) => event.stopPropagation()}><button className="sheet-close" onClick={() => setMobileMenuOpen(false)}><X size={18} /></button><button onClick={exportJson}><Copy size={16} />JSON 복사</button><button onClick={() => reload().catch((error) => setStatus(error instanceof Error ? error.message : "새로고침 실패"))}><ChevronDown size={16} />새로고침</button><button onClick={() => { clearSession(); setSessionReady(false); }}><LogOut size={16} />나가기</button></div></div>}

    <section className="profile-section-v2">
      <div className="section-title-row"><h2><Box size={18} />프로필</h2><span>{profiles.length}개 · {dirty ? "수정됨" : "동기화됨"}</span></div>
      <div className="profile-rail-v2">
        <button className="add-profile-card" onClick={addProfile}><Plus size={22} /><span>새 프로필</span></button>
        {profiles.map((profile) => <ProfileCard key={profile.id} profile={profile} active={profile.id === selected.id} onClick={() => setSelectedId(profile.id)} />)}
      </div>
      <div className="quick-actions-v2"><button onClick={duplicate}>복제</button><button className="danger-text" onClick={remove}>삭제</button></div>
    </section>

    <div className="workspace-v2">
      <ProfileSettings profile={selected} onChange={setProfile} />
      <ContentPanel profile={selected} activeTab={activeContentTab} onTabChange={setActiveContentTab} onChange={setProfile} onCreateProfileFromPack={createFromPack} />
      <ValidationPanel validation={validation} status={status} />
    </div>
  </main>;
}
