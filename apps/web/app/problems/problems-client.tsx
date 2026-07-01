"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  IconButton,
  Input,
  Label,
  List,
  ListItem,
  Select,
  Textarea,
} from "forge-ui";

const DIFFICULTY_VARIANT: Record<string, "success" | "warning" | "destructive"> = {
  EASY: "success",
  MEDIUM: "warning",
  HARD: "destructive",
};

const DIFFICULTY_OPTIONS = [
  { value: "EASY", label: "Easy" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HARD", label: "Hard" },
];

interface Problem {
  id: string;
  title: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  tags: string[];
  createdAt: string;
}

interface StructuredDescription {
  statement: string;
  examples: { input: string; output: string; explanation?: string }[];
  constraints: string[];
}

interface GeneratedProblem {
  title: string;
  description: StructuredDescription;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  tags: string[];
  starterCode: Record<string, string>;
  testCases: { input: string; expected: string }[];
}

function structuredDescToMarkdown(desc: StructuredDescription): string {
  let md = desc.statement.trim();
  desc.examples.forEach((ex, i) => {
    md += `\n\n## Example ${i + 1}:\n\n\`\`\`\nInput: ${ex.input}\nOutput: ${ex.output}`;
    if (ex.explanation) md += `\nExplanation: ${ex.explanation}`;
    md += `\n\`\`\``;
  });
  if (desc.constraints.length > 0) {
    md += `\n\n## Constraints:\n\n` + desc.constraints.map((c) => `- ${c}`).join("\n");
  }
  return md;
}

export function ProblemsClient({ problems: initial }: { problems: Problem[] }) {
  const [problems, setProblems] = useState(initial);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");

  const [generated, setGenerated] = useState<GeneratedProblem | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [difficulty, setDifficulty] = useState<"EASY" | "MEDIUM" | "HARD">("MEDIUM");
  const [tags, setTags] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<Problem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  function resetDialog() {
    setPrompt("");
    setGenerating(false);
    setGenerateError("");
    setGenerated(null);
    setTitle("");
    setDescription("");
    setDifficulty("MEDIUM");
    setTags("");
    setSaveError("");
  }

  async function handleGenerate() {
    if (!prompt.trim()) { setGenerateError("Please describe the problem you want to create."); return; }
    setGenerating(true);
    setGenerateError("");
    setGenerated(null);
    try {
      const res = await fetch("/api/ai/generate-problem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setGenerateError(json.error ?? "Generation failed. Please try again.");
        return;
      }
      const data: GeneratedProblem = await res.json();
      setGenerated(data);
      setTitle(data.title);
      setDescription(structuredDescToMarkdown(data.description));
      setDifficulty(data.difficulty);
      setTags(data.tags.join(", "));
    } catch {
      setGenerateError("Network error. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!title.trim() || !description.trim()) { setSaveError("Title and description are required."); return; }
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/problems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          difficulty,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          starterCode: generated?.starterCode ?? {},
          testCases: generated?.testCases ?? [],
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setSaveError(json.error ?? "Failed to save problem.");
        return;
      }
      const created = await res.json();
      setProblems((prev) => [
        { id: created.id, title: created.title, difficulty: created.difficulty, tags: created.tags, createdAt: created.createdAt },
        ...prev,
      ]);
      setDialogOpen(false);
      resetDialog();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch(`/api/problems/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setDeleteError((json as { error?: string }).error ?? "Failed to delete problem.");
        return;
      }
      setProblems((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      setDeleteError("Network error. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-y-auto px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Problem Library</h1>

        <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) { setDialogOpen(false); resetDialog(); } else setDialogOpen(true); }}>
          <Button leftIcon="add" onClick={() => setDialogOpen(true)}>New Problem</Button>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>New Problem</DialogTitle>
              <DialogDescription>Describe what you want and AI will generate a complete problem for you.</DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-5 px-6 py-4">
              {/* AI prompt section */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="ai-prompt">Describe the problem</Label>
                <Textarea
                  id="ai-prompt"
                  placeholder='e.g. "A medium difficulty graph problem about finding the shortest path using BFS"'
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={3}
                  invalid={!!generateError && !generated}
                />
                {generateError && <p className="text-sm text-destructive">{generateError}</p>}
                <Button
                  variant="secondary"
                  leftIcon="auto_awesome"
                  loading={generating}
                  onClick={handleGenerate}
                  className="self-start"
                >
                  {generating ? "Generating…" : "Generate with AI"}
                </Button>
              </div>

              {/* Editable fields — shown after generation */}
              {generated && (
                <div className="flex flex-col gap-4 border-t border-border pt-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Review &amp; edit before saving</p>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="prob-title" required>Title</Label>
                    <Input id="prob-title" value={title} onChange={(e) => setTitle(e.target.value)} />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Label>Difficulty</Label>
                      <Select
                        options={DIFFICULTY_OPTIONS}
                        value={difficulty}
                        onChange={(v) => setDifficulty(v as "EASY" | "MEDIUM" | "HARD")}
                        searchable={false}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="prob-tags">Tags</Label>
                      <Input
                        id="prob-tags"
                        value={tags}
                        onChange={(e) => setTags(e.target.value)}
                        placeholder="array, two-pointers"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="prob-desc" required>Description</Label>
                    <Textarea
                      id="prob-desc"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={8}
                      className="font-mono text-xs"
                    />
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Starter code ({Object.keys(generated.starterCode).join(", ")}) and {generated.testCases.length} test cases were generated and will be saved automatically.
                  </p>
                </div>
              )}

              {saveError && <p className="text-sm text-destructive">{saveError}</p>}
            </div>

            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
              <Button loading={saving} disabled={!generated} onClick={handleSave}>Save Problem</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <List
        bordered
        empty={
          <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <p className="font-medium">No problems yet</p>
            <p className="text-sm">Click &ldquo;New Problem&rdquo; to generate your first one with AI.</p>
          </div>
        }
      >
        {problems.map((p) => (
          <ListItem
            key={p.id}
            title={p.title}
            description={p.tags.length > 0 ? p.tags.join(" · ") : undefined}
            meta={
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <Badge variant={DIFFICULTY_VARIANT[p.difficulty]}>
                  {p.difficulty.charAt(0) + p.difficulty.slice(1).toLowerCase()}
                </Badge>
                <IconButton icon="delete" size="sm" variant="destructive" onClick={() => { setDeleteTarget(p); setDeleteError(""); }} />
              </div>
            }
          />
        ))}
      </List>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) { setDeleteTarget(null); setDeleteError(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Problem</DialogTitle>
            <DialogDescription>
              Delete &ldquo;{deleteTarget?.title}&rdquo;? Sessions using this problem will lose their problem link.
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p className="px-6 text-sm text-destructive">{deleteError}</p>}
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button variant="destructive" loading={deleting} onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
