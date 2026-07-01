import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const session = await auth0.getSession();
  if (!session?.user.sub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const { title, description, difficulty, tags, starterCode, testCases } = body;

  if (!title?.trim() || !description?.trim() || !difficulty) {
    return NextResponse.json({ error: "title, description and difficulty are required" }, { status: 400 });
  }

  const problem = await prisma.problem.create({
    data: {
      title: title.trim(),
      description: description.trim(),
      difficulty,
      tags: Array.isArray(tags) ? tags : [],
      starterCode: starterCode ?? {},
      testCases: Array.isArray(testCases) ? testCases : [],
    },
  });

  return NextResponse.json(problem, { status: 201 });
}
