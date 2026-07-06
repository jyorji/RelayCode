"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  IconButton,
  Badge,
  Input,
  Label,
  Select,
  Switch,
  List,
  ListItem,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "forge-ui";
import { formatDistanceToNow } from "date-fns";

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

const STATUS_VARIANT: Record<string, "warning" | "success" | "secondary"> = {
  WAITING: "warning",
  ACTIVE: "success",
  ENDED: "secondary",
};

interface Session {
  id: string;
  title: string;
  language: string;
  status: string;
  createdAt: string;
  endedAt?: string | null;
  duration?: number | null;
  allowAutocomplete: boolean;
  allowLanguageChange: boolean;
  problemId?: string | null;
  problem: { title: string; difficulty: string } | null;
}

interface ProblemOption {
  id: string;
  title: string;
  difficulty: string;
}

interface SessionForm {
  title: string;
  language: string;
  allowAutocomplete: boolean;
  allowLanguageChange: boolean;
  problemId: string;
  duration: string;
}

const DEFAULT_FORM: SessionForm = {
  title: "",
  language: "javascript",
  allowAutocomplete: true,
  allowLanguageChange: true,
  problemId: "",
  duration: "",
};

function SessionFormFields({
  form,
  onChange,
  titleError,
  problems,
}: {
  form: SessionForm;
  onChange: (patch: Partial<SessionForm>) => void;
  titleError?: string;
  problems: ProblemOption[];
}) {
  const problemOptions = [
    { value: "", label: "No problem" },
    ...problems.map((p) => ({ value: p.id, label: `${p.title} · ${p.difficulty.charAt(0) + p.difficulty.slice(1).toLowerCase()}` })),
  ];

  return (
    <div className="flex flex-col gap-4 px-6 py-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="session-title" required>Title</Label>
        <Input
          id="session-title"
          placeholder="e.g. Frontend Interview Round 1"
          value={form.title}
          onChange={(e) => onChange({ title: e.target.value })}
          invalid={!!titleError}
        />
        {titleError && <p className="text-sm text-destructive">{titleError}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Problem</Label>
        <Select
          options={problemOptions}
          value={form.problemId}
          onChange={(v) => onChange({ problemId: v })}
          placeholder="No problem"
          clearable
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Language</Label>
        <Select
          options={LANGUAGE_OPTIONS}
          value={form.language}
          onChange={(v) => onChange({ language: v })}
          searchable={false}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Time Limit (minutes)</Label>
        <Input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="No limit"
          value={form.duration}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "");
            onChange({ duration: v });
          }}
        />
      </div>
      <div className="flex flex-col gap-3">
        <Label>Restrictions</Label>
        <Switch
          label="Allow autocomplete"
          checked={form.allowAutocomplete}
          onChange={(e) => onChange({ allowAutocomplete: e.target.checked })}
        />
        <Switch
          label="Allow language change"
          checked={form.allowLanguageChange}
          onChange={(e) => onChange({ allowLanguageChange: e.target.checked })}
        />
      </div>
    </div>
  );
}

