import type { AgentConfig } from "../config/types.agents.js";
import type {
  AgentToolsConfig,
  ExecToolConfig,
  FsToolsConfig,
  SessionsToolsVisibility,
  ToolConfigPresetId,
  ToolsConfig,
} from "../config/types.tools.js";

type ToolConfigPreset = {
  tools?: {
    exec?: ExecToolConfig;
    fs?: FsToolsConfig;
    sandbox?: { tools?: { allow?: string[]; deny?: string[] } };
    sessions?: { visibility?: SessionsToolsVisibility };
    subagents?: { tools?: { allow?: string[]; deny?: string[] } };
  };
  sandbox?: { browser?: { allowHostControl?: boolean } };
};

const TOOL_CONFIG_PRESETS: Record<ToolConfigPresetId, ToolConfigPreset> = {
  "container-agent-default": {
    tools: {
      exec: { host: "sandbox", security: "allowlist", ask: "on-miss" },
      fs: { workspaceOnly: true },
      sandbox: { tools: { deny: ["gateway", "agents_list"] } },
      sessions: { visibility: "tree" },
      subagents: { tools: { deny: ["gateway", "agents_list", "sessions_send"] } },
    },
    sandbox: { browser: { allowHostControl: false } },
  },
  "container-agent-restricted": {
    tools: {
      exec: { host: "sandbox", security: "deny", ask: "always" },
      fs: { workspaceOnly: true },
      sandbox: {
        tools: {
          deny: ["exec", "process", "browser", "gateway", "sessions_send", "sessions_spawn"],
        },
      },
      sessions: { visibility: "self" },
      subagents: {
        tools: { deny: ["exec", "process", "browser", "sessions_spawn", "sessions_send"] },
      },
    },
    sandbox: { browser: { allowHostControl: false } },
  },
};

function preferUserList(user?: string[], preset?: string[]) {
  return user ?? preset;
}

function mergeToolsWithPreset(tools: AgentToolsConfig | ToolsConfig, preset: ToolConfigPreset) {
  const presetTools = preset.tools;
  if (!presetTools) {
    return tools;
  }
  return {
    ...tools,
    exec: {
      ...presetTools.exec,
      ...tools.exec,
      applyPatch: {
        ...presetTools.exec?.applyPatch,
        ...tools.exec?.applyPatch,
      },
    },
    fs: { ...presetTools.fs, ...tools.fs },
    sessions: { ...presetTools.sessions, ...tools.sessions },
    subagents: {
      ...presetTools.subagents,
      ...tools.subagents,
      tools: {
        allow: preferUserList(tools.subagents?.tools?.allow, presetTools.subagents?.tools?.allow),
        deny: preferUserList(tools.subagents?.tools?.deny, presetTools.subagents?.tools?.deny),
      },
    },
    sandbox: {
      ...presetTools.sandbox,
      ...tools.sandbox,
      tools: {
        allow: preferUserList(tools.sandbox?.tools?.allow, presetTools.sandbox?.tools?.allow),
        deny: preferUserList(tools.sandbox?.tools?.deny, presetTools.sandbox?.tools?.deny),
      },
    },
  };
}

export function resolveToolConfigPreset(presetId?: string): ToolConfigPreset | undefined {
  if (!presetId) {
    return undefined;
  }
  return TOOL_CONFIG_PRESETS[presetId as ToolConfigPresetId];
}

export function resolvePresetAwareToolsConfig<T extends AgentToolsConfig | ToolsConfig>(
  tools: T | undefined,
  fallbackPresetId?: string,
): T | undefined {
  const presetId = tools?.preset ?? fallbackPresetId;
  const preset = resolveToolConfigPreset(presetId);
  if (!preset) {
    return tools;
  }
  const source = (tools ?? ({ preset: presetId } as T)) as AgentToolsConfig | ToolsConfig;
  return mergeToolsWithPreset(source, preset) as T;
}

export function resolvePresetAwareAgentSandboxConfig(params: {
  sandbox: AgentConfig["sandbox"] | undefined;
  tools: AgentConfig["tools"] | undefined;
  fallbackPresetId?: string;
}): AgentConfig["sandbox"] | undefined {
  const presetId = params.tools?.preset ?? params.fallbackPresetId;
  const preset = resolveToolConfigPreset(presetId);
  if (!preset?.sandbox) {
    return params.sandbox;
  }
  return {
    ...params.sandbox,
    browser: { ...preset.sandbox.browser, ...params.sandbox?.browser },
  };
}
