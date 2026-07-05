import { MOD_LOADERS, type LauncherAsset, type ProfilesManifest } from "./profileTypes";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isValidAssetArray(value: unknown, path: string, errors: string[]): value is LauncherAsset[] {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return false;
  }

  value.forEach((asset, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(asset)) {
      errors.push(`${itemPath} must be an object.`);
      return;
    }
    if (!isNonEmptyString(asset.id)) errors.push(`${itemPath}.id is required.`);
    if (!isNonEmptyString(asset.name)) errors.push(`${itemPath}.name is required.`);
    if (!isString(asset.version)) errors.push(`${itemPath}.version must be a string.`);
    if (!isBoolean(asset.required)) errors.push(`${itemPath}.required must be boolean.`);
    if (!isString(asset.url)) errors.push(`${itemPath}.url must be a string.`);
    if (asset.sha256 !== undefined && !isString(asset.sha256)) errors.push(`${itemPath}.sha256 must be a string.`);
  });

  return true;
}

function validateEditableFields(value: unknown, path: string, errors: string[]) {
  const keys = ["server", "mods", "resourcePacks", "shaders", "minecraftVersion", "modLoader", "javaArgs", "memory"] as const;
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  keys.forEach((key) => {
    if (!isBoolean(value[key])) errors.push(`${path}.${key} must be boolean.`);
  });
}

export function validateProfilesManifest(value: unknown): ValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(value)) {
    return { ok: false, errors: ["manifest must be an array."] };
  }

  const ids = new Set<string>();

  value.forEach((profile, index) => {
    const path = `profiles[${index}]`;
    if (!isRecord(profile)) {
      errors.push(`${path} must be an object.`);
      return;
    }

    if (!isNonEmptyString(profile.id)) errors.push(`${path}.id is required.`);
    else if (ids.has(profile.id)) errors.push(`${path}.id is duplicated: ${profile.id}`);
    else ids.add(profile.id);

    if (!isNonEmptyString(profile.name)) errors.push(`${path}.name is required.`);
    if (!isString(profile.description)) errors.push(`${path}.description must be a string.`);
    if (!isNonEmptyString(profile.customText)) errors.push(`${path}.customText is required.`);
    if (!isString(profile.backgroundImage)) errors.push(`${path}.backgroundImage must be a string.`);
    if (!isNonEmptyString(profile.accentColor) || !HEX_COLOR.test(profile.accentColor)) errors.push(`${path}.accentColor must be a hex color.`);
    if (!isNonEmptyString(profile.minecraftVersion)) errors.push(`${path}.minecraftVersion is required.`);
    if (typeof profile.javaVersion !== "number" || !Number.isFinite(profile.javaVersion) || profile.javaVersion < 8) errors.push(`${path}.javaVersion must be a number. Example: 17 or 21.`);
    if (!MOD_LOADERS.includes(profile.modLoader as never)) errors.push(`${path}.modLoader is invalid.`);
    if (!isString(profile.modLoaderVersion)) errors.push(`${path}.modLoaderVersion must be a string.`);

    if (!isRecord(profile.defaultServer)) {
      errors.push(`${path}.defaultServer must be an object.`);
    } else {
      if (!isString(profile.defaultServer.name)) errors.push(`${path}.defaultServer.name must be a string.`);
      if (!isString(profile.defaultServer.address)) errors.push(`${path}.defaultServer.address must be a string.`);
      if (typeof profile.defaultServer.port !== "number" || profile.defaultServer.port < 1 || profile.defaultServer.port > 65535) {
        errors.push(`${path}.defaultServer.port must be 1-65535.`);
      }
    }

    isValidAssetArray(profile.mods, `${path}.mods`, errors);
    isValidAssetArray(profile.resourcePacks, `${path}.resourcePacks`, errors);
    isValidAssetArray(profile.shaders, `${path}.shaders`, errors);
    validateEditableFields(profile.editableFields, `${path}.editableFields`, errors);

    if (!isRecord(profile.launchOptions)) {
      errors.push(`${path}.launchOptions must be an object.`);
    } else {
      const min = profile.launchOptions.minMemoryMb;
      const max = profile.launchOptions.maxMemoryMb;
      if (typeof min !== "number" || min < 512) errors.push(`${path}.launchOptions.minMemoryMb must be at least 512.`);
      if (typeof max !== "number" || max < 512) errors.push(`${path}.launchOptions.maxMemoryMb must be at least 512.`);
      if (typeof min === "number" && typeof max === "number" && min > max) errors.push(`${path}.launchOptions.minMemoryMb must be <= maxMemoryMb.`);
      if (!Array.isArray(profile.launchOptions.javaArgs) || !profile.launchOptions.javaArgs.every(isString)) {
        errors.push(`${path}.launchOptions.javaArgs must be string[].`);
      }
    }
  });

  return { ok: errors.length === 0, errors };
}

export function assertProfilesManifest(value: unknown): ProfilesManifest {
  const result = validateProfilesManifest(value);
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return value as ProfilesManifest;
}
