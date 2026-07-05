export interface LauncherMeta {
  minecraft: {
    latestRelease: string;
    latestSnapshot: string;
    releases: string[];
    snapshots: string[];
  };
  loaders: {
    fabric: string[];
    quilt: string[];
    forge: string[];
  };
}

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`metadata request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export async function getLauncherMeta(minecraftVersion?: string): Promise<LauncherMeta> {
  const manifest = await readJson<{
    latest: { release: string; snapshot: string };
    versions: Array<{ id: string; type: "release" | "snapshot" }>;
  }>("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json");

  const version = minecraftVersion || manifest.latest.release;
  const releases = manifest.versions.filter((item) => item.type === "release").map((item) => item.id).slice(0, 40);
  const snapshots = manifest.versions.filter((item) => item.type === "snapshot").map((item) => item.id).slice(0, 20);

  const [fabric, quilt, forge] = await Promise.allSettled([
    readJson<Array<{ loader: { version: string } }>>(`https://meta.fabricmc.net/v2/versions/loader/${version}`),
    readJson<Array<{ loader: { version: string } }>>(`https://meta.quiltmc.org/v3/versions/loader/${version}`),
    readJson<{ promos?: Record<string, string> }>("https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json"),
  ]);

  const fabricVersions = fabric.status === "fulfilled" ? fabric.value.map((item) => item.loader.version).slice(0, 20) : [];
  const quiltVersions = quilt.status === "fulfilled" ? quilt.value.map((item) => item.loader.version).slice(0, 20) : [];
  const forgePromos = forge.status === "fulfilled" ? forge.value.promos ?? {} : {};
  const forgeVersions = Object.entries(forgePromos)
    .filter(([key]) => key.startsWith(`${version}-`))
    .map(([, value]) => value)
    .filter((value, index, list) => list.indexOf(value) === index)
    .slice(0, 10);

  return {
    minecraft: {
      latestRelease: manifest.latest.release,
      latestSnapshot: manifest.latest.snapshot,
      releases,
      snapshots,
    },
    loaders: {
      fabric: fabricVersions,
      quilt: quiltVersions,
      forge: forgeVersions,
    },
  };
}
