import { useMemo, useState } from "react";
import { createEmptyProfile, MOD_LOADERS, type LauncherAsset, type LauncherProfile, type ProfilesManifest } from "../../shared/profileTypes";
import { validateProfilesManifest } from "../../shared/profileValidation";
import { ExternalAssetPicker } from "./ExternalAssetPicker";
import type { ExternalProject, ProjectKind } from "./externalSources";

type AssetKind = "mods" | "resourcePacks" | "shaders";
const assetNames: Record<AssetKind, string> = { mods: "모드", resourcePacks: "리소스팩", shaders: "쉐이더" };

function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function safeId(value: string) { return value.toLowerCase().trim().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, ""); }
function assetKey(kind: ProjectKind): AssetKind { return kind === "resourcepack" ? "resourcePacks" : kind === "shader" ? "shaders" : "mods"; }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function AssetEditor({ title, items, onChange }: { title: string; items: LauncherAsset[]; onChange: (items: LauncherAsset[]) => void }) {
  const update = (index: number, patch: Partial<LauncherAsset>) => onChange(items.map((item, i) => i === index ? { ...item, ...patch } : item));
  return <section className="card section-card">
    <div className="card-head"><h3>{title}</h3><button onClick={() => onChange([...items, { id: `asset-${Date.now()}`, name: "New Asset", version: "", required: true, url: "" }])}>추가</button></div>
    {items.length === 0 && <p className="muted">아직 등록된 항목 없음</p>}
    {items.map((item, index) => <div className="asset-row" key={`${item.id}-${index}`}>
      <input value={item.id} onChange={(event) => update(index, { id: event.target.value })} placeholder="id" />
      <input value={item.name} onChange={(event) => update(index, { name: event.target.value })} placeholder="name" />
      <input value={item.version} onChange={(event) => update(index, { version: event.target.value })} placeholder="version" />
      <input value={item.url} onChange={(event) => update(index, { url: event.target.value })} placeholder="url" />
      <label className="check"><input type="checkbox" checked={item.required} onChange={(event) => update(index, { required: event.target.checked })} />필수</label>
      <button className="danger" onClick={() => onChange(items.filter((_, i) => i !== index))}>삭제</button>
    </div>)}
  </section>;
}

