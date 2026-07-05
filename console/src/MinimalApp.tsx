import { useEffect, useMemo, useState } from "react";
import { clearSession, getSession, loadLauncherMeta, loadProfiles, login, saveProfiles, type LauncherMeta } from "./api";
import { createEmptyProfile, MOD_LOADERS, type LauncherProfile, type ProfilesManifest } from "../../shared/profileTypes";
import { validateProfilesManifest } from "../../shared/profileValidation";

function safeId(value: string) { return value.toLowerCase().trim().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, ""); }
function guessJavaVersion(version: string) { const minor = Number(version.split(".")[1] ?? 0); return minor >= 20 ? 21 : minor >= 18 ? 17 : 8; }
function latestLoader(meta: LauncherMeta | null, loader: LauncherProfile["modLoader"]) { return loader === "vanilla" ? "" : meta?.loaders[loader]?.[0] ?? ""; }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function Login({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("admin");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try { await login(username, secret); onDone(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "로그인 실패"); }
  };
  return <main className="login-page"><form className="login-card" onSubmit={submit}><span className="mark">z</span><h1>Console</h1><Field label="ID"><input value={username} onChange={(event) => setUsername(event.target.value)} /></Field><Field label="Password"><input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} /></Field><button>로그인</button>{error && <p className="error">{error}</p>}</form></main>;
}

function Editor({ profile, meta, onChange }: { profile: LauncherProfile; meta: LauncherMeta | null; onChange: (profile: LauncherProfile) => void }) {
  const update = (patch: Partial<LauncherProfile>) => onChange({ ...profile, ...patch });
  const updateServer = (patch: Partial<LauncherProfile["defaultServer"]>) => update({ defaultServer: { ...profile.defaultServer, ...patch } });
  const applyLatest = () => {
    const minecraftVersion = meta?.minecraft.latestRelease ?? profile.minecraftVersion;
    update({ minecraftVersion, javaVersion: guessJavaVersion(minecraftVersion), modLoaderVersion: latestLoader(meta, profile.modLoader) || profile.modLoaderVersion });
  };
  return <section className="main-panel minimal-editor">
    <div className="hero-preview" style={{ "--accent": profile.accentColor, backgroundImage: `linear-gradient(145deg, ${profile.accentColor}55, #090b10)` } as React.CSSProperties}><span>Profile</span><h2>{profile.name}</h2><p>{profile.minecraftVersion} · {profile.modLoader}</p></div>
    <section className="card section-card"><div className="card-head"><h3>기본</h3><button onClick={applyLatest} disabled={!meta}>최신 적용</button></div><div className="grid two"><Field label="이름"><input value={profile.name} onChange={(event) => update({ name: event.target.value })} /></Field><Field label="ID"><input value={profile.id} onChange={(event) => update({ id: safeId(event.target.value) })} /></Field><Field label="문구"><input value={profile.customText} onChange={(event) => update({ customText: event.target.value })} /></Field><Field label="색"><input type="color" value={profile.accentColor} onChange={(event) => update({ accentColor: event.target.value })} /></Field></div></section>
    <section className="card section-card"><div className="card-head"><h3>실행</h3><small>Latest {meta?.minecraft.latestRelease ?? "..."}</small></div><div className="grid four"><Field label="Minecraft"><input list="mc-versions" value={profile.minecraftVersion} onChange={(event) => update({ minecraftVersion: event.target.value, javaVersion: guessJavaVersion(event.target.value) })} /></Field><Field label="Java"><input type="number" value={profile.javaVersion} onChange={(event) => update({ javaVersion: Number(event.target.value) })} /></Field><Field label="Loader"><select value={profile.modLoader} onChange={(event) => update({ modLoader: event.target.value as LauncherProfile["modLoader"], modLoaderVersion: latestLoader(meta, event.target.value as LauncherProfile["modLoader"]) })}>{MOD_LOADERS.map((loader) => <option key={loader}>{loader}</option>)}</select></Field><Field label="Loader ver"><input list="loader-versions" value={profile.modLoaderVersion} onChange={(event) => update({ modLoaderVersion: event.target.value })} /></Field></div><datalist id="mc-versions">{meta?.minecraft.releases.map((version) => <option key={version} value={version} />)}</datalist><datalist id="loader-versions">{profile.modLoader !== "vanilla" && meta?.loaders[profile.modLoader].map((version) => <option key={version} value={version} />)}</datalist></section>
    <section className="card section-card"><div className="card-head"><h3>서버</h3></div><div className="grid three"><Field label="주소"><input value={profile.defaultServer.address} onChange={(event) => updateServer({ address: event.target.value })} /></Field><Field label="포트"><input type="number" value={profile.defaultServer.port} onChange={(event) => updateServer({ port: Number(event.target.value) })} /></Field><Field label="메모리 MB"><input type="number" value={profile.launchOptions.maxMemoryMb} onChange={(event) => update({ launchOptions: { ...profile.launchOptions, maxMemoryMb: Number(event.target.value) } })} /></Field></div></section>
  </section>;
}

