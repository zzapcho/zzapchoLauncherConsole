export type ModLoader = "fabric" | "forge" | "quilt" | "vanilla";

export interface LauncherAsset {
  id: string;
  name: string;
  version: string;
  required: boolean;
  url: string;
  sha256?: string;
}

export interface DefaultServer {
  name: string;
  address: string;
  port: number;
}

export interface EditableFields {
  server: boolean;
  mods: boolean;
  resourcePacks: boolean;
  shaders: boolean;
  minecraftVersion: boolean;
  modLoader: boolean;
  javaArgs: boolean;
  memory: boolean;
}

export interface LaunchOptions {
  minMemoryMb: number;
  maxMemoryMb: number;
  javaArgs: string[];
}

export interface LauncherProfile {
  id: string;
  name: string;
  description: string;
  customText: string;
  backgroundImage: string;
  accentColor: string;
  minecraftVersion: string;
  javaVersion: number;
  modLoader: ModLoader;
  modLoaderVersion: string;
  defaultServer: DefaultServer;
  mods: LauncherAsset[];
  resourcePacks: LauncherAsset[];
  shaders: LauncherAsset[];
  editableFields: EditableFields;
  launchOptions: LaunchOptions;
}

export type ProfilesManifest = LauncherProfile[];

export const MOD_LOADERS: ModLoader[] = ["vanilla", "fabric", "forge", "quilt"];

export const DEFAULT_EDITABLE_FIELDS: EditableFields = {
  server: false,
  mods: false,
  resourcePacks: true,
  shaders: true,
  minecraftVersion: false,
  modLoader: false,
  javaArgs: true,
  memory: true,
};

export function guessJavaVersion(minecraftVersion: string) {
  const [majorRaw, minorRaw] = minecraftVersion.split(".");
  const major = Number(majorRaw);
  const minor = Number(minorRaw);
  if (major > 1 || minor >= 20) return 21;
  if (minor >= 18) return 17;
  return 8;
}

export function createEmptyProfile(seed = Date.now()): LauncherProfile {
  return {
    id: `profile-${seed}`,
    name: "New Profile",
    description: "새 프로필 설명",
    customText: "새로운 모험을 시작하세요.",
    backgroundImage: "/backgrounds/default.svg",
    accentColor: "#8fe388",
    minecraftVersion: "1.21.1",
    javaVersion: 21,
    modLoader: "fabric",
    modLoaderVersion: "0.16.9",
    defaultServer: {
      name: "zzapcho Server",
      address: "mc.zzapcho.kr",
      port: 25565,
    },
    mods: [],
    resourcePacks: [],
    shaders: [],
    editableFields: { ...DEFAULT_EDITABLE_FIELDS },
    launchOptions: {
      minMemoryMb: 2048,
      maxMemoryMb: 4096,
      javaArgs: [],
    },
  };
}
