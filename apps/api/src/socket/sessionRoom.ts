import type { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { prisma } from "../lib/db";
import { publishToQueue, EXECUTION_QUEUE } from "../lib/queue";
import { sessionOffsetMs, sessionRoomName } from "../lib/sessionUtils";

interface Presence {
  userId: string;
  name: string;
  image: string | null;
}

const presenceByRoom = new Map<string, Map<string, Presence>>();

function broadcastPresence(io: Server, sessionId: string) {
  const presence = presenceByRoom.get(sessionId);
  io.to(sessionRoomName(sessionId)).emit("presence:update", {
    users: presence ? Array.from(presence.values()) : [],
  });
}

interface AuthInfo {
  userId: string;
  isGuest: boolean;
  guestName?: string;
}

function authenticate(socket: Socket): AuthInfo {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) throw new Error("Missing auth token");

  const payload = jwt.verify(token, process.env.JWT_SECRET!) as jwt.JwtPayload;
  if (!payload.sub) throw new Error("Invalid token");

  return {
    userId: payload.sub,
    isGuest: payload.isGuest === true,
    guestName: typeof payload.name === "string" ? payload.name : undefined,
  };
}

export function registerSessionRoom(io: Server) {
  io.use((socket, next) => {
    try {
      const auth = authenticate(socket);
      socket.data.userId = auth.userId;
      socket.data.isGuest = auth.isGuest;
      socket.data.guestName = auth.guestName;
      next();
    } catch (err) {
      next(err instanceof Error ? err : new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    const userId: string = socket.data.userId;
    const isGuest: boolean = socket.data.isGuest ?? false;

    socket.on("session:join", async ({ sessionId }: { sessionId: string }) => {
      const session = await prisma.session.findUnique({ where: { id: sessionId } });
      if (!session) {
        socket.emit("error", { message: "Session not found" });
        return;
      }

      let presenceName: string;
      let presenceImage: string | null = null;

      if (isGuest) {
        presenceName = socket.data.guestName ?? "Guest";
      } else {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true, email: true, image: true },
        });
        presenceName = user?.name ?? user?.email ?? "Anonymous";
        presenceImage = user?.image ?? null;
      }

      socket.data.sessionId = sessionId;
      await socket.join(sessionRoomName(sessionId));

      const presence = presenceByRoom.get(sessionId) ?? new Map<string, Presence>();
      presence.set(socket.id, {
        userId,
        name: presenceName,
        image: presenceImage,
      });
      presenceByRoom.set(sessionId, presence);

      socket.emit("session:joined", { session });
      broadcastPresence(io, sessionId);
    });

    socket.on(
      "language:change",
      async ({ sessionId, language }: { sessionId: string; language: string }) => {
        const offset = await sessionOffsetMs(sessionId);
        await prisma.session.update({ where: { id: sessionId }, data: { language } });
        await prisma.sessionEvent.create({
          data: { sessionId, type: "LANGUAGE_CHANGE", payload: { language }, offsetMs: offset },
        });
        io.to(sessionRoomName(sessionId)).emit("language:changed", { language });
      },
    );

    socket.on(
      "status:change",
      async ({
        sessionId,
        status,
      }: {
        sessionId: string;
        status: "WAITING" | "ACTIVE" | "ENDED";
      }) => {
        const existing = await prisma.session.findUnique({ where: { id: sessionId } });
        if (!existing) return;

        const timestamps: { startedAt?: Date; endedAt?: Date } = {};
        if (status === "ACTIVE" && !existing.startedAt) timestamps.startedAt = new Date();
        if (status === "ENDED" && !existing.endedAt) timestamps.endedAt = new Date();

        const offset = await sessionOffsetMs(sessionId);
        await prisma.session.update({ where: { id: sessionId }, data: { status, ...timestamps } });
        await prisma.sessionEvent.create({
          data: { sessionId, type: "STATUS_CHANGE", payload: { status }, offsetMs: offset },
        });
        io.to(sessionRoomName(sessionId)).emit("status:changed", { status, ...timestamps });
      },
    );

    socket.on("keystroke", async ({ sessionId, code, language }: { sessionId: string; code: string; language: string }) => {
      if (isGuest) return;
      const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { startedAt: true, status: true } });
      if (!session?.startedAt || session.status !== "ACTIVE") return;
      const offsetMs = Date.now() - session.startedAt.getTime();
      await prisma.sessionEvent.create({
        data: { sessionId, type: "KEYSTROKE", payload: { code, language }, offsetMs },
      });
    });

    socket.on("focus:change", async ({ sessionId, away, reason }: { sessionId: string; away: boolean; reason: "tab" | "window" }) => {
      if (!isGuest) return;
      const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { startedAt: true, status: true } });
      if (!session?.startedAt || session.status !== "ACTIVE") return;
      const offsetMs = Date.now() - session.startedAt.getTime();
      await prisma.sessionEvent.create({
        data: { sessionId, type: "FOCUS_CHANGE", payload: { away, reason }, offsetMs },
      });
    });

    socket.on(
      "comment:add",
      async ({ sessionId, text }: { sessionId: string; text: string }) => {
        const offset = await sessionOffsetMs(sessionId);
        const event = await prisma.sessionEvent.create({
          data: { sessionId, type: "COMMENT", payload: { text, userId }, offsetMs: offset },
        });
        io.to(sessionRoomName(sessionId)).emit("comment:added", {
          id: event.id,
          userId,
          text,
          createdAt: event.createdAt,
        });
      },
    );

    socket.on(
      "code:run",
      async ({
        sessionId,
        code,
        language,
        stdin,
        requestId: clientRequestId,
      }: {
        sessionId: string;
        code: string;
        language: string;
        stdin?: string;
        requestId?: string;
      }) => {
        const requestId = clientRequestId ?? randomUUID();
        await publishToQueue(EXECUTION_QUEUE, { requestId, sessionId, code, language, stdin, userId });
        socket.emit("code:run:queued", { requestId });
      },
    );

    socket.on("disconnect", () => {
      const sessionId: string | undefined = socket.data.sessionId;
      if (!sessionId) return;

      const presence = presenceByRoom.get(sessionId);
      presence?.delete(socket.id);
      if (presence && presence.size === 0) presenceByRoom.delete(sessionId);

      broadcastPresence(io, sessionId);
    });
  });
}
