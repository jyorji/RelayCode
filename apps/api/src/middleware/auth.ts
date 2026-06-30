import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/db";
import { ForbiddenError, UnauthorizedError } from "../lib/errors";

function extractUserId(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return undefined;

  const token = header.slice("Bearer ".length);
  const payload = jwt.verify(token, process.env.JWT_SECRET!);
  if (typeof payload === "string" || !payload.sub) return undefined;

  return payload.sub;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const userId = extractUserId(req);
    if (!userId) throw new UnauthorizedError("Missing or invalid token");
    req.userId = userId;
    next();
  } catch {
    next(new UnauthorizedError("Missing or invalid token"));
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    req.userId = extractUserId(req);
  } catch {
    req.userId = undefined;
  }
  next();
}

export async function requireInterviewer(req: Request, _res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (user?.role !== "INTERVIEWER") throw new ForbiddenError("Interviewer role required");
    next();
  } catch (err) {
    next(err);
  }
}
