import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";

const SYSTEM = `You are an expert coding interview problem designer.
Generate a high-quality coding problem from the user's description and return ONLY valid JSON matching this exact schema:
{
  "title": string,
  "description": {
    "statement": string (the problem statement — use \`backticks\` for inline variable names/values, **double asterisks** for bold emphasis on key terms),
    "examples": Array<{
      "input": string (e.g. "s = \\"racecar\\", t = \\"carrace\\""),
      "output": string (e.g. "true"),
      "explanation": string (optional, 1 sentence)
    }>,
    "constraints": string[] (each as a plain string; use \`backticks\` around code values like \`1 <= n <= 10^4\`)
  },
  "difficulty": "EASY" | "MEDIUM" | "HARD",
  "tags": string[] (2-4 lowercase kebab-case topic tags like "array", "two-pointers", "dynamic-programming"),
  "starterCode": {
    "javascript": string,
    "typescript": string,
    "python": string,
    "java": string,
    "cpp": string,
    "c": string,
    "go": string,
    "ruby": string
  },
  "testCases": Array<{ "input": string, "expected": string }> (at least 3 cases: normal, edge, large input)
}

CRITICAL — testCase format rules:
- "input": one argument per line, each line is a raw JSON value. Strings use double-quotes, numbers are plain, arrays use JSON syntax. Separate lines with real newline characters.
  Example for f(s1, s2): input = "\"listen\"\n\"silent\""
  Example for f(nums, target): input = "[2,7,11,15]\n9"
- "expected": a single raw JSON value (string in double-quotes, number, boolean, or array).
  Example: "true" or "0" or "[0,1]"

Starter code rules per language:
- javascript: camelCase function stub, JSDoc param comment, return placeholder
- typescript: same as JS but with explicit type annotations on params and return type
- python: snake_case def stub with type hints
- java: package-private Solution class (do NOT add the public keyword to the class), with one public static method and appropriate types. No main method — the platform injects one automatically.
- cpp: #include headers, solution function with appropriate types
- c: #include headers, solution function with appropriate types (no classes)
- go: package main, import if needed, func solution(...) return type
- ruby: snake_case method def stub

Output nothing but the JSON object. Do not wrap in markdown code blocks.`;

export async function POST(request: Request) {
  const session = await auth0.getSession();
  if (!session?.user.sub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI service not configured" }, { status: 503 });
  }

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message = (err as { error?: { message?: string } }).error?.message ?? "Generation failed";
    return NextResponse.json({ error: message }, { status: res.status });
  }

  const completion = await res.json() as {
    choices: { message: { content: string } }[];
  };
  const text = completion.choices[0]?.message?.content ?? "";
  const data = JSON.parse(text);

  return NextResponse.json(data);
}
