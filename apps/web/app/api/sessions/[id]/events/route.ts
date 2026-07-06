import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { prisma } from "@/lib/db";

async function getUserId(sub: string) {
  const account = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider: "auth0", providerAccountId: sub } },
    select: { userId: true },
  });
  return account?.userId ?? null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth0.getSession();
  if (!session?.user.sub) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const userId = await getUserId(session.user.sub);
  if (!userId) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const existing = await prisma.session.findUnique({ where: { id }, select: { userId: true } });
  if (!existing) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (existing.userId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const events = await prisma.sessionEvent.findMany({
    where: { sessionId: id },
    orderBy: { offsetMs: "asc" },
    select: { id: true, type: true, payload: true, offsetMs: true },
  });

  return NextResponse.json(events);
}
