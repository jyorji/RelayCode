import { notFound, redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { prisma } from "@/lib/db";
import type { ReplayEvent } from "./replay-client";
import { ReplayClient } from "./replay-client";

export default async function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth0.getSession();
  if (!session) redirect("/");

  const account = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider: "auth0", providerAccountId: session.user.sub } },
    select: { userId: true },
  });
  if (!account) redirect("/");

  const dbSession = await prisma.session.findUnique({
    where: { id },
    select: { id: true, title: true, userId: true, language: true, startedAt: true, endedAt: true },
  });
  if (!dbSession) notFound();
  if (dbSession.userId !== account.userId) notFound();

  const events = await prisma.sessionEvent.findMany({
    where: { sessionId: id },
    orderBy: { offsetMs: "asc" },
    select: { id: true, type: true, payload: true, offsetMs: true },
  });

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <ReplayClient
        session={{
          id: dbSession.id,
          title: dbSession.title,
          language: dbSession.language,
          startedAt: dbSession.startedAt?.toISOString() ?? null,
          endedAt: dbSession.endedAt?.toISOString() ?? null,
        }}
        events={events as ReplayEvent[]}
      />
    </main>
  );
}