function CreateSessionDialog({ problems }: { problems: ProblemOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<SessionForm>(DEFAULT_FORM);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const handleOpenChange = useCallback((v: boolean) => {
    if (!v) { setOpen(false); setForm(DEFAULT_FORM); setError(""); }
    else setOpen(true);
  }, []);

  async function handleCreate() {
    if (!form.title.trim()) { setError("Title is required"); return; }
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, duration: form.duration ? parseInt(form.duration, 10) : null }),
      });
      if (!res.ok) { setError((await res.json()).error ?? "Failed to create session"); return; }
      const created = await res.json();
      router.push(`/session/${created.id}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button leftIcon="add" onClick={() => setOpen(true)}>New Session</Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Session</DialogTitle>
          <DialogDescription>Create a new collaborative coding session.</DialogDescription>
        </DialogHeader>
        <SessionFormFields form={form} onChange={(p) => setForm((f) => ({ ...f, ...p }))} titleError={error} problems={problems} />
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button loading={creating} onClick={handleCreate}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditSessionDialog({
  session,
  problems,
  onSave,
  onClose,
}: {
  session: Session | null;
  problems: ProblemOption[];
  onSave: (form: SessionForm) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<SessionForm>(DEFAULT_FORM);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (session) {
      setForm({ title: session.title, language: session.language, allowAutocomplete: session.allowAutocomplete, allowLanguageChange: session.allowLanguageChange, problemId: session.problemId ?? "", duration: session.duration ? String(session.duration) : "" });
      setError("");
    }
  }, [session?.id]);

  const handleOpenChange = useCallback((v: boolean) => { if (!v) onClose(); }, [onClose]);

  async function handleSave() {
    if (!form.title.trim()) { setError("Title is required"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/sessions/${session!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, duration: form.duration ? parseInt(form.duration, 10) : null }),
      });
      if (!res.ok) {
        let msg = "Failed to save";
        try { msg = (await res.json()).error ?? msg; } catch { /* non-JSON */ }
        setError(msg);
        return;
      }
      onSave(form);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!session} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Session</DialogTitle>
          <DialogDescription>Update session settings.</DialogDescription>
        </DialogHeader>
        <SessionFormFields form={form} onChange={(p) => setForm((f) => ({ ...f, ...p }))} titleError={error} problems={problems} />
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button loading={saving} onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteSessionDialog({
  session,
  onDeleted,
  onClose,
}: {
  session: Session | null;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleOpenChange = useCallback((v: boolean) => { if (!v) onClose(); }, [onClose]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/sessions/${session!.id}`, { method: "DELETE" });
      onDeleted(session!.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={!!session} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Session</DialogTitle>
          <DialogDescription>
            Delete &ldquo;{session?.title}&rdquo;? This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button variant="destructive" loading={deleting} onClick={handleDelete}>Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SessionsDashboard({ sessions: initial, problems }: { sessions: Session[]; problems: ProblemOption[] }) {
  const router = useRouter();
  const [sessions, setSessions] = useState(initial);
  const [editTarget, setEditTarget] = useState<Session | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Session | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function handleCopyLink(id: string) {
    const url = `${window.location.origin}/session/${id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
    });
  }

  return (
    <main className="flex flex-1 flex-col overflow-y-auto px-6 py-8 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Sessions</h1>
        <CreateSessionDialog problems={problems} />
      </div>

      <List
        bordered
        empty={
          <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <p className="font-medium">No sessions yet</p>
            <p className="text-sm">Click &ldquo;New Session&rdquo; to get started.</p>
          </div>
        }
      >
        {sessions.map((s) => (
          <ListItem
            key={s.id}
            title={s.title}
            description={s.problem ? s.problem.title : `Created ${formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })}`}
            meta={
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <span className="text-xs text-muted-foreground capitalize">{s.language}</span>
                <Badge variant={STATUS_VARIANT[s.status] ?? "secondary"}>
                  {s.status.charAt(0) + s.status.slice(1).toLowerCase()}
                </Badge>
                {s.status === "ENDED" && (
                  <IconButton icon="play_circle" size="sm" variant="ghost" onClick={() => router.push(`/replay/${s.id}`)} />
                )}
                <IconButton icon={copiedId === s.id ? "check" : "link"} size="sm" variant="ghost" onClick={() => handleCopyLink(s.id)} />
                <IconButton icon="edit" size="sm" variant="ghost" onClick={() => setEditTarget(s)} />
                <IconButton icon="delete" size="sm" variant="destructive" onClick={() => setDeleteTarget(s)} />
              </div>
            }
            onSelect={() => router.push(`/session/${s.id}`)}
          />
        ))}
      </List>

      <EditSessionDialog
        session={editTarget}
        problems={problems}
        onSave={(form) => {
          setSessions((prev) => prev.map((s) => s.id === editTarget!.id ? { ...s, ...form, duration: form.duration ? parseInt(form.duration, 10) : null } : s));
          setEditTarget(null);
        }}
        onClose={() => setEditTarget(null)}
      />

      <DeleteSessionDialog
        session={deleteTarget}
        onDeleted={(id) => { setSessions((prev) => prev.filter((s) => s.id !== id)); setDeleteTarget(null); }}
        onClose={() => setDeleteTarget(null)}
      />
    </main>
  );
}
