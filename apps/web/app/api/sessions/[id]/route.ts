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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth0.getSession();
  if (!session?.user.sub) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const userId = await getUserId(session.user.sub);
  if (!userId) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const existing = await prisma.session.findUnique({ where: { id }, select: { userId: true } });
  if (!existing) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (existing.userId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const data: Record<string, unknown> = {};

  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (typeof body.language === "string") data.language = body.language;
  if (typeof body.allowAutocomplete === "boolean") data.allowAutocomplete = body.allowAutocomplete;
  if (typeof body.allowLanguageChange === "boolean") data.allowLanguageChange = body.allowLanguageChange;
  if (typeof body.code === "string") data.code = body.code;
  if (typeof body.problemId === "string") data.problemId = body.problemId || null;

  const updated = await prisma.session.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth0.getSession();
  if (!session?.user.sub) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const userId = await getUserId(session.user.sub);
  if (!userId) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const existing = await prisma.session.findUnique({ where: { id }, select: { userId: true } });
  if (!existing) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (existing.userId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.session.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
