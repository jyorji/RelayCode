"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { IconButton } from "forge-ui";
import { formatDistanceStrict } from "date-fns";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

const MONACO_LANG: Record<string, string> = {
  javascript: "javascript",
  typescript: "typescript",
  python: "python",
  java: "java",
  cpp: "cpp",
  c: "c",
  go: "go",
  ruby: "ruby",
};

export interface ReplayEvent {
  id: string;
  type: string;
  payload: unknown;
  offsetMs: number;
}

interface Session {
  id: string;
  title: string;
  language: string;
  startedAt: string | null;
  endedAt: string | null;
}

function formatMs(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function ReplayClient({ session, events }: { session: Session; events: ReplayEvent[] }) {
  const router = useRouter();

  const maxMs = useMemo(() => {
    if (session.startedAt && session.endedAt) {
      return Math.max(new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime(), 1000);
    }
    return Math.max(events.at(-1)?.offsetMs ?? 0, 1000);
  }, [session, events]);

  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  useEffect(() => {
    if (!playing) return;
    const TICK = 100;
    const id = setInterval(() => {
      setPosition((prev) => {
        const next = prev + TICK * speedRef.current;
        if (next >= maxMs) { setPlaying(false); return maxMs; }
        return next;
      });
    }, TICK);
    return () => clearInterval(id);
  }, [playing, maxMs]);

  const SPEEDS = [1, 2, 4, 8];

  const { currentCode, currentLanguage, currentComments } = useMemo(() => {
    let code = "";
    let language = session.language;
    const comments: { id: string; text: string; offsetMs: number }[] = [];

    for (const e of events) {
      if (e.offsetMs > position) break;
      const p = e.payload as Record<string, unknown>;
      if (e.type === "KEYSTROKE" || e.type === "CODE_RUN") {
        code = String(p.code ?? code);
      } else if (e.type === "LANGUAGE_CHANGE") {
        language = String(p.language ?? language);
      } else if (e.type === "COMMENT") {
        comments.push({ id: e.id, text: String(p.text ?? ""), offsetMs: e.offsetMs });
      }
    }

    return { currentCode: code, currentLanguage: language, currentComments: comments };
  }, [events, position, session.language]);

  // ponytail: any is fine — monaco-editor types aren't in scope here, only needed for revealLine
  const editorRef = useRef<any>(null);

  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.revealLine(ed.getModel()?.getLineCount() ?? 1);
  }, [currentCode]);

  const codeRunEvents = useMemo(() => events.filter(e => e.type === "CODE_RUN"), [events]);
  const focusEvents = useMemo(
    () => events.filter(e => e.type === "FOCUS_CHANGE"),
    [events],
  );

  const duration =
    session.startedAt && session.endedAt
      ? formatDistanceStrict(new Date(session.startedAt), new Date(session.endedAt))
      : null;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3 shrink-0">
        <IconButton icon="arrow_back" variant="ghost" size="sm" onClick={() => router.push("/")} />
        <h1 className="font-semibold truncate">{session.title}</h1>
        {duration && <span className="text-sm text-muted-foreground shrink-0">· {duration}</span>}
      </div>

      <div className="flex-1 min-h-0">
        {events.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            No replay data recorded for this session.
          </div>
        ) : (
          <MonacoEditor
            height="100%"
            language={MONACO_LANG[currentLanguage] ?? currentLanguage}
            value={currentCode}
            onMount={(ed) => { editorRef.current = ed; }}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 14,
              wordWrap: "on",
            }}
            theme="vs-dark"
          />
        )}
      </div>

      <div className="border-t border-border px-4 pt-3 pb-2 shrink-0">
        <div style={{ position: "relative", height: "16px", marginBottom: "2px" }}>
          {codeRunEvents.map(e => (
            <div key={e.id} title={`Code run at ${formatMs(e.offsetMs)}`} style={{
              position: "absolute", top: 0,
              left: `${Math.min((e.offsetMs / maxMs) * 100, 100)}%`,
              transform: "translateX(-50%)",
              width: "3px", height: "16px", backgroundColor: "#fbbf24", borderRadius: "2px",
            }} />
          ))}
          {focusEvents.map(e => {
            const p = e.payload as { away: boolean; reason: string };
            const label = p.away
              ? `Left ${p.reason === "tab" ? "tab" : "window"} at ${formatMs(e.offsetMs)}`
              : `Returned to ${p.reason === "tab" ? "tab" : "window"} at ${formatMs(e.offsetMs)}`;
            return (
              <div key={e.id} title={label} style={{
                position: "absolute", top: 0,
                left: `${Math.min((e.offsetMs / maxMs) * 100, 100)}%`,
                transform: "translateX(-50%)",
                width: "4px", height: "16px",
                backgroundColor: p.away ? "#ef4444" : "#22c55e",
                borderRadius: "2px",
              }} />
            );
          })}
        </div>
        <input
          type="range"
          min={0}
          max={maxMs}
          value={position}
          onChange={e => { setPlaying(false); setPosition(Number(e.target.value)); }}
          className="w-full"
        />
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-muted-foreground">{formatMs(position)}</span>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5">
              {SPEEDS.map(s => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className="px-1.5 py-0.5 rounded text-xs font-medium transition-colors text-muted-foreground"
                  style={speed === s ? { backgroundColor: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' } : undefined}
                >
                  {s}×
                </button>
              ))}
            </div>
            <IconButton
              icon={playing ? "pause" : "play_arrow"}
              size="sm"
              variant="ghost"
              onClick={() => { if (position >= maxMs) setPosition(0); setPlaying(v => !v); }}
            />
          </div>
          <span className="text-xs text-muted-foreground">{formatMs(maxMs)}</span>
        </div>
        {(codeRunEvents.length > 0 || focusEvents.length > 0) && (
          <div className="flex items-center gap-3 mt-1">
            {codeRunEvents.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-zinc-400">
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, backgroundColor: "#fbbf24" }} />
                Code run
              </span>
            )}
            {focusEvents.some(e => (e.payload as { away: boolean }).away) && (
              <span className="flex items-center gap-1 text-xs text-zinc-400">
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, backgroundColor: "#ef4444" }} />
                Left tab/window
              </span>
            )}
            {focusEvents.some(e => !(e.payload as { away: boolean }).away) && (
              <span className="flex items-center gap-1 text-xs text-zinc-400">
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, backgroundColor: "#22c55e" }} />
                Returned
              </span>
            )}
          </div>
        )}
      </div>

      {currentComments.length > 0 && (
        <div className="border-t border-border px-4 py-3 max-h-36 overflow-y-auto shrink-0">
          <p className="text-xs font-medium text-muted-foreground mb-2">Comments</p>
          <div className="flex flex-col gap-1.5">
            {currentComments.map(c => (
              <div key={c.id} className="text-sm flex gap-2">
                <span className="text-xs text-muted-foreground shrink-0 pt-0.5">{formatMs(c.offsetMs)}</span>
                <span>{c.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
