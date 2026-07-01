"use client";

import dynamic from "next/dynamic";

const CollaborativeEditor = dynamic(
  () => import("@/components/Editor").then((m) => m.CollaborativeEditor),
  { ssr: false },
);

interface Problem {
  id: string;
  title: string;
  description: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
}

interface TestCase {
  input: string;
  expected: string;
}

export function EditorClient(props: {
  sessionId: string;
  initialCode: string;
  sessionLanguage: string;
  allowAutocomplete: boolean;
  allowLanguageChange: boolean;
  isGuest: boolean;
  currentUserName: string | null;
  currentUserImage: string | null;
  currentUserId: string | null;
  problem: Problem | null;
  starterCode: Record<string, string>;
  testCases: TestCase[];
}) {
  return <CollaborativeEditor {...props} />;
}
