import { prisma } from "./db";

export function sessionRoomName(sessionId: string) {
  return `session:${sessionId}`;
}

export async function sessionOffsetMs(sessionId: string): Promise<number> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { startedAt: true },
  });
  if (!session?.startedAt) return 0;
  return Date.now() - session.startedAt.getTime();
}
