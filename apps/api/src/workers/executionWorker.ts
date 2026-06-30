import type { Server } from "socket.io";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { consumeQueue, EXECUTION_QUEUE } from "../lib/queue";
import { runCode } from "../lib/judge0";
import { sessionOffsetMs, sessionRoomName } from "../lib/sessionUtils";

interface RunRequest {
  requestId: string;
  sessionId: string;
  code: string;
  language: string;
  stdin?: string;
  userId: string;
}

export function startExecutionWorker(io: Server) {
  consumeQueue(EXECUTION_QUEUE, async (payload) => {
    const { requestId, sessionId, code, language, stdin, userId } = payload as RunRequest;

    const result = await runCode({ code, language, stdin }).catch((err) => ({
      stdout: null,
      stderr: err instanceof Error ? err.message : "Execution failed",
      compileOutput: null,
      status: "Error",
      time: null,
      memory: null,
    }));

    const offset = await sessionOffsetMs(sessionId);
    await prisma.sessionEvent.create({
      data: {
        sessionId,
        type: "CODE_RUN",
        payload: { requestId, code, language, userId, result } as Prisma.InputJsonValue,
        offsetMs: offset,
      },
    });

    io.to(sessionRoomName(sessionId)).emit("code:run:result", { requestId, result });
  }).catch((err) => {
    console.error("Execution worker failed to start (is RabbitMQ running?):", err);
  });
}
