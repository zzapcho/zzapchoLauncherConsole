import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const sessions = new Map<string, number>();
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

function getAdminConfig() {
  return {
    username: process.env.ADMIN_USERNAME ?? "admin",
    password: process.env.ADMIN_PASSWORD ?? "change-me",
  };
}

export function createSession(username: string, password: string) {
  const config = getAdminConfig();
  if (username !== config.username || password !== config.password) return null;
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const expiresAt = sessions.get(token);

  if (!token || !expiresAt || expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  sessions.set(token, Date.now() + SESSION_TTL_MS);
  next();
}
