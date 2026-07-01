"use client";

import { useEffect, useRef, useState } from "react";
import MonacoEditor, { type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { MonacoBinding } from "y-monaco";
import { io, type Socket } from "socket.io-client";
import { Avatar, AvatarGroup, Badge, Button, Icon, Input, Label, Select } from "forge-ui";
import { ProblemRenderer } from "./ProblemRenderer";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:4000";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const SAVE_DEBOUNCE_MS = 2000;

const CURSOR_COLORS = [
  { color: "#9CDCFE", colorLight: "#9CDCFE30" },
  { color: "#4EC9B0", colorLight: "#4EC9B030" },
  { color: "#CE9178", colorLight: "#CE917830" },
  { color: "#C586C0", colorLight: "#C586C030" },
  { color: "#DCDCAA", colorLight: "#DCDCAA30" },
  { color: "#F44747", colorLight: "#F4474730" },
];

function pickCursorColor(id: number) {
  return CURSOR_COLORS[id % CURSOR_COLORS.length];
}

const LANGUAGE_OPTIONS = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "cpp", label: "C++" },
  { value: "c", label: "C" },
  { value: "go", label: "Go" },
  { value: "ruby", label: "Ruby" },
];

const DEFAULT_STARTERS: Record<string, string> = {
  javascript: `/**
 * @param {*} input
 * @return {*}
 */
function solution(input) {
  // your code here
}`,
  typescript: `function solution(input: unknown): unknown {
  // your code here
}`,
  python: `def solution(input):
    # your code here
    pass`,
  java: `class Solution {
    public static Object solution(Object input) {
        // your code here
        return null;
    }
}`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

// your code here
`,
  c: `#include <stdio.h>
#include <stdlib.h>

// your code here
`,
  go: `package main

func solution(input interface{}) interface{} {
	// your code here
	return nil
}`,
  ruby: `def solution(input)
  # your code here
end`,
};

interface TestCase {
  input: string;
  expected: string;
}

interface CustomTestCase {
  inputs: string[];
  expected: string;
}

function extractParamNames(code: string, language: string): string[] {
  let match: RegExpMatchArray | null = null;

  if (language === "python" || language === "ruby") {
    match = code.match(/def\s+\w+\s*\(([^)]*)\)/);
  } else if (language === "go") {
    match = code.match(/func\s+\w+\s*\(([^)]*)\)/);
  } else if (language === "javascript" || language === "typescript") {
    match =
      code.match(/function\s+\w+\s*\(([^)]*)\)/) ??
      code.match(/(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?\(([^)]*)\)/);
  } else {
    match = code.match(/\b\w[\w<>[\]]*\s+\w+\s*\(([^)]*)\)/);
  }

  const paramStr = match?.[1]?.trim();
  if (!paramStr) return [];

  const typed = ["java", "cpp", "c"].includes(language);
  const isGo = language === "go";

  return paramStr
    .split(",")
    .map((p) => {
      const clean = p.trim().replace(/^\.\.\./, "");
      if (!clean) return "";
      if (isGo) return clean.split(/\s+/)[0].replace(/\W/g, "");
      if (typed) return (clean.split(/\s+/).pop() ?? "").replace(/\W/g, "");
      return clean.split(/[:=]/)[0].trim().replace(/[^a-zA-Z0-9_]/g, "");
    })
    .filter(Boolean);
}

function resultPassed(result: RunResult, expected: string): boolean {
  if (result.compileOutput || result.stderr) return false;
  return (result.stdout ?? "").trim() === expected.trim();
}

interface PresenceUser {
  userId: string;
  name: string;
  image: string | null;
}

interface Problem {
  id: string;
  title: string;
  description: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
}

const DIFFICULTY_VARIANT: Record<string, "success" | "warning" | "destructive"> = {
  EASY: "success",
  MEDIUM: "warning",
  HARD: "destructive",
};

interface RunResult {
  stdout: string | null;
  stderr: string | null;
  compileOutput: string | null;
  status: string;
  time: string | null;
  memory: number | null;
}

type ConnectionStatus = "connecting" | "connected" | "disconnected";
type SaveStatus = "saved" | "saving" | "unsaved";

interface WidgetEntry {
  widget: Monaco.editor.IContentWidget;
  posRef: { current: Monaco.IPosition };
}

function makeAvatarNode(color: string, initial: string, image: string | null): HTMLDivElement {
  const node = document.createElement("div");
  Object.assign(node.style, {
    width: "22px",
    height: "22px",
    borderRadius: "50%",
    border: `2px solid ${color}`,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "11px",
    fontWeight: "700",
    fontFamily: "sans-serif",
    color: "#fff",
    backgroundColor: color,
    boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
    flexShrink: "0",
    userSelect: "none",
    zIndex: "100",
  });

  if (image) {
    const img = document.createElement("img");
    img.src = image;
    Object.assign(img.style, { width: "100%", height: "100%", objectFit: "cover" });
    img.onerror = () => { img.remove(); node.textContent = initial; };
    node.appendChild(img);
  } else {
    node.textContent = initial;
  }

  return node;
}

export function CollaborativeEditor({
  sessionId,
  initialCode = "",
  sessionLanguage = "javascript",
  allowAutocomplete = true,
  allowLanguageChange = true,
  isGuest = false,
  currentUserName = null,
  currentUserImage = null,
  currentUserId = null,
  problem = null,
  starterCode = {},
  testCases = [],
}: {
  sessionId: string;
  initialCode?: string;
  sessionLanguage?: string;
  allowAutocomplete?: boolean;
  allowLanguageChange?: boolean;
  isGuest?: boolean;
  currentUserName?: string | null;
  currentUserImage?: string | null;
  currentUserId?: string | null;
  problem?: Problem | null;
  starterCode?: Record<string, string>;
  testCases?: TestCase[];
}) {
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestError, setGuestError] = useState("");
  const [guestJoining, setGuestJoining] = useState(false);
  const [guestToken, setGuestToken] = useState<string | null>(isGuest ? null : "");

  const [language, setLanguage] = useState(sessionLanguage);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [running, setRunning] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [activeConsoleTab, setActiveConsoleTab] = useState<"testcase" | "output">("testcase");
  const [activeCaseIdx, setActiveCaseIdx] = useState(0);
  const [caseResults, setCaseResults] = useState<(RunResult | null)[]>([]);
  const [customCases, setCustomCases] = useState<CustomTestCase[]>(() =>
    testCases.map((tc) => ({ inputs: tc.input.split("\n"), expected: tc.expected })),
  );
  const [paramNames, setParamNames] = useState<string[]>(() =>
    extractParamNames(
      starterCode[sessionLanguage] ?? DEFAULT_STARTERS[sessionLanguage] ?? "",
      sessionLanguage,
    ),
  );

  const starterCodeRef = useRef<Record<string, string>>(starterCode);

  const socketRef = useRef<Socket | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const docRef = useRef<Y.Doc | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const pendingRequestId = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  const pendingCaseRequests = useRef<Map<string, number>>(new Map());
  const displayNameRef = useRef<string>(currentUserName ?? "");
  const cursorStyleRef = useRef<HTMLStyleElement | null>(null);
  const widgetsRef = useRef<Map<number, WidgetEntry>>(new Map());
  // Stable per-page-load key stamped into every awareness state this client sends.
  // Lets us filter out our own stale state that lingers after a reconnect (different clientID, same localKey).
  const localKeyRef = useRef<string>(Math.random().toString(36).slice(2));

  const [panelWidth, setPanelWidth] = useState(384);
  const [isPanelDragging, setIsPanelDragging] = useState(false);
  const panelDragRef = useRef({ dragging: false, startX: 0, startWidth: 0 });

  // CSS for selection highlight + cursor bar only (no name label — widget handles that)
  function injectSelectionStyles(awareness: WebsocketProvider["awareness"]) {
    if (!cursorStyleRef.current) {
      const el = document.createElement("style");
      document.head.appendChild(el);
      cursorStyleRef.current = el;
    }
    let css = `
      .yRemoteSelection { border-radius: 2px; opacity: 0.4; }
      .yRemoteSelectionHead { position: relative; margin-left: -1px; border-left: 2px solid; }
    `;
    awareness.getStates().forEach((state, clientId) => {
      if (clientId === awareness.clientID) return;
      const user = state.user as { color?: string; colorLight?: string } | undefined;
      if (!user) return;
      const color = user.color ?? "#888888";
      const colorLight = user.colorLight ?? `${color}30`;
      css += `
        .yRemoteSelection-${clientId} { background-color: ${colorLight}; }
        .yRemoteSelectionHead-${clientId} { color: ${color}; }
      `;
    });
    cursorStyleRef.current.textContent = css;
  }

  // Content Widgets — one avatar per remote user, positioned at their cursor
  function updateCursorWidgets(
    awareness: WebsocketProvider["awareness"],
    doc: Y.Doc,
    editor: Parameters<OnMount>[0],
    monaco: typeof Monaco,
  ) {
    const model = editor.getModel();
    if (!model) return;

    const ytext = doc.getText("monaco");
    const seen = new Set<number>();

    awareness.getStates().forEach((state, clientId) => {
      if (clientId === awareness.clientID) return;

      const user = state.user as {
        name?: string; color?: string; colorLight?: string; image?: string | null;
        localKey?: string; userId?: string | null;
      } | undefined;
      const sel = state.selection as { head?: Y.RelativePosition } | undefined;
      if (!user || !sel?.head) return;
      // Skip any state that belongs to the current user:
      // - authenticated: match by userId (covers multiple tabs + reconnects)
      // - guest: match by localKey (covers reconnects within the same page load)
      if (currentUserId && user.userId === currentUserId) return;
      if (!currentUserId && user.localKey === localKeyRef.current) return;

      const abs = Y.createAbsolutePositionFromRelativePosition(sel.head, doc);
      if (!abs || abs.type !== ytext) return;

      const position = model.getPositionAt(abs.index);
      seen.add(clientId);

      const color = user.color ?? "#888888";
      const initial = String(user.name ?? "?").trim().slice(0, 2).toUpperCase();
      const image = user.image ?? null;

      const existing = widgetsRef.current.get(clientId);
      if (existing) {
        // Just update position and re-layout
        existing.posRef.current = position;
        editor.layoutContentWidget(existing.widget);
      } else {
        // Create a new widget
        const posRef = { current: position };
        const node = makeAvatarNode(color, initial, image);
        const widget: Monaco.editor.IContentWidget = {
          getId: () => `remote-cursor-${clientId}`,
          getDomNode: () => node,
          getPosition: () => ({
            position: posRef.current,
            preference: [
              monaco.editor.ContentWidgetPositionPreference.BELOW,
              monaco.editor.ContentWidgetPositionPreference.ABOVE,
            ],
          }),
        };
        editor.addContentWidget(widget);
        widgetsRef.current.set(clientId, { widget, posRef });
      }
    });

    // Remove widgets for users who left
    widgetsRef.current.forEach((entry, clientId) => {
      if (!seen.has(clientId)) {
        editor.removeContentWidget(entry.widget);
        widgetsRef.current.delete(clientId);
      }
    });
  }

  function scheduleSave(code: string) {
    setSaveStatus("unsaved");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (cancelledRef.current) return;
      setSaveStatus("saving");
      try {
        await fetch(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        if (!cancelledRef.current) setSaveStatus("saved");
      } catch {
        if (!cancelledRef.current) setSaveStatus("unsaved");
      }
    }, SAVE_DEBOUNCE_MS);
  }

  function setupBinding(editor: Parameters<OnMount>[0], doc: Y.Doc, provider: WebsocketProvider) {
    const model = editor.getModel();
    if (!model || bindingRef.current) return;
    const ytext = doc.getText("monaco");
    bindingRef.current = new MonacoBinding(ytext, model, new Set([editor]), provider.awareness);
    ytext.observe(() => {
      if (!cancelledRef.current) scheduleSave(ytext.toString());
    });

    const refresh = () => {
      injectSelectionStyles(provider.awareness);
      const monaco = monacoRef.current;
      if (monaco) updateCursorWidgets(provider.awareness, doc, editor, monaco);
    };
    provider.awareness.on("change", refresh);
    refresh();
  }

  useEffect(() => {
    if (guestToken === null) return;

    let cancelled = false;
    cancelledRef.current = false;

    async function connect() {
      let token: string;

      if (isGuest) {
        token = guestToken as string;
      } else {
        const res = await fetch("/api/relay-token");
        if (!res.ok) { setStatus("disconnected"); return; }
        ({ token } = await res.json());
      }

      if (cancelled) return;

      const doc = new Y.Doc();
      docRef.current = doc;
      const provider = new WebsocketProvider(`${WS_URL}/yjs`, sessionId, doc, {
        params: { token },
      });
      providerRef.current = provider;

      const { color, colorLight } = pickCursorColor(provider.awareness.clientID);
      provider.awareness.setLocalStateField("user", {
        name: displayNameRef.current || "Anonymous",
        color,
        colorLight,
        image: currentUserImage,
        localKey: localKeyRef.current,
        userId: currentUserId,
      });

      provider.once("sync", () => {
        if (cancelled) return;
        const ytext = doc.getText("monaco");
        const seed = initialCode || DEFAULT_STARTERS[sessionLanguage] || "";
        if (ytext.length === 0 && seed) {
          doc.transact(() => ytext.insert(0, seed));
        }
      });

      if (editorRef.current) setupBinding(editorRef.current, doc, provider);

      const socket = io(API_URL, { auth: { token } });
      socketRef.current = socket;

      socket.on("connect", () => { setStatus("connected"); socket.emit("session:join", { sessionId }); });
      socket.on("disconnect", () => setStatus("disconnected"));
      socket.on("connect_error", () => setStatus("disconnected"));
      socket.on("session:joined", ({ session }: { session: { language: string } }) => setLanguage(session.language));
      socket.on("presence:update", ({ users }: { users: PresenceUser[] }) => setPresence(users));
      socket.on("language:changed", ({ language }: { language: string }) => setLanguage(language));
      socket.on("code:run:queued", ({ requestId }: { requestId: string }) => {
        if (!pendingCaseRequests.current.has(requestId)) {
          pendingRequestId.current = requestId;
          setRunning(true);
        }
      });
      socket.on("code:run:result", ({ requestId, result }: { requestId: string; result: RunResult }) => {
        const caseIdx = pendingCaseRequests.current.get(requestId);
        if (caseIdx !== undefined) {
          setCaseResults((prev) => {
            const next = [...prev];
            next[caseIdx] = result;
            return next;
          });
          pendingCaseRequests.current.delete(requestId);
          if (pendingCaseRequests.current.size === 0) setRunning(false);
        } else if (pendingRequestId.current === requestId) {
          setRunning(false);
          setCaseResults([result]);
        }
      });
    }

    connect();

    return () => {
      cancelled = true;
      cancelledRef.current = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      cursorStyleRef.current?.remove();
      cursorStyleRef.current = null;
      const editor = editorRef.current;
      if (editor) {
        widgetsRef.current.forEach((e) => editor.removeContentWidget(e.widget));
      }
      widgetsRef.current.clear();
      bindingRef.current?.destroy();
      providerRef.current?.destroy();
      socketRef.current?.disconnect();
    };
  }, [sessionId, guestToken]);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    const doc = docRef.current;
    const provider = providerRef.current;
    if (doc && provider) setupBinding(editor, doc, provider);
  };

  function handleLanguageChange(next: string) {
    const nextStarter = starterCodeRef.current[next] || DEFAULT_STARTERS[next] || "";
    if (nextStarter) {
      const editor = editorRef.current;
      const model = editor?.getModel();
      if (editor && model) {
        editor.executeEdits("language-change", [{
          range: model.getFullModelRange(),
          text: nextStarter,
          forceMoveMarkers: true,
        }]);
      } else {
        const doc = docRef.current;
        if (doc) {
          const ytext = doc.getText("monaco");
          doc.transact(() => {
            ytext.delete(0, ytext.length);
            ytext.insert(0, nextStarter);
          });
        }
      }
    }
    setLanguage(next);
    socketRef.current?.emit("language:change", { sessionId, language: next });
  }

  useEffect(() => {
    const starter = starterCodeRef.current[language] ?? DEFAULT_STARTERS[language] ?? "";
    setParamNames(extractParamNames(starter, language));
  }, [language]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!panelDragRef.current.dragging) return;
      const next = Math.max(240, Math.min(700, panelDragRef.current.startWidth + e.clientX - panelDragRef.current.startX));
      setPanelWidth(next);
    }
    function onMouseUp() {
      if (!panelDragRef.current.dragging) return;
      panelDragRef.current.dragging = false;
      setIsPanelDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  function startPanelDrag(e: React.MouseEvent) {
    e.preventDefault();
    panelDragRef.current = { dragging: true, startX: e.clientX, startWidth: panelWidth };
    setIsPanelDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function handleRun() {
    const code = editorRef.current?.getValue() ?? "";
    setConsoleOpen(true);
    setActiveConsoleTab("output");
    setCaseResults([]);
    pendingCaseRequests.current = new Map();
    pendingRequestId.current = null;

    if (customCases.length > 0) {
      setCaseResults(new Array(customCases.length).fill(null));
      setRunning(true);
      const newPending = new Map<string, number>();
      customCases.forEach((tc, idx) => {
        const reqId = `${Math.random().toString(36).slice(2)}-${idx}`;
        newPending.set(reqId, idx);
        socketRef.current?.emit("code:run", {
          sessionId,
          code,
          language,
          stdin: tc.inputs.join("\n"),
          requestId: reqId,
        });
      });
      pendingCaseRequests.current = newPending;
    } else {
      socketRef.current?.emit("code:run", { sessionId, code, language });
    }
  }

  async function handleGuestJoin() {
    if (!guestName.trim() || !guestEmail.trim()) { setGuestError("Name and email are required"); return; }
    setGuestJoining(true);
    setGuestError("");
    try {
      const res = await fetch("/api/relay-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: guestName.trim(), email: guestEmail.trim() }),
      });
      if (!res.ok) { setGuestError((await res.json()).error ?? "Failed to join"); return; }
      const { token } = await res.json();
      displayNameRef.current = guestName.trim();
      setGuestToken(token);
    } catch {
      setGuestError("Failed to join. Please try again.");
    } finally {
      setGuestJoining(false);
    }
  }

  if (isGuest && guestToken === null) {
    return (
      <div className="flex h-full items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-1 text-lg font-semibold">Join Session</h2>
          <p className="mb-5 text-sm text-muted-foreground">Enter your details to join as a guest.</p>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="guest-name" required>Name</Label>
              <Input id="guest-name" placeholder="Your name" value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleGuestJoin(); }}
                invalid={!!guestError} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="guest-email" required>Email</Label>
              <Input id="guest-email" type="email" placeholder="you@example.com" value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleGuestJoin(); }}
                invalid={!!guestError} />
            </div>
            {guestError && <p className="text-sm text-destructive">{guestError}</p>}
            <Button loading={guestJoining} onClick={handleGuestJoin} className="w-full">Join Session</Button>
          </div>
        </div>
      </div>
    );
  }

  const statusVariant = status === "connected" ? "success" : status === "connecting" ? "warning" : "destructive";
  const saveLabel = saveStatus === "saved" ? "Saved" : saveStatus === "saving" ? "Saving…" : "Unsaved";
  const saveVariant = saveStatus === "saved" ? "secondary" : saveStatus === "saving" ? "warning" : "destructive";

  return (
    <div className="flex h-full">
      {problem && (
        <>
          <div
            className="flex flex-shrink-0 flex-col overflow-y-auto bg-background"
            style={{ width: panelWidth }}
          >
            <div className="border-b border-border px-4 pb-3 pt-4">
              <h1 className="text-base font-semibold leading-snug text-foreground">{problem.title}</h1>
              <div className="mt-2">
                <Badge variant={DIFFICULTY_VARIANT[problem.difficulty]}>
                  {problem.difficulty.charAt(0) + problem.difficulty.slice(1).toLowerCase()}
                </Badge>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <ProblemRenderer description={problem.description} />
            </div>
          </div>
          <div
            className="w-1 flex-shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/50 active:bg-primary"
            onMouseDown={startPanelDrag}
          />
        </>
      )}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {isPanelDragging && <div className="absolute inset-0 z-10 cursor-col-resize" />}
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="w-36">
            <Select options={LANGUAGE_OPTIONS} value={language} onChange={handleLanguageChange}
              searchable={false} size="sm" disabled={!allowLanguageChange} />
          </div>
          <Badge variant={statusVariant}>{status}</Badge>
          {!isGuest && <Badge variant={saveVariant}>{saveLabel}</Badge>}
        </div>
        <div className="flex items-center gap-3">
          <AvatarGroup max={4}>
            {presence.map((user) => (
              <Avatar key={user.userId} src={user.image ?? undefined} alt={user.name}
                fallback={user.name.slice(0, 2).toUpperCase()} />
            ))}
          </AvatarGroup>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <MonacoEditor height="100%" language={language} theme="vs-dark" onMount={handleMount}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            quickSuggestions: allowAutocomplete,
            suggestOnTriggerCharacters: allowAutocomplete,
            parameterHints: { enabled: allowAutocomplete },
            wordBasedSuggestions: allowAutocomplete ? "currentDocument" : "off",
          }}
        />
      </div>

      {/* Console panel */}
      <div className="flex flex-col border-t border-border">
        {consoleOpen && (
          <div className="flex h-64 flex-col border-b border-border">
            {/* Tab bar */}
            <div className="flex shrink-0 border-b border-border">
              {(["testcase", "output"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveConsoleTab(tab)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    activeConsoleTab === tab
                      ? "border-b-2 border-primary text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab === "testcase" ? "Test Case" : "Output"}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-auto p-4 font-mono text-sm">
              {activeConsoleTab === "testcase" ? (
                <>
                  {/* Case selector */}
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {customCases.map((_, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center rounded-md text-xs font-medium transition-colors ${
                          activeCaseIdx === idx ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                        }`}
                      >
                        <button className="px-3 py-1" onClick={() => setActiveCaseIdx(idx)}>
                          Case {idx + 1}
                        </button>
                        {customCases.length > 1 && (
                          <button
                            className="pr-2 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              setCustomCases((prev) => prev.filter((_, i) => i !== idx));
                              setActiveCaseIdx((prev) => (prev >= idx && prev > 0 ? prev - 1 : prev));
                            }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        setCustomCases((prev) => [
                          ...prev,
                          { inputs: Array.from({ length: Math.max(paramNames.length, 1) }, () => ""), expected: "" },
                        ]);
                        setActiveCaseIdx(customCases.length);
                      }}
                      className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                    >
                      +
                    </button>
                  </div>

                  {/* Inputs */}
                  {customCases[activeCaseIdx] ? (
                    <div className="flex flex-col gap-3">
                      {customCases[activeCaseIdx].inputs.map((val, i) => (
                        <div key={i}>
                          <p className="mb-1 text-xs text-muted-foreground">
                            {paramNames[i] ? `${paramNames[i]} =` : "Input"}
                          </p>
                          <Input
                            value={val}
                            size="sm"
                            className="font-mono"
                            onChange={(e) =>
                              setCustomCases((prev) =>
                                prev.map((c, ci) =>
                                  ci === activeCaseIdx
                                    ? { ...c, inputs: c.inputs.map((v, vi) => (vi === i ? e.target.value : v)) }
                                    : c,
                                ),
                              )
                            }
                          />
                        </div>
                      ))}
                      <div>
                        <p className="mb-1 text-xs text-muted-foreground">Expected Output</p>
                        <Input
                          value={customCases[activeCaseIdx].expected}
                          size="sm"
                          className="font-mono"
                          onChange={(e) =>
                            setCustomCases((prev) =>
                              prev.map((c, ci) => (ci === activeCaseIdx ? { ...c, expected: e.target.value } : c)),
                            )
                          }
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No test cases. Click + to add one.</p>
                  )}
                </>
              ) : (
                /* Output tab */
                customCases.length > 0 ? (
                  <>
                    {/* Case selector with pass/fail indicators */}
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {customCases.map((tc, idx) => {
                        const res = caseResults[idx];
                        const passed = res ? resultPassed(res, tc.expected) : null;
                        return (
                          <button
                            key={idx}
                            onClick={() => setActiveCaseIdx(idx)}
                            className={`flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                              activeCaseIdx === idx ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                            }`}
                          >
                            {passed === true && <span className="text-green-400">✓</span>}
                            {passed === false && <span className="text-red-400">✗</span>}
                            Case {idx + 1}
                          </button>
                        );
                      })}
                    </div>

                    {/* Selected case result */}
                    {(() => {
                      const res = caseResults[activeCaseIdx];
                      const tc = customCases[activeCaseIdx];
                      if (!res) {
                        return (
                          <p className="text-muted-foreground">
                            {running ? "Running…" : "Click Run to execute."}
                          </p>
                        );
                      }
                      const passed = resultPassed(res, tc?.expected ?? "");
                      return (
                        <div className="flex flex-col gap-2">
                          {tc?.inputs && tc.inputs.length > 0 && (
                            <div>
                              <p className="mb-1 text-xs text-muted-foreground">Input</p>
                              <pre className="rounded bg-black/30 px-3 py-2 text-foreground/80">
                                {tc.inputs.map((val, i) => `${paramNames[i] ?? `arg${i + 1}`} = ${val}`).join("\n")}
                              </pre>
                            </div>
                          )}
                          {res.compileOutput && (
                            <pre className="whitespace-pre-wrap text-yellow-400">{res.compileOutput}</pre>
                          )}
                          {res.stderr ? (
                            <pre className="whitespace-pre-wrap text-red-400">{res.stderr}</pre>
                          ) : (
                            <>
                              <div>
                                <p className="mb-1 text-xs text-muted-foreground">Output</p>
                                <pre className={`rounded px-3 py-2 ${passed ? "bg-green-950/50 text-green-300" : "bg-red-950/50 text-red-300"}`}>
                                  {res.stdout ?? "(no output)"}
                                </pre>
                              </div>
                              <div>
                                <p className="mb-1 text-xs text-muted-foreground">Expected</p>
                                <pre className="rounded bg-black/30 px-3 py-2 text-foreground/80">{tc?.expected}</pre>
                              </div>
                            </>
                          )}
                          <div>
                            <Badge variant={passed ? "success" : "destructive"}>
                              {passed ? "Passed" : res.stderr ? "Runtime Error" : "Wrong Answer"}
                            </Badge>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  /* No test cases — raw output */
                  caseResults[0] ? (
                    <div className="flex flex-col gap-1 text-white">
                      <p className="mb-1 text-xs uppercase text-white/50">{caseResults[0].status}</p>
                      {caseResults[0].compileOutput && (
                        <pre className="whitespace-pre-wrap text-yellow-400">{caseResults[0].compileOutput}</pre>
                      )}
                      {caseResults[0].stdout && <pre className="whitespace-pre-wrap">{caseResults[0].stdout}</pre>}
                      {caseResults[0].stderr && (
                        <pre className="whitespace-pre-wrap text-red-400">{caseResults[0].stderr}</pre>
                      )}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">
                      {running ? "Running…" : "Click Run to execute."}
                    </p>
                  )
                )
              )}
            </div>
          </div>
        )}

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-4 py-2">
          <button
            onClick={() => setConsoleOpen((v) => !v)}
            className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <span>Console</span>
            <Icon name={consoleOpen ? "expand_more" : "expand_less"} size="sm" />
          </button>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" leftIcon="play_arrow" loading={running} onClick={handleRun}>
              Run
            </Button>
            {customCases.length > 0 && (
              <Button size="sm" variant="success" loading={running} onClick={handleRun}>
                Submit
              </Button>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
