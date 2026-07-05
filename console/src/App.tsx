import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Box, CheckCircle2, ChevronDown, Copy, Github, Lock, LogOut, Menu, Plus, Save, Search, Settings2, Sparkles, Trash2, Upload, X } from "lucide-react";
import { clearSession, getSession, loadProfiles, login, saveProfiles } from "./api";
import { createEmptyProfile, MOD_LOADERS, type LauncherAsset, type LauncherProfile, type ProfilesManifest } from "../../shared/profileTypes";
import { validateProfilesManifest } from "../../shared/profileValidation";
import { ExternalAssetPicker } from "./ExternalAssetPicker";
import type { ExternalProject, ProjectKind } from "./externalSources";

export function App() {
  return <div />;
}
