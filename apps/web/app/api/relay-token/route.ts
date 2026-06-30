import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { auth0 } from "@/lib/auth0";
import { mintRelayToken } from "@/lib/relayToken";

export async function GET() {
  const session = await auth0.getSession();
  if (!session?.user.sub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const token = await mintRelayToken(session.user.sub);
  if (!token) {
    return NextResponse.json({ error: "No linked account" }, { status: 404 });
  }

  return NextResponse.json({ token });
}

export async function POST(request: Request) {
  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";

  if (!name || !email) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }

  const token = jwt.sign(
    { sub: `guest_${randomUUID()}`, name, email, isGuest: true },
    process.env.JWT_SECRET!,
    { expiresIn: "4h" },
  );

  return NextResponse.json({ token });
}
