import axios from "axios";

const LANGUAGE_IDS: Record<string, number> = {
  javascript: 63,
  typescript: 74,
  python: 71,
  java: 62,
  cpp: 54,
  c: 50,
  go: 60,
  ruby: 72,
};

export interface ExecutionResult {
  stdout: string | null;
  stderr: string | null;
  compileOutput: string | null;
  status: string;
  time: string | null;
  memory: number | null;
}

export async function runCode(params: {
  code: string;
  language: string;
  stdin?: string;
}): Promise<ExecutionResult> {
  const languageId = LANGUAGE_IDS[params.language];
  if (!languageId) {
    throw new Error(`Unsupported language for execution: ${params.language}`);
  }

  if (!params.code.trim()) {
    return {
      stdout: null,
      stderr: null,
      compileOutput: null,
      status: "No code to run",
      time: null,
      memory: null,
    };
  }

  const { data } = await axios.post(
    `${process.env.JUDGE0_URL}/submissions`,
    {
      source_code: params.code,
      language_id: languageId,
      stdin: params.stdin ?? "",
      enable_per_process_and_thread_time_limit: true,
      enable_per_process_and_thread_memory_limit: true,
    },
    {
      params: { base64_encoded: "false", wait: "true" },
      timeout: 20_000,
    },
  );

  return {
    stdout: data.stdout,
    stderr: data.stderr,
    compileOutput: data.compile_output,
    status: data.status?.description ?? "Unknown",
    time: data.time,
    memory: data.memory,
  };
}
