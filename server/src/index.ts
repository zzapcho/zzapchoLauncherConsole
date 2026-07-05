import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { createSession, requireAdmin } from "./auth.js";
import { readManifest, writeManifest } from "./githubStore.js";
import { validateProfilesManifest } from "../../shared/profileValidation.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 8787);

app.use(cors({ origin: true }));
app.use(express.json({ limit: "5mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "zzapcho-launcher-console-server" });
});

app.post("/api/login", (req, res) => {
  const username = req.body?.username;
  const password = req.body?.password;
  if (typeof username !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "username and password are required" });
    return;
  }

  const token = createSession(username, password);
  if (!token) {
    res.status(401).json({ error: "invalid login" });
    return;
  }

  res.json({ token });
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

app.listen(port, () => {
  console.log(`zzapcho Launcher Console server running on http://localhost:${port}`);
});
