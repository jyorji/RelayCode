"use client";

import { useEffect, useRef, useState } from "react";
import MonacoEditor, { type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { MonacoBinding } from "y-monaco";
import { io, type Socket } from "socket.io-client";
import { Avatar, AvatarGroup, Badge, Button, Input, Label, Select } from "forge-ui";

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

interface PresenceUser {
  userId: string;
  name: string;
  image: string | null;
}

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
  allowAutocomplete = true,
  allowLanguageChange = true,
  isGuest = false,
  currentUserName = null,
  currentUserImage = null,
  currentUserId = null,
}: {
  sessionId: string;
  initialCode?: string;
  allowAutocomplete?: boolean;
  allowLanguageChange?: boolean;
  isGuest?: boolean;
  currentUserName?: string | null;
  currentUserImage?: string | null;
  currentUserId?: string | null;
}) {
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestError, setGuestError] = useState("");
  const [guestJoining, setGuestJoining] = useState(false);
  const [guestToken, setGuestToken] = useState<string | null>(isGuest ? null : "");

  const [language, setLanguage] = useState("javascript");
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const docRef = useRef<Y.Doc | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const pendingRequestId = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  const displayNameRef = useRef<string>(currentUserName ?? "");
  const cursorStyleRef = useRef<HTMLStyleElement | null>(null);
  const widgetsRef = useRef<Map<number, WidgetEntry>>(new Map());
  // Stable per-page-load key stamped into every awareness state this client sends.
  // Lets us filter out our own stale state that lingers after a reconnect (different clientID, same localKey).
  const localKeyRef = useRef<string>(Math.random().toString(36).slice(2));

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
        if (ytext.length === 0 && initialCode) {
          doc.transact(() => ytext.insert(0, initialCode));
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
        pendingRequestId.current = requestId;
        setRunning(true);
        setResult(null);
      });
      socket.on("code:run:result", ({ requestId, result }: { requestId: string; result: RunResult }) => {
        if (pendingRequestId.current !== requestId) return;
        setRunning(false);
        setResult(result);
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
    setLanguage(next);
    socketRef.current?.emit("language:change", { sessionId, language: next });
  }

  function handleRun() {
    const code = editorRef.current?.getValue() ?? "";
    socketRef.current?.emit("code:run", { sessionId, code, language });
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
    <div className="flex h-full flex-col">
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
          <Button size="sm" leftIcon="play_arrow" loading={running} onClick={handleRun}>Run</Button>
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

      {result && (
        <div className="max-h-48 overflow-auto border-t border-border bg-black/90 px-4 py-2 font-mono text-sm text-white">
          <div className="mb-1 text-xs uppercase text-white/50">{result.status}</div>
          {result.stdout && <pre className="whitespace-pre-wrap">{result.stdout}</pre>}
          {result.stderr && <pre className="whitespace-pre-wrap text-red-400">{result.stderr}</pre>}
          {result.compileOutput && <pre className="whitespace-pre-wrap text-yellow-400">{result.compileOutput}</pre>}
        </div>
      )}
    </div>
  );
}