export function MinimalApp() {
  const [ready, setReady] = useState(Boolean(getSession()));
  const [profiles, setProfiles] = useState<ProfilesManifest>([]);
  const [selectedId, setSelectedId] = useState("");
  const [meta, setMeta] = useState<LauncherMeta | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("대기");
  const selected = profiles.find((profile) => profile.id === selectedId) ?? profiles[0];
  const validation = useMemo(() => validateProfilesManifest(profiles), [profiles]);
  const reload = async () => { const result = await loadProfiles(); setProfiles(result.profiles); setSelectedId(result.profiles[0]?.id ?? ""); setDirty(false); setStatus("동기화됨"); };
  useEffect(() => { if (ready) reload().catch((error) => setStatus(error instanceof Error ? error.message : "불러오기 실패")); }, [ready]);
  useEffect(() => { if (ready) loadLauncherMeta(selected?.minecraftVersion).then(setMeta).catch(() => setMeta(null)); }, [ready, selected?.minecraftVersion]);
  const setProfile = (next: LauncherProfile) => { setProfiles((items) => items.map((item) => item.id === selected?.id ? next : item)); setSelectedId(next.id); setDirty(true); };
  const addProfile = () => { const profile = createEmptyProfile(); setProfiles((items) => [...items, profile]); setSelectedId(profile.id); setDirty(true); };
  const save = async () => { if (!validation.ok) return; await saveProfiles(profiles); setDirty(false); setStatus("저장됨"); };
  if (!ready) return <Login onDone={() => setReady(true)} />;
  return <main className="app-shell notion-shell"><header className="topbar"><div><p className="eyebrow">zzapcho Launcher</p><h1>Profiles</h1></div><div className="top-actions"><span className={dirty ? "pill dirty" : "pill"}>{dirty ? "수정됨" : "동기화됨"}</span><button onClick={() => void reload()}>새로고침</button><button disabled={!validation.ok} onClick={() => void save()}>저장</button><button onClick={() => { clearSession(); setReady(false); }}>나가기</button></div></header><div className="workspace"><aside className="sidebar"><div className="sidebar-head"><h2>Profiles</h2><button className="round" onClick={addProfile}>+</button></div><div className="profile-list">{profiles.map((profile) => <button key={profile.id} className={`profile-item ${profile.id === selected?.id ? "active" : ""}`} onClick={() => setSelectedId(profile.id)}><span style={{ background: profile.accentColor }} /><strong>{profile.name}</strong><small>{profile.minecraftVersion} · {profile.modLoader}</small></button>)}</div></aside>{selected ? <Editor profile={selected} meta={meta} onChange={setProfile} /> : <div className="blank">프로필 없음</div>}<aside className="preview-panel"><section className="card sticky"><div className="card-head"><h3>상태</h3><span className={validation.ok ? "ok" : "bad"}>{validation.ok ? "OK" : "ERR"}</span></div><p className="status">{status}</p>{!validation.ok && <ul className="errors">{validation.errors.map((error) => <li key={error}>{error}</li>)}</ul>}</section><section className="card sticky"><h3>추천</h3><p className="muted">MC {meta?.minecraft.latestRelease ?? "..."}</p><p className="muted">Java {selected ? guessJavaVersion(selected.minecraftVersion) : 21}</p><p className="muted">Loader {selected ? latestLoader(meta, selected.modLoader) || selected.modLoader : "..."}</p></section></aside></div></main>;
}
