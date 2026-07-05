import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const sessions = new Map<string, number>();
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

function getAdminConfig() {
  return {
    username: process.env.ADMIN_USERNAME ?? "admin",
    secret: process.env.ADMIN_PASSWORD ?? "change-me",
  };
}

export function createSession(username: string, secret: string) {
  const config = getAdminConfig();
  if (username !== config.username || secret !== config.secret) return null;
  const session = crypto.randomBytes(32).toString("hex");
  sessions.set(session, Date.now() + SESSION_TTL_MS);
  return session;
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const session = req.header("x-admin-session") ?? "";
  const expiresAt = sessions.get(session);

  if (!session || !expiresAt || expiresAt < Date.now()) {
    if (session) sessions.delete(session);
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  sessions.set(session, Date.now() + SESSION_TTL_MS);
  next();
}
