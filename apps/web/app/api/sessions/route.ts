import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const session = await auth0.getSession();
  if (!session?.user.sub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const language = typeof body.language === "string" ? body.language : "javascript";
  const allowAutocomplete = typeof body.allowAutocomplete === "boolean" ? body.allowAutocomplete : true;
  const allowLanguageChange = typeof body.allowLanguageChange === "boolean" ? body.allowLanguageChange : true;

  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const account = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: { provider: "auth0", providerAccountId: session.user.sub },
    },
    select: { userId: true },
  });

  if (!account) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const created = await prisma.session.create({
    data: { title, language, allowAutocomplete, allowLanguageChange, userId: account.userId },
  });

  return NextResponse.json(created, { status: 201 });
}
