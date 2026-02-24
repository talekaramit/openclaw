import type { OpenClawConfig } from "../../config/config.js";
import { loadConfig, writeConfigFile } from "../../config/config.js";
import { normalizeSecretInput } from "../../utils/normalize-secret-input.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

type Scope = "app" | "agent";
type Target = "sandbox" | "skills" | "exec";

const DEFAULT_SECRET_TARGETS: Target[] = ["sandbox", "skills"];

function nextConfig(cfg: OpenClawConfig): OpenClawConfig {
  return {
    ...cfg,
    secrets: {
      ...cfg.secrets,
      app: { ...cfg.secrets?.app },
      agents: { ...cfg.secrets?.agents },
    },
  };
}

export const secretsHandlers: GatewayRequestHandlers = {
  "secrets.list": ({ params, respond }) => {
    const cfg = loadConfig();
    const agentId = typeof params?.agentId === "string" ? params.agentId.trim() : "";
    const app = Object.entries(cfg.secrets?.app ?? {}).map(([key, value]) => ({
      key,
      scope: "app",
      targets: value.targets ?? ["sandbox", "skills"],
      allowHostExec: value.allowHostExec === true,
      hasValue: Boolean(value.value),
    }));
    const agent = agentId
      ? Object.entries(cfg.secrets?.agents?.[agentId] ?? {}).map(([key, value]) => ({
          key,
          scope: "agent",
          agentId,
          targets: value.targets ?? ["sandbox", "skills"],
          allowHostExec: value.allowHostExec === true,
          hasValue: Boolean(value.value),
        }))
      : [];
    respond(true, { secrets: [...app, ...agent] }, undefined);
  },
  "secrets.set": async ({ params, respond, context }) => {
    const scope = (params?.scope === "agent" ? "agent" : "app") as Scope;
    const key = typeof params?.key === "string" ? params.key.trim() : "";
    const value = typeof params?.value === "string" ? normalizeSecretInput(params.value) : "";
    const agentId = typeof params?.agentId === "string" ? params.agentId.trim() : "";
    const targetsRaw = Array.isArray(params?.targets) ? params.targets : [];
    const targets = targetsRaw.filter(
      (x): x is Target => x === "sandbox" || x === "skills" || x === "exec",
    );
    if (!key) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "missing key"));
      return;
    }
    if (!value) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "missing value"));
      return;
    }
    if (scope === "agent" && !agentId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "missing agentId for agent scope"),
      );
      return;
    }
    const cfg = nextConfig(loadConfig());
    const entry = {
      value,
      targets: targets.length > 0 ? targets : DEFAULT_SECRET_TARGETS,
      allowHostExec: params?.allowHostExec === true,
    };
    if (scope === "app") {
      cfg.secrets!.app![key] = entry;
    } else {
      cfg.secrets!.agents![agentId] = { ...cfg.secrets!.agents![agentId], [key]: entry };
    }
    await writeConfigFile(cfg);
    context.logGateway.info(
      `audit secrets set scope=${scope}${agentId ? ` agent=${agentId}` : ""} key=${key}`,
    );
    respond(true, { ok: true }, undefined);
  },
  "secrets.delete": async ({ params, respond, context }) => {
    const scope = (params?.scope === "agent" ? "agent" : "app") as Scope;
    const key = typeof params?.key === "string" ? params.key.trim() : "";
    const agentId = typeof params?.agentId === "string" ? params.agentId.trim() : "";
    const cfg = nextConfig(loadConfig());
    if (scope === "app") {
      delete cfg.secrets!.app![key];
    } else if (agentId) {
      const agentSecrets = cfg.secrets!.agents![agentId] ?? {};
      delete agentSecrets[key];
      cfg.secrets!.agents![agentId] = agentSecrets;
    }
    await writeConfigFile(cfg);
    context.logGateway.info(
      `audit secrets delete scope=${scope}${agentId ? ` agent=${agentId}` : ""} key=${key}`,
    );
    respond(true, { ok: true }, undefined);
  },
  "secrets.assign": async ({ params, respond, context }) => {
    const scope = (params?.scope === "agent" ? "agent" : "app") as Scope;
    const key = typeof params?.key === "string" ? params.key.trim() : "";
    const target = params?.target;
    const enabled = params?.enabled !== false;
    const agentId = typeof params?.agentId === "string" ? params.agentId.trim() : "";
    if (!(target === "sandbox" || target === "skills" || target === "exec")) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "invalid target"));
      return;
    }
    const cfg = nextConfig(loadConfig());
    const holder = scope === "app" ? cfg.secrets!.app! : (cfg.secrets!.agents![agentId] ?? {});
    const current = holder[key];
    if (!current?.value) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "secret not found"));
      return;
    }
    const set = new Set<Target>(current.targets ?? DEFAULT_SECRET_TARGETS);
    if (enabled) {
      set.add(target);
    } else {
      set.delete(target);
    }
    holder[key] = { ...current, targets: [...set] };
    if (scope === "agent") {
      cfg.secrets!.agents![agentId] = holder;
    }
    await writeConfigFile(cfg);
    context.logGateway.info(
      `audit secrets assign scope=${scope}${agentId ? ` agent=${agentId}` : ""} key=${key} target=${target} enabled=${enabled}`,
    );
    respond(true, { ok: true }, undefined);
  },
};
