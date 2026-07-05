import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import { createSession, requireAdmin } from "./auth.js";
import { searchCurseForge } from "./curseforge.js";
import { getUploadRoot, readManifest, writeManifest } from "./localStore.js";
import { getLauncherMeta } from "./meta.js";
import { validateProfilesManifest } from "../../shared/profileValidation.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 3379);
const host = process.env.HOST ?? "0.0.0.0";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadRoot = getUploadRoot();
const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? `http://127.0.0.1:${port}`;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.UPLOAD_MAX_BYTES ?? 128 * 1024 * 1024) },
});

const uploadKinds = ["mods", "resourcePacks", "shaders"] as const;
type UploadKind = typeof uploadKinds[number];
const allowedExt: Record<UploadKind, string[]> = { mods: [".jar"], resourcePacks: [".zip"], shaders: [".zip"] };

function findConsoleDist() {
  const candidates = [
    process.env.CONSOLE_DIST_PATH,
    path.resolve(process.cwd(), "../console/dist"),
    path.resolve(process.cwd(), "console/dist"),
    path.resolve(__dirname, "../../console/dist"),
    path.resolve(__dirname, "../../../console/dist"),
  ].filter(Boolean) as string[];
  return candidates.find((candidate) => existsSync(path.join(candidate, "index.html"))) ?? null;
}

function sanitizeSegment(value: string) {
  return value.normalize("NFKC").replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 120) || `file-${Date.now()}`;
}

function sanitizeProfileId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/^-+|-+$/g, "") || "unknown-profile";
}

async function uniqueFilePath(dir: string, fileName: string) {
  const parsed = path.parse(fileName);
  let candidate = fileName;
  let index = 1;
  while (existsSync(path.join(dir, candidate))) {
    candidate = `${parsed.name}-${index}${parsed.ext}`;
    index += 1;
  }
  return { fileName: candidate, fullPath: path.join(dir, candidate) };
}

app.use(cors({ origin: true }));
app.use(express.json({ limit: "5mb" }));
app.use("/uploads", express.static(uploadRoot, { fallthrough: false }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "zzapcho-launcher-console-server", store: "local" });
});

app.post("/api/login", (req, res) => {
  const username = req.body?.username;
  const secret = req.body?.secret;
  if (typeof username !== "string" || typeof secret !== "string") {
    res.status(400).json({ error: "username and secret are required" });
    return;
  }
  const session = createSession(username, secret);
  if (!session) {
    res.status(401).json({ error: "invalid login" });
    return;
  }
  res.json({ session });
});

app.get("/api/meta", async (req, res) => {
  try {
    const minecraftVersion = typeof req.query.minecraftVersion === "string" ? req.query.minecraftVersion : undefined;
    const meta = await getLauncherMeta(minecraftVersion);
    res.json(meta);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "unknown error" });
  }
});

app.get("/api/launcher/profiles", async (_req, res) => {
  try {
    const result = await readManifest();
    res.setHeader("Cache-Control", "no-store");
    res.json({ profiles: result.profiles, source: result.source });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "unknown error" });
  }
});

app.get("/api/curseforge/search", async (req, res) => {
  const query = String(req.query.query ?? "");
  const kind = String(req.query.kind ?? "mod") as "mod" | "resourcepack" | "shader" | "modpack";
  if (!query.trim()) {
    res.json({ items: [] });
    return;
  }
  try {
    const items = await searchCurseForge(query, kind);
    res.json({ items });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "unknown error" });
  }
});

app.get("/api/profiles", requireAdmin, async (_req, res) => {
  try {
    const result = await readManifest();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "unknown error" });
  }
});

app.post("/api/validate", requireAdmin, (req, res) => {
  const result = validateProfilesManifest(req.body?.profiles);
  res.status(result.ok ? 200 : 400).json(result);
});

app.post("/api/uploads", requireAdmin, upload.single("file"), async (req, res) => {
  try {
    const profileId = sanitizeProfileId(String(req.body?.profileId ?? ""));
    const kind = String(req.body?.kind ?? "") as UploadKind;
    if (!uploadKinds.includes(kind)) {
      res.status(400).json({ error: "kind must be mods, resourcePacks, or shaders." });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "file is required." });
      return;
    }
    const cleanName = sanitizeSegment(req.file.originalname);
    const ext = path.extname(cleanName).toLowerCase();
    if (!allowedExt[kind].includes(ext)) {
      res.status(400).json({ error: `${kind}에는 ${allowedExt[kind].join(", ")} 파일만 업로드할 수 있습니다.` });
      return;
    }
    const dir = path.join(uploadRoot, profileId, kind);
    await mkdir(dir, { recursive: true });
    const { fullPath, fileName } = await uniqueFilePath(dir, cleanName);
    await writeFile(fullPath, req.file.buffer);
    const url = new URL(`/uploads/${encodeURIComponent(profileId)}/${encodeURIComponent(kind)}/${encodeURIComponent(fileName)}`, publicBaseUrl.endsWith("/") ? publicBaseUrl : `${publicBaseUrl}/`).toString();
    res.json({
      ok: true,
      asset: {
        id: `${kind}-${Date.now()}-${fileName.replace(/\.[^.]+$/, "")}`,
        name: fileName.replace(/\.(jar|zip)$/i, ""),
        version: "uploaded",
        required: true,
        url,
        source: "upload",
        fileName,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "upload failed" });
  }
});

app.put("/api/profiles", requireAdmin, async (req, res) => {
  const profiles = req.body?.profiles;
  const validation = validateProfilesManifest(profiles);
  if (!validation.ok) {
    res.status(400).json(validation);
    return;
  }
  try {
    const result = await writeManifest(profiles);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "unknown error" });
  }
});

const consoleDist = findConsoleDist();
if (consoleDist) {
  console.log(`Serving console UI from ${consoleDist}`);
  app.use(express.static(consoleDist, {
    setHeaders(res, filePath) {
      if (filePath.endsWith("index.html")) res.setHeader("Cache-Control", "no-store");
    },
  }));
  app.get(["/assets/*", "/favicon.ico"], (req, res) => {
    res.status(404).type("text/plain").send(`Static file not found: ${req.path}. Rebuild console/dist and hard refresh the browser.`);
  });
  app.get("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.join(consoleDist, "index.html"));
  });
} else {
  console.warn("console/dist not found. API server will run without the web UI until you build the console.");
}

app.listen(port, host, () => {
  console.log(`zzapcho Launcher Console running on http://${host}:${port}`);
});
