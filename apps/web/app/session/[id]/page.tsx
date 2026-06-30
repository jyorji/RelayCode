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

  const dbSession = await prisma.session.findUnique({
    where: { id },
    select: { id: true, code: true, allowAutocomplete: true, allowLanguageChange: true },
  });
  if (!dbSession) notFound();

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1">
        <EditorClient
          sessionId={id}
          initialCode={dbSession.code}
          allowAutocomplete={dbSession.allowAutocomplete}
          allowLanguageChange={dbSession.allowLanguageChange}
          isGuest={isGuest}
          currentUserName={currentUserName}
          currentUserImage={currentUserImage}
          currentUserId={currentUserId}
        />
      </div>
    </main>
  );
}
