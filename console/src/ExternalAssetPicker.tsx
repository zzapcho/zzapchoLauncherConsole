import { useState } from "react";
import type { LauncherAsset, LauncherProfile } from "../../shared/profileTypes";
import { getModrinthAsset, searchCurseForgeProjects, searchModrinthProjects, type ExternalProject, type ProjectKind, type SourceKind } from "./externalSources";

const projectKinds: { value: ProjectKind; label: string }[] = [
  { value: "mod", label: "모드" },
  { value: "resourcepack", label: "리소스팩" },
  { value: "shader", label: "쉐이더" },
  { value: "modpack", label: "모드팩" },
];

export function ExternalAssetPicker({ profile, onAddAsset, onCreatePack }: {
  profile: LauncherProfile;
  onAddAsset: (kind: ProjectKind, asset: LauncherAsset) => void;
  onCreatePack: (project: ExternalProject) => void;
}) {
  const [source, setSource] = useState<SourceKind>("modrinth");
  const [kind, setKind] = useState<ProjectKind>("mod");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ExternalProject[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Modrinth는 바로 검색 가능. CurseForge는 server/.env 키가 있으면 가능.");

  const search = async () => {
    setBusy(true);
    setMessage("검색 중...");
    try {
      const items = source === "modrinth" ? await searchModrinthProjects(kind, query) : await searchCurseForgeProjects(kind, query);
      setResults(items);
      setMessage(`${items.length}개 찾음`);
    } catch (error) {
      setResults([]);
      setMessage(error instanceof Error ? error.message : "검색 실패");
    } finally {
      setBusy(false);
    }
  };

  const add = async (project: ExternalProject) => {
    setBusy(true);
    setMessage("파일 정보 확인 중...");
    try {
      if (project.projectType === "modpack") {
        onCreatePack(project);
        setMessage("모드팩 기반 프로필 초안 생성됨");
        return;
      }
      if (project.source !== "modrinth") {
        onAddAsset(project.projectType, { id: project.slug, name: project.title, version: "curseforge", required: true, url: `curseforge://${project.projectId}` });
        setMessage(`${project.title} 추가됨. 실제 파일 URL은 서버 연결 후 확정.`);
        return;
      }
      const asset = await getModrinthAsset(project, profile);
      onAddAsset(project.projectType, asset);
      setMessage(`${project.title} 추가됨`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "추가 실패");
    } finally {
      setBusy(false);
    }
  };

  const drop = async (event: React.DragEvent) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    if (!files.length) return;
    for (const file of files) {
      const name = file.name;
      const lower = name.toLowerCase();
      const targetKind: ProjectKind = lower.endsWith(".jar") ? "mod" : lower.includes("shader") ? "shader" : "resourcepack";
      onAddAsset(targetKind, { id: name.replace(/\.[^.]+$/, ""), name, version: "local", required: true, url: `local://${name}` });
    }
    setMessage(`${files.length}개 로컬 파일 추가됨`);
  };

  return <section className="card section-card source-panel" onDragOver={(event) => event.preventDefault()} onDrop={drop}>
    <div className="card-head"><div><h3>빠른 추가</h3><small>Modrinth / CurseForge / 드래그앤드롭</small></div></div>
    <div className="source-toolbar">
      <select value={source} onChange={(event) => setSource(event.target.value as SourceKind)}><option value="modrinth">Modrinth</option><option value="curseforge">CurseForge</option></select>
      <select value={kind} onChange={(event) => setKind(event.target.value as ProjectKind)}>{projectKinds.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="sodium, iris, complementary..." />
      <button onClick={search} disabled={busy || !query.trim()}>검색</button>
    </div>
    <div className="drop-hint">파일을 여기에 끌어놓으면 .jar는 모드, shader 이름 포함 파일은 쉐이더, 나머지는 리소스팩으로 임시 추가됨</div>
    <p className="muted small">{message}</p>
    <div className="source-results">
      {results.map((project) => <article key={`${project.source}-${project.projectId}`} className="source-card">
        {project.iconUrl ? <img src={project.iconUrl} alt="" /> : <span className="project-icon" />}
        <div><strong>{project.title}</strong><small>{project.projectType} · {project.author ?? project.source}</small><p>{project.description}</p></div>
        <button onClick={() => void add(project)} disabled={busy}>{project.projectType === "modpack" ? "프로필로" : "추가"}</button>
      </article>)}
    </div>
  </section>;
}
