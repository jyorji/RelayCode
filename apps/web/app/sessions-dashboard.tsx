"use client";

import { useState } from "react";
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
}

const DEFAULT_FORM: SessionForm = {
  title: "",
  language: "javascript",
  allowAutocomplete: true,
  allowLanguageChange: true,
  problemId: "",
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

export function SessionsDashboard({ sessions: initial, problems }: { sessions: Session[]; problems: ProblemOption[] }) {
  const router = useRouter();
  const [sessions, setSessions] = useState(initial);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<SessionForm>(DEFAULT_FORM);
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  const [editTarget, setEditTarget] = useState<Session | null>(null);
  const [editForm, setEditForm] = useState<SessionForm>(DEFAULT_FORM);
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Session | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  function handleCopyLink(id: string) {
    const url = `${window.location.origin}/session/${id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
    });
  }

  function openEdit(s: Session) {
    setEditTarget(s);
    setEditForm({ title: s.title, language: s.language, allowAutocomplete: s.allowAutocomplete, allowLanguageChange: s.allowLanguageChange, problemId: s.problemId ?? "" });
    setEditError("");
  }

  function closeCreate() {
    setCreateOpen(false);
    setCreateForm(DEFAULT_FORM);
    setCreateError("");
  }

  async function handleCreate() {
    if (!createForm.title.trim()) { setCreateError("Title is required"); return; }
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      if (!res.ok) { setCreateError((await res.json()).error ?? "Failed to create session"); return; }
      const created = await res.json();
      router.push(`/session/${created.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleSave() {
    if (!editForm.title.trim()) { setEditError("Title is required"); return; }
    setSaving(true);
    setEditError("");
    try {
      const res = await fetch(`/api/sessions/${editTarget!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) {
        let msg = "Failed to save";
        try { msg = (await res.json()).error ?? msg; } catch { /* non-JSON error body */ }
        setEditError(msg);
        return;
      }
      const updated = await res.json();
      setSessions((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...editForm } : s)));
      setEditTarget(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/sessions/${deleteTarget!.id}`, { method: "DELETE" });
      setSessions((prev) => prev.filter((s) => s.id !== deleteTarget!.id));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col overflow-y-auto px-6 py-8 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Sessions</h1>

        {/* Create dialog */}
        <Dialog open={createOpen} onOpenChange={(v) => { if (!v) closeCreate(); else setCreateOpen(true); }}>
          <Button leftIcon="add" onClick={() => setCreateOpen(true)}>New Session</Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Session</DialogTitle>
              <DialogDescription>Create a new collaborative coding session.</DialogDescription>
            </DialogHeader>
            <SessionFormFields form={createForm} onChange={(p) => setCreateForm((f) => ({ ...f, ...p }))} titleError={createError} problems={problems} />
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
              <Button loading={creating} onClick={handleCreate}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
                <IconButton icon={copiedId === s.id ? "check" : "link"} size="sm" variant="ghost" onClick={() => handleCopyLink(s.id)} />
                <IconButton icon="edit" size="sm" variant="ghost" onClick={() => openEdit(s)} />
                <IconButton icon="delete" size="sm" variant="destructive" onClick={() => setDeleteTarget(s)} />
              </div>
            }
            onSelect={() => router.push(`/session/${s.id}`)}
          />
        ))}
      </List>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(v) => { if (!v) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Session</DialogTitle>
            <DialogDescription>Update session settings.</DialogDescription>
          </DialogHeader>
          <SessionFormFields form={editForm} onChange={(p) => setEditForm((f) => ({ ...f, ...p }))} titleError={editError} problems={problems} />
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button loading={saving} onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Session</DialogTitle>
            <DialogDescription>
              Delete &ldquo;{deleteTarget?.title}&rdquo;? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button variant="destructive" loading={deleting} onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
