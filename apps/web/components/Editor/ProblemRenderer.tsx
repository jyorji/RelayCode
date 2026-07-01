import React from "react";

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const m = match[0];
    if (m.startsWith("`")) {
      parts.push(
        <code key={key++} className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-foreground/90">
          {m.slice(1, -1)}
        </code>
      );
    } else if (m.startsWith("**")) {
      parts.push(<strong key={key++} className="font-semibold text-foreground">{m.slice(2, -2)}</strong>);
    } else {
      parts.push(<em key={key++}>{m.slice(1, -1)}</em>);
    }
    lastIndex = match.index + m.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function TextBlock({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    if (line.startsWith("### ")) {
      elements.push(<h3 key={key++} className="font-semibold text-foreground">{renderInline(line.slice(4))}</h3>);
      i++; continue;
    }
    if (line.startsWith("## ")) {
      elements.push(<h2 key={key++} className="font-semibold text-foreground">{renderInline(line.slice(3))}</h2>);
      i++; continue;
    }
    if (line.startsWith("# ")) {
      elements.push(<h2 key={key++} className="text-base font-semibold text-foreground">{renderInline(line.slice(2))}</h2>);
      i++; continue;
    }

    if (/^[-*]\s/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(<li key={i}>{renderInline(lines[i].slice(2))}</li>);
        i++;
      }
      elements.push(<ul key={key++} className="ml-5 list-disc space-y-1">{items}</ul>);
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(<li key={i}>{renderInline(lines[i].replace(/^\d+\.\s/, ""))}</li>);
        i++;
      }
      elements.push(<ol key={key++} className="ml-5 list-decimal space-y-1">{items}</ol>);
      continue;
    }

    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^[#\-*]/.test(lines[i]) &&
      !/^\d+\./.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      elements.push(<p key={key++}>{renderInline(paraLines.join(" "))}</p>);
    }
  }

  return <>{elements}</>;
}

export function ProblemRenderer({ description }: { description: string }) {
  const blocks: Array<{ type: "code" | "text"; content: string }> = [];
  const fenceRe = /```(?:\w*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = fenceRe.exec(description)) !== null) {
    if (m.index > last) blocks.push({ type: "text", content: description.slice(last, m.index) });
    blocks.push({ type: "code", content: m[1] });
    last = m.index + m[0].length;
  }
  if (last < description.length) blocks.push({ type: "text", content: description.slice(last) });

  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed text-foreground/90">
      {blocks.map((block, bi) =>
        block.type === "code" ? (
          <pre key={bi} className="overflow-x-auto rounded-lg border border-border bg-secondary/30 px-4 py-3 font-mono text-xs">
            {block.content.trim()}
          </pre>
        ) : (
          <TextBlock key={bi} content={block.content} />
        )
      )}
    </div>
  );
}
