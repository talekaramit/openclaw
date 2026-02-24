import { randomUUID } from "node:crypto";
import { createOpenClawCodingTools } from "../agents/pi-tools.js";
import { resolveSandboxContext } from "../agents/sandbox.js";
import {
  countActiveDescendantRuns,
  listDescendantRunsForRequester,
  markSubagentRunTerminated,
} from "../agents/subagent-registry.js";
import { spawnSubagentDirect, type SpawnSubagentResult } from "../agents/subagent-spawn.js";
import { loadConfig, type OpenClawConfig } from "../config/config.js";
import type { AgenticAppConfig } from "../config/types.agentic-app.js";

export type AgenticAppToolBundles = {
  file: boolean;
  browser: boolean;
  exec: boolean;
  api: boolean;
};

export type AgenticAppResolvedConfig = {
  sandbox: Required<NonNullable<AgenticAppConfig["sandbox"]>>;
  tools: { bundles: AgenticAppToolBundles };
  subagents: Required<NonNullable<AgenticAppConfig["subagents"]>>;
  ui: Required<NonNullable<AgenticAppConfig["ui"]>>;
  auth: Required<NonNullable<AgenticAppConfig["auth"]>>;
};

export type AgenticAppRunState = "created" | "running" | "stopped";

export type AgenticAppRunRecord = {
  runId: string;
  sessionKey: string;
  agentId: string;
  createdAt: number;
  startedAt?: number;
  stoppedAt?: number;
  state: AgenticAppRunState;
  config: AgenticAppResolvedConfig;
  sandboxed: boolean;
  toolNames: string[];
  activeSubagents: number;
  lastSpawn?: SpawnSubagentResult;
};

type RuntimeEntry = {
  record: AgenticAppRunRecord;
  stopController: AbortController;
};

const runtimeRuns = new Map<string, RuntimeEntry>();

const FILE_TOOL_NAMES = new Set(["read", "write", "edit", "apply_patch", "image"]);

function includeToolByBundle(toolName: string, bundles: AgenticAppToolBundles): boolean {
  if (FILE_TOOL_NAMES.has(toolName) || toolName.startsWith("glob") || toolName.startsWith("ls")) {
    return bundles.file;
  }
  if (toolName.startsWith("browser") || toolName.includes("screenshot")) {
    return bundles.browser;
  }
  if (toolName === "exec" || toolName === "process") {
    return bundles.exec;
  }
  return bundles.api;
}

export function resolveAgenticAppConfig(config?: OpenClawConfig): AgenticAppResolvedConfig {
  const section = config?.agenticApp;
  return {
    sandbox: {
      defaultProfile: section?.sandbox?.defaultProfile ?? "workspace-write",
      workspaceRoot: section?.sandbox?.workspaceRoot ?? "",
      workspaceMode: section?.sandbox?.workspaceMode ?? "session",
    },
    tools: {
      bundles: {
        file: section?.tools?.bundles?.file ?? true,
        browser: section?.tools?.bundles?.browser ?? true,
        exec: section?.tools?.bundles?.exec ?? true,
        api: section?.tools?.bundles?.api ?? true,
      },
    },
    subagents: {
      maxActiveRuns: section?.subagents?.maxActiveRuns ?? 3,
      routing: section?.subagents?.routing ?? "requester",
    },
    ui: {
      exposeRuns: section?.ui?.exposeRuns ?? true,
      defaultVisibility: section?.ui?.defaultVisibility ?? "operator",
    },
    auth: {
      required: section?.auth?.required ?? true,
      mode: section?.auth?.mode ?? "gateway",
    },
  };
}

function randomRunId() {
  return `app-${randomUUID()}`;
}

