import { auth0 } from "@/lib/auth0";
import { prisma } from "@/lib/db";
import { AuthCard } from "./auth-card";
import { SessionsDashboard } from "./sessions-dashboard";

export default async function Home() {
  const session = await auth0.getSession();

  if (!session) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background px-4">
        <AuthCard />
      </div>
    );
  }

  const account = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: { provider: "auth0", providerAccountId: session.user.sub },
    },
    select: { userId: true },
  });

  const [sessions, problems] = await Promise.all([
    account
      ? prisma.session.findMany({
          where: { userId: account.userId },
          orderBy: { createdAt: "desc" },
          include: { problem: { select: { id: true, title: true, difficulty: true } } },
        })
      : Promise.resolve([]),
    prisma.problem.findMany({
      select: { id: true, title: true, difficulty: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const serialized = sessions.map((s) => ({
    id: s.id,
    title: s.title,
    language: s.language,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
    allowAutocomplete: s.allowAutocomplete,
    allowLanguageChange: s.allowLanguageChange,
    problemId: s.problemId,
    problem: s.problem ? { title: s.problem.title, difficulty: s.problem.difficulty } : null,
  }));

  return <SessionsDashboard sessions={serialized} problems={problems} />;
}
