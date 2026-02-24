import type { OpenClawConfig } from "./config.js";

export type SecretTarget = "sandbox" | "skills" | "exec";

type SecretEntry = {
  value?: string;
  targets?: SecretTarget[];
  allowHostExec?: boolean;
};

export type ResolvedSecret = {
  key: string;
  value: string;
  scope: "app" | "agent";
  targets: SecretTarget[];
  allowHostExec: boolean;
};

function normalize(
  entry: SecretEntry | undefined,
): { value: string; targets: SecretTarget[] } | null {
  const value = entry?.value?.trim();
  if (!value) {
    return null;
  }
  const targets = (entry?.targets?.length ? entry.targets : ["sandbox", "skills"]).filter(
    (target): target is SecretTarget =>
      target === "sandbox" || target === "skills" || target === "exec",
  );
  return { value, targets };
}

export function resolveScopedSecrets(
  config: OpenClawConfig | undefined,
  agentId?: string,
): ResolvedSecret[] {
  const app = config?.secrets?.app ?? {};
  const agent = (agentId ? config?.secrets?.agents?.[agentId] : undefined) ?? {};
  const out: ResolvedSecret[] = [];
  for (const [key, raw] of Object.entries(app)) {
    const normalized = normalize(raw);
    if (!normalized) {
      continue;
    }
    out.push({
      key,
      value: normalized.value,
      scope: "app",
      targets: normalized.targets,
      allowHostExec: raw.allowHostExec === true,
    });
  }
  for (const [key, raw] of Object.entries(agent)) {
    const normalized = normalize(raw);
    if (!normalized) {
      continue;
    }
    out.push({
      key,
      value: normalized.value,
      scope: "agent",
      targets: normalized.targets,
      allowHostExec: raw.allowHostExec === true,
    });
  }
  return out;
}

export function resolveScopedSecretEnv(params: {
  config?: OpenClawConfig;
  agentId?: string;
  target: SecretTarget;
  host?: "sandbox" | "gateway" | "node";
}): { env: Record<string, string>; scopes: Array<"app" | "agent"> } {
  const env: Record<string, string> = {};
  const scopes = new Set<"app" | "agent">();
  for (const secret of resolveScopedSecrets(params.config, params.agentId)) {
    if (!secret.targets.includes(params.target)) {
      continue;
    }
    if (params.target === "exec" && params.host !== "sandbox" && !secret.allowHostExec) {
      continue;
    }
    env[secret.key] = secret.value;
    scopes.add(secret.scope);
  }
  return { env, scopes: [...scopes] };
}