function ProfileEditor({ profile, onChange, onCreateProfileFromPack }: { profile: LauncherProfile; onChange: (profile: LauncherProfile) => void; onCreateProfileFromPack: (project: ExternalProject) => void }) {
  const update = (patch: Partial<LauncherProfile>) => onChange({ ...profile, ...patch });
  const updateServer = (patch: Partial<LauncherProfile["defaultServer"]>) => update({ defaultServer: { ...profile.defaultServer, ...patch } });
  const updateLaunch = (patch: Partial<LauncherProfile["launchOptions"]>) => update({ launchOptions: { ...profile.launchOptions, ...patch } });
  const updateEditable = (key: keyof LauncherProfile["editableFields"], value: boolean) => update({ editableFields: { ...profile.editableFields, [key]: value } });
  const addExternalAsset = (kind: ProjectKind, asset: LauncherAsset) => {
    if (kind === "modpack") return;
    const key = assetKey(kind);
    update({ [key]: [...profile[key], asset] } as Partial<LauncherProfile>);
  };

  return <div className="editor-stack">
    <section className="hero-preview" style={{ "--accent": profile.accentColor, backgroundImage: `linear-gradient(145deg, ${profile.accentColor}70, #070a12)` } as React.CSSProperties}>
      <span>Profile Preview</span><h2>{profile.customText}</h2><p>{profile.name} · MC {profile.minecraftVersion} · Java {profile.javaVersion}</p>
    </section>

    <ExternalAssetPicker profile={profile} onAddAsset={addExternalAsset} onCreatePack={onCreateProfileFromPack} />

    <section className="card section-card"><div className="card-head"><h3>기본 정보</h3><small>런처 화면에 보이는 값</small></div><div className="grid two">
      <Field label="ID"><input value={profile.id} onChange={(event) => update({ id: safeId(event.target.value) })} /></Field>
      <Field label="이름"><input value={profile.name} onChange={(event) => update({ name: event.target.value })} /></Field>
      <Field label="설명"><input value={profile.description} onChange={(event) => update({ description: event.target.value })} /></Field>
      <Field label="커스텀 텍스트"><input value={profile.customText} onChange={(event) => update({ customText: event.target.value })} /></Field>
      <Field label="배경 이미지"><input value={profile.backgroundImage} onChange={(event) => update({ backgroundImage: event.target.value })} /></Field>
      <Field label="강조색"><input type="color" value={profile.accentColor} onChange={(event) => update({ accentColor: event.target.value })} /></Field>
    </div></section>

    <section className="card section-card"><div className="card-head"><h3>실행 정보</h3><small>런처 연결 후 실행에 사용</small></div><div className="grid four">
      <Field label="마크 버전"><input value={profile.minecraftVersion} onChange={(event) => update({ minecraftVersion: event.target.value })} /></Field>
      <Field label="자바 버전"><input value={profile.javaVersion} onChange={(event) => update({ javaVersion: event.target.value })} placeholder="17 / 21" /></Field>
      <Field label="모드로더"><select value={profile.modLoader} onChange={(event) => update({ modLoader: event.target.value as LauncherProfile["modLoader"] })}>{MOD_LOADERS.map((loader) => <option key={loader}>{loader}</option>)}</select></Field>
      <Field label="로더 버전"><input value={profile.modLoaderVersion} onChange={(event) => update({ modLoaderVersion: event.target.value })} /></Field>
    </div></section>

    <section className="card section-card"><div className="card-head"><h3>기본 서버</h3><small>프로필 기본 접속 서버</small></div><div className="grid three">
      <Field label="서버 이름"><input value={profile.defaultServer.name} onChange={(event) => updateServer({ name: event.target.value })} /></Field>
      <Field label="주소"><input value={profile.defaultServer.address} onChange={(event) => updateServer({ address: event.target.value })} /></Field>
      <Field label="포트"><input type="number" value={profile.defaultServer.port} onChange={(event) => updateServer({ port: Number(event.target.value) })} /></Field>
    </div></section>

    <section className="card section-card"><div className="card-head"><h3>JVM</h3><small>메모리와 실행 인자</small></div><div className="grid three">
      <Field label="최소 MB"><input type="number" value={profile.launchOptions.minMemoryMb} onChange={(event) => updateLaunch({ minMemoryMb: Number(event.target.value) })} /></Field>
      <Field label="최대 MB"><input type="number" value={profile.launchOptions.maxMemoryMb} onChange={(event) => updateLaunch({ maxMemoryMb: Number(event.target.value) })} /></Field>
      <Field label="javaArgs"><input value={profile.launchOptions.javaArgs.join(" ")} onChange={(event) => updateLaunch({ javaArgs: event.target.value.split(" ").filter(Boolean) })} /></Field>
    </div></section>

    {(Object.keys(assetNames) as AssetKind[]).map((kind) => <AssetEditor key={kind} title={assetNames[kind]} items={profile[kind]} onChange={(items) => update({ [kind]: items } as Partial<LauncherProfile>)} />)}

    <section className="card section-card"><div className="card-head"><h3>유저 수정 허용</h3><small>끄면 서버장 관리값으로 잠김</small></div><div className="toggles">
      {Object.entries(profile.editableFields).map(([key, value]) => <label className="toggle" key={key}><span>{key}</span><input type="checkbox" checked={value} onChange={(event) => updateEditable(key as keyof LauncherProfile["editableFields"], event.target.checked)} /></label>)}
    </div></section>
  </div>;
}

