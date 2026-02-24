import { listDescendantRunsForRequester } from "../../agents/subagent-registry.js";
import {
  resolveInternalSessionKey,
  resolveMainSessionAlias,
} from "../../agents/tools/sessions-helpers.js";
import { createSessionsSendTool } from "../../agents/tools/sessions-send-tool.js";
import { createSubagentsTool } from "../../agents/tools/subagents-tool.js";
import { loadConfig } from "../../config/config.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

type RunState = "queued" | "running" | "completed" | "failed" | "timed_out";

function resolveRunState(entry: {
  startedAt?: number;
  endedAt?: number;
  outcome?: { status?: string; error?: string };
}): RunState {
  if (!entry.startedAt) {
    return "queued";
  }
  if (!entry.endedAt) {
    return "running";
  }
  const status = String(entry.outcome?.status ?? "").toLowerCase();
  const error = String(entry.outcome?.error ?? "").toLowerCase();
  if (status === "ok") {
    return "completed";
  }
  if (status === "timeout" || error.includes("timeout") || error.includes("timed out")) {
    return "timed_out";
  }
  return "failed";
}

function resolveRootSessionKey(raw: unknown) {
  const cfg = loadConfig();
  const { mainKey, alias } = resolveMainSessionAlias(cfg);
  const requested = typeof raw === "string" && raw.trim() ? raw.trim() : mainKey;
  return resolveInternalSessionKey({ key: requested, alias, mainKey });
}

export const subagentsHandlers: GatewayRequestHandlers = {
  "subagents.graph": ({ params, respond }) => {
    const rootSessionKey = resolveRootSessionKey((params as { sessionKey?: unknown }).sessionKey);
    const runs = listDescendantRunsForRequester(rootSessionKey);
    const nodes = runs.map((entry) => {
      const startedAt = entry.startedAt ?? entry.createdAt;
      const endedAt = entry.endedAt;
      return {
        runId: entry.runId,
        parentSessionKey: entry.requesterSessionKey,
        sessionKey: entry.childSessionKey,
        state: resolveRunState(entry),
        task: entry.task,
        label: entry.label,
        model: entry.model,
        runtimeMs: endedAt ? Math.max(0, endedAt - startedAt) : Math.max(0, Date.now() - startedAt),
        tokens: undefined,
        linkedSessionKey: entry.childSessionKey,
        startedAt,
        endedAt,
      };
    });
    respond(true, { rootSessionKey, nodes, ts: Date.now() }, undefined);
  },
  "subagents.action": async ({ params, respond }) => {
    const p = params as {
      sessionKey?: unknown;
      action?: unknown;
      target?: unknown;
      message?: unknown;
    };
    const action = typeof p.action === "string" ? p.action.trim() : "";
    const sessionKey = resolveRootSessionKey(p.sessionKey);
    if (!action) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "action required"));
      return;
    }

    if (action === "kill" || action === "steer") {
      const tool = createSubagentsTool({ agentSessionKey: sessionKey });
      const result = await tool.execute?.("", {
        action,
        target: typeof p.target === "string" ? p.target : undefined,
        message: typeof p.message === "string" ? p.message : undefined,
      });
      respond(true, { ok: true, action, result: result?.details ?? null }, undefined);
      return;
    }

    if (action === "message") {
      const target = typeof p.target === "string" ? p.target.trim() : "";
      const message = typeof p.message === "string" ? p.message : "";
      if (!target || !message.trim()) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "target and message required"),
        );
        return;
      }
      const tool = createSessionsSendTool({ agentSessionKey: sessionKey, sandboxed: true });
      const result = await tool.execute?.("", {
        sessionKey: target,
        message,
      });
      respond(true, { ok: true, action, result: result?.details ?? null }, undefined);
      return;
    }

    respond(
      false,
      undefined,
      errorShape(ErrorCodes.INVALID_REQUEST, `unsupported action: ${action}`),
    );
  },
};
