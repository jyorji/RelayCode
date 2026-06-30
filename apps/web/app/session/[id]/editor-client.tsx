"use client";

import dynamic from "next/dynamic";

const CollaborativeEditor = dynamic(
  () => import("@/components/Editor").then((m) => m.CollaborativeEditor),
  { ssr: false },
);

export function EditorClient(props: {
  sessionId: string;
  initialCode: string;
  allowAutocomplete: boolean;
  allowLanguageChange: boolean;
  isGuest: boolean;
  currentUserName: string | null;
  currentUserImage: string | null;
  currentUserId: string | null;
}) {
  return <CollaborativeEditor {...props} />;
}
