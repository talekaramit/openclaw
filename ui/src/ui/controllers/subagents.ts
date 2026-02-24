import type { GatewayBrowserClient } from "../gateway.ts";
import type { SubagentsGraphResult } from "../types.ts";

export async function loadSubagentGraph(params: {
  client: GatewayBrowserClient | null;
  connected: boolean;
  sessionKey?: string;
}): Promise<SubagentsGraphResult | null> {
  if (!params.client || !params.connected) {
    return null;
  }
  return await params.client.request<SubagentsGraphResult>("subagents.graph", {
    sessionKey: params.sessionKey,
  });
}

export async function runSubagentAction(params: {
  client: GatewayBrowserClient | null;
  connected: boolean;
  sessionKey?: string;
  action: "kill" | "steer" | "message";
  target: string;
  message?: string;
}) {
  if (!params.client || !params.connected) {
    return null;
  }
  return await params.client.request("subagents.action", {
    sessionKey: params.sessionKey,
    action: params.action,
    target: params.target,
    message: params.message,
  });
}