export async function createAgenticAppRun(params?: {
  runId?: string;
  sessionKey?: string;
  agentId?: string;
  workspaceDir?: string;
}): Promise<AgenticAppRunRecord> {
  const config = loadConfig();
  const resolvedConfig = resolveAgenticAppConfig(config);
  const runId = params?.runId?.trim() || randomRunId();
  const sessionKey = params?.sessionKey?.trim() || "agent:main";
  const agentId = params?.agentId?.trim() || "main";
  const sandbox = await resolveSandboxContext({
    config,
    sessionKey,
    workspaceDir: params?.workspaceDir,
  });
  const tools = createOpenClawCodingTools({
    config,
    sessionKey,
    agentDir: params?.workspaceDir,
    workspaceDir: params?.workspaceDir,
    sandbox,
  }).filter((tool) => includeToolByBundle(tool.name, resolvedConfig.tools.bundles));

  const record: AgenticAppRunRecord = {
    runId,
    sessionKey,
    agentId,
    createdAt: Date.now(),
    state: "created",
    config: resolvedConfig,
    sandboxed: sandbox != null,
    toolNames: tools.map((tool) => tool.name),
    activeSubagents: countActiveDescendantRuns(sessionKey),
  };
  runtimeRuns.set(runId, {
    record,
    stopController: new AbortController(),
  });
  return record;
}

export function startAgenticAppRun(params: { runId: string }): AgenticAppRunRecord | null {
  const entry = runtimeRuns.get(params.runId);
  if (!entry) {
    return null;
  }
  if (entry.record.state !== "running") {
    entry.record.state = "running";
    entry.record.startedAt = Date.now();
  }
  entry.record.activeSubagents = countActiveDescendantRuns(entry.record.sessionKey);
  return entry.record;
}

export function stopAgenticAppRun(params: {
  runId: string;
  reason?: string;
}): AgenticAppRunRecord | null {
  const entry = runtimeRuns.get(params.runId);
  if (!entry) {
    return null;
  }
  entry.stopController.abort();
  const terminated = markSubagentRunTerminated({
    childSessionKey: entry.record.sessionKey,
    reason: params.reason ?? "agentic-app-stop",
  });
  entry.record.activeSubagents = Math.max(0, entry.record.activeSubagents - terminated);
  entry.record.state = "stopped";
  entry.record.stoppedAt = Date.now();
  return entry.record;
}

export function getAgenticAppRunStatus(params: { runId: string }): AgenticAppRunRecord | null {
  const entry = runtimeRuns.get(params.runId);
  if (!entry) {
    return null;
  }
  entry.record.activeSubagents = countActiveDescendantRuns(entry.record.sessionKey);
  return entry.record;
}

export function listAgenticAppRuns(): AgenticAppRunRecord[] {
  return [...runtimeRuns.values()].map((entry) => ({ ...entry.record }));
}

export async function spawnAgenticAppSubagent(params: {
  runId: string;
  task: string;
  label?: string;
  agentId?: string;
}): Promise<SpawnSubagentResult> {
  const entry = runtimeRuns.get(params.runId);
  if (!entry) {
    return { status: "error", error: `unknown app run: ${params.runId}` };
  }
  const active = countActiveDescendantRuns(entry.record.sessionKey);
  if (active >= entry.record.config.subagents.maxActiveRuns) {
    return {
      status: "forbidden",
      error: `subagent limit reached for app run (${active}/${entry.record.config.subagents.maxActiveRuns})`,
    };
  }
  const spawned = await spawnSubagentDirect(
    {
      task: params.task,
      label: params.label,
      agentId: params.agentId,
      mode: "run",
      cleanup: "keep",
      expectsCompletionMessage: entry.record.config.subagents.routing === "requester",
    },
    {
      agentSessionKey: entry.record.sessionKey,
    },
  );
  entry.record.lastSpawn = spawned;
  entry.record.activeSubagents = countActiveDescendantRuns(entry.record.sessionKey);
  return spawned;
}

export function getAgenticAppRunSubagents(params: { runId: string }) {
  const entry = runtimeRuns.get(params.runId);
  if (!entry) {
    return [];
  }
  return listDescendantRunsForRequester(entry.record.sessionKey);
}
