import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { prisma } from "@/lib/db";
import { ProblemsClient } from "./problems-client";

export default async function ProblemsPage() {
  const session = await auth0.getSession();
  if (!session) redirect("/");

  const problems = await prisma.problem.findMany({
    select: { id: true, title: true, difficulty: true, tags: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const serialized = problems.map((p) => ({
    id: p.id,
    title: p.title,
    difficulty: p.difficulty as "EASY" | "MEDIUM" | "HARD",
    tags: p.tags,
    createdAt: p.createdAt.toISOString(),
  }));

  return <ProblemsClient problems={serialized} />;
}
