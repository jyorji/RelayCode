import { notFound } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { prisma } from "@/lib/db";
import { EditorClient } from "./editor-client";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth0.getSession();
  const isGuest = !session;
  const currentUserName = session?.user.name ?? session?.user.email ?? null;
  const currentUserImage = session?.user.picture ?? null;
  const currentUserId = session?.user.sub ?? null;

  const [dbSession, sessionCodes] = await Promise.all([
    prisma.session.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        language: true,
        status: true,
        startedAt: true,
        duration: true,
        allowAutocomplete: true,
        allowLanguageChange: true,
        problem: { select: { id: true, title: true, description: true, difficulty: true, starterCode: true, testCases: true } },
      },
    }),
    prisma.sessionCode.findMany({
      where: { sessionId: id },
      select: { language: true, code: true },
    }),
  ]);
  if (!dbSession) notFound();

  const codeByLanguage = Object.fromEntries(sessionCodes.map((sc) => [sc.language, sc.code]));
  const starterCode = dbSession.problem?.starterCode as Record<string, string> | null;
  const initialCode = codeByLanguage[dbSession.language] ?? dbSession.code ?? starterCode?.[dbSession.language] ?? "";
  const testCases = (dbSession.problem?.testCases as Array<{ input: string; expected: string }> | null) ?? [];

  const problem = dbSession.problem
    ? {
        id: dbSession.problem.id,
        title: dbSession.problem.title,
        description: dbSession.problem.description,
        difficulty: dbSession.problem.difficulty as "EASY" | "MEDIUM" | "HARD",
      }
    : null;

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1">
        <EditorClient
          sessionId={id}
          initialCode={initialCode}
          sessionLanguage={dbSession.language}
          initialStatus={dbSession.status}
          initialStartedAt={dbSession.startedAt?.toISOString() ?? null}
          duration={dbSession.duration}
          allowAutocomplete={dbSession.allowAutocomplete}
          allowLanguageChange={dbSession.allowLanguageChange}
          isGuest={isGuest}
          currentUserName={currentUserName}
          currentUserImage={currentUserImage}
          currentUserId={currentUserId}
          problem={problem}
          starterCode={starterCode ?? {}}
          testCases={testCases}
          codeByLanguage={codeByLanguage}
        />
      </div>
    </main>
  );
}