export function App() {
  const [profiles, setProfiles] = useState<ProfilesManifest>([]);
  const [selectedId, setSelectedId] = useState("");
  const [dirty, setDirty] = useState(false);
  const selected = profiles.find((profile) => profile.id === selectedId) ?? profiles[0];
  const validation = useMemo(() => validateProfilesManifest(profiles), [profiles]);

  const setProfile = (next: LauncherProfile) => { setProfiles((items) => items.map((item) => item.id === selected?.id ? next : item)); setSelectedId(next.id); setDirty(true); };
  const addProfile = () => { const profile = createEmptyProfile(); setProfiles((items) => [...items, profile]); setSelectedId(profile.id); setDirty(true); };
  const createFromPack = (project: ExternalProject) => { const profile = createEmptyProfile(); profile.id = safeId(project.slug); profile.name = project.title; profile.description = project.description; profile.customText = `${project.title} 모드팩`; profile.mods = [{ id: project.slug, name: project.title, version: "modpack", required: true, url: `modrinth://${project.slug}` }]; setProfiles((items) => [...items, profile]); setSelectedId(profile.id); setDirty(true); };
  const duplicate = () => { if (!selected) return; const profile = copy(selected); profile.id = `${selected.id}-copy-${Date.now().toString().slice(-4)}`; profile.name = `${selected.name} Copy`; setProfiles((items) => [...items, profile]); setSelectedId(profile.id); setDirty(true); };
  const remove = () => { if (!selected) return; setProfiles((items) => items.filter((item) => item.id !== selected.id)); setSelectedId(""); setDirty(true); };
  const move = (direction: -1 | 1) => { if (!selected) return; const index = profiles.findIndex((item) => item.id === selected.id); const target = index + direction; if (target < 0 || target >= profiles.length) return; const next = [...profiles]; [next[index], next[target]] = [next[target], next[index]]; setProfiles(next); setDirty(true); };
  const exportJson = () => { navigator.clipboard.writeText(JSON.stringify(profiles, null, 2)); setDirty(false); };

  return <main className="app-shell">
    <header className="topbar"><div><p className="eyebrow">zzapcho Launcher</p><h1>Console</h1></div><div className="top-actions"><span className={dirty ? "pill dirty" : "pill"}>{dirty ? "수정됨" : "로컬 편집"}</span><button onClick={exportJson}>JSON 복사</button></div></header>
    <section className="notice">아직 런처 연결은 하지 않음. 여기서 프로필 구조를 만들고, Codex 작업 끝나면 런처 manifest에 연결하면 됨.</section>
    <div className="workspace">
      <aside className="sidebar"><div className="sidebar-head"><div><p className="eyebrow">Manifest</p><h2>Profiles</h2></div><button className="round" onClick={addProfile}>+</button></div><div className="profile-list">{profiles.length ? profiles.map((profile) => <button key={profile.id} className={`profile-item ${profile.id === selected?.id ? "active" : ""}`} onClick={() => setSelectedId(profile.id)}><span style={{ background: profile.accentColor }} /><strong>{profile.name}</strong><small>{profile.minecraftVersion} · Java {profile.javaVersion}</small></button>) : <div className="empty-list">프로필 없음<br />+ 눌러서 만들기</div>}</div><div className="sidebar-actions"><button onClick={duplicate} disabled={!selected}>복제</button><button onClick={() => move(-1)} disabled={!selected}>위로</button><button onClick={() => move(1)} disabled={!selected}>아래로</button><button className="danger" onClick={remove} disabled={!selected}>삭제</button></div></aside>
      <section className="main-panel">{selected ? <ProfileEditor profile={selected} onChange={setProfile} onCreateProfileFromPack={createFromPack} /> : <div className="blank"><h2>프로필 없음</h2><p>왼쪽 + 버튼으로 새 프로필을 만들면 됨.</p></div>}</section>
      <aside className="preview-panel"><section className="card sticky"><div className="card-head"><h3>검증</h3><span className={validation.ok ? "ok" : "bad"}>{validation.ok ? "OK" : "ERROR"}</span></div>{validation.ok ? <p className="muted">문제 없음</p> : <ul className="errors">{validation.errors.map((error) => <li key={error}>{error}</li>)}</ul>}</section><section className="card json-card"><div className="card-head"><h3>JSON</h3><small>{profiles.length} profiles</small></div><pre>{JSON.stringify(profiles, null, 2)}</pre></section></aside>
    </div>
  </main>;
}
