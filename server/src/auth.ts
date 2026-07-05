import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

type SessionPayload = {
  username: string;
  exp: number;
};

function getAdminConfig() {
  return {
    username: process.env.ADMIN_USERNAME ?? "admin",
    secret: process.env.ADMIN_PASSWORD ?? "change-me",
    signingSecret: process.env.AUTH_SECRET ?? process.env.ADMIN_PASSWORD ?? "change-me",
  };
}

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string) {
  return crypto.createHmac("sha256", getAdminConfig().signingSecret).update(payload).digest("base64url");
}

function createToken(payload: SessionPayload) {
  const body = base64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

function readToken(token: string): SessionPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length) return null;
  if (!crypto.timingSafeEqual(expectedBuffer, actualBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.username || typeof payload.exp !== "number") return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createSession(username: string, secret: string) {
  const config = getAdminConfig();
  if (username !== config.username || secret !== config.secret) return null;
  return createToken({ username, exp: Date.now() + SESSION_TTL_MS });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const session = req.header("x-admin-session") ?? "";
  const payload = session ? readToken(session) : null;

  if (!payload) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  next();
}
