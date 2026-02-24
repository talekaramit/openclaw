import fs from "node:fs/promises";
import path from "node:path";
import type { Command } from "commander";
import { resolveBundledSkillsContext } from "../../agents/skills/bundled-context.js";
import { ensureAgentWorkspace } from "../../agents/workspace.js";
import {
  detectBrowserOpenSupport,
  openUrl,
  resolveControlUiLinks,
} from "../../commands/onboard-helpers.js";
import {
  loadConfig,
  readConfigFileSnapshot,
  resolveGatewayPort,
  writeConfigFile,
} from "../../config/config.js";
import type { OpenClawConfig } from "../../config/types.js";
import { danger, info, warn } from "../../globals.js";
import { defaultRuntime } from "../../runtime.js";
import { resolveUserPath } from "../../utils.js";
import { callGatewayFromCli, type GatewayRpcOpts } from "../gateway-rpc.js";

type AppInitOpts = GatewayRpcOpts & {
  runId?: string;
  sessionKey?: string;
  agentId?: string;
  workspaceDir?: string;
  container?: boolean;
  open?: boolean;
  json?: boolean;
  seedSkills?: string;
};

const APP_LAYOUT_DIRS = ["tasks", "artifacts", "skills", "logs"] as const;

function mergeContainerDefaults(config: OpenClawConfig): OpenClawConfig {
  const next: OpenClawConfig = { ...config };
  next.tools = {
    ...next.tools,
    preset: next.tools?.preset ?? "container-agent-default",
    exec: {
      ...next.tools?.exec,
      host: next.tools?.exec?.host ?? "sandbox",
      security: next.tools?.exec?.security ?? "allowlist",
      ask: next.tools?.exec?.ask ?? "on-miss",
    },
  };

  next.agents = {
    ...next.agents,
    defaults: {
      ...next.agents?.defaults,
      tools: {
        ...next.agents?.defaults?.tools,
        preset: next.agents?.defaults?.tools?.preset ?? "container-agent-default",
      },
      sandbox: {
        ...next.agents?.defaults?.sandbox,
        mode: next.agents?.defaults?.sandbox?.mode ?? "non-main",
        scope: next.agents?.defaults?.sandbox?.scope ?? "session",
        workspaceAccess: next.agents?.defaults?.sandbox?.workspaceAccess ?? "rw",
        browser: {
          ...next.agents?.defaults?.sandbox?.browser,
          enabled: next.agents?.defaults?.sandbox?.browser?.enabled ?? true,
          autoStart: next.agents?.defaults?.sandbox?.browser?.autoStart ?? true,
        },
      },
    },
  };

  next.agenticApp = {
    ...next.agenticApp,
    sandbox: {
      ...next.agenticApp?.sandbox,
      defaultProfile: next.agenticApp?.sandbox?.defaultProfile ?? "workspace-write",
      workspaceMode: next.agenticApp?.sandbox?.workspaceMode ?? "session",
    },
    tools: {
      ...next.agenticApp?.tools,
      bundles: {
        ...next.agenticApp?.tools?.bundles,
        browser: next.agenticApp?.tools?.bundles?.browser ?? true,
        exec: next.agenticApp?.tools?.bundles?.exec ?? true,
      },
    },
  };

  return next;
}

async function ensureAppWorkspaceLayout(workspaceDir: string) {
  await ensureAgentWorkspace({ dir: workspaceDir, ensureBootstrapFiles: true });
  await Promise.all(
    APP_LAYOUT_DIRS.map((name) => fs.mkdir(path.join(workspaceDir, name), { recursive: true })),
  );
}

async function seedBundledSkills(workspaceDir: string, requested: string[]) {
  const bundled = resolveBundledSkillsContext();
  if (!bundled.dir) {
    return {
      copied: [],
      skipped: requested,
      warning: "Bundled skills directory not found; skipped skill seeding.",
    };
  }

  const copied: string[] = [];
  const skipped: string[] = [];
  for (const name of requested) {
    if (!bundled.names.has(name)) {
      skipped.push(name);
      continue;
    }
    const srcDir = path.join(bundled.dir, name);
    const dstDir = path.join(workspaceDir, "skills", name);
    await fs.mkdir(path.dirname(dstDir), { recursive: true });
    await fs.cp(srcDir, dstDir, { recursive: true, force: false, errorOnExist: false });
    copied.push(name);
  }
  return { copied, skipped };
}

async function resolveAppDashboardUrl(runId: string): Promise<string> {
  const snapshot = await readConfigFileSnapshot();
  const cfg = snapshot.valid ? snapshot.config : {};
  const port = resolveGatewayPort(cfg);
  const bind = cfg.gateway?.bind ?? "loopback";
  const basePath = cfg.gateway?.controlUi?.basePath;
  const customBindHost = cfg.gateway?.customBindHost;
  const token = cfg.gateway?.auth?.token ?? process.env.OPENCLAW_GATEWAY_TOKEN ?? "";
  const links = resolveControlUiLinks({
    port,
    bind: bind === "lan" ? "loopback" : bind,
    customBindHost,
    basePath,
  });
  const route = `/apps?runId=${encodeURIComponent(runId)}`;
  return token
    ? `${links.httpUrl}#token=${encodeURIComponent(token)}&route=${encodeURIComponent(route)}`
    : `${links.httpUrl}#route=${encodeURIComponent(route)}`;
}

export function registerAppInitCommand(
  app: Command,
  addGatewayClientOptions: (command: Command) => Command,
) {
  addGatewayClientOptions(
    app
      .command("init")
      .description("Bootstrap an app workspace and create a container-ready app run")
      .option("--run-id <id>", "Optional explicit run id")
      .option("--session-key <key>", "Requester session key")
      .option("--agent-id <id>", "Primary agent id")
      .option("--workspace-dir <dir>", "Workspace directory for the app session")
      .option("--container", "Apply container-first sandbox and tool defaults", false)
      .option("--seed-skills <names>", "Comma-separated bundled skill names to copy into workspace")
      .option("--open", "Open dashboard URL after bootstrap", false)
      .option("--json", "Output JSON", false),
  ).action(async (opts: AppInitOpts) => {
    try {
      const config = loadConfig();
      const workspaceDir = resolveUserPath(
        opts.workspaceDir?.trim() || config.agents?.defaults?.workspace || process.cwd(),
      );

      await ensureAppWorkspaceLayout(workspaceDir);

      let seeded: { copied: string[]; skipped: string[]; warning?: string } | undefined;
      const requestedSkills = (opts.seedSkills ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      if (requestedSkills.length > 0) {
        seeded = await seedBundledSkills(workspaceDir, requestedSkills);
      }

      if (opts.container) {
        await writeConfigFile(mergeContainerDefaults(config));
      }

      const run = await callGatewayFromCli(
        "app.create",
        opts,
        {
          runId: opts.runId,
          sessionKey: opts.sessionKey,
          agentId: opts.agentId,
          workspaceDir,
        },
        { expectFinal: false },
      );

      const dashboardUrl = await resolveAppDashboardUrl(
        (run as { runId?: string }).runId ?? opts.runId ?? "",
      );

      const payload = {
        workspaceDir,
        layoutDirs: APP_LAYOUT_DIRS,
        run,
        containerProfileApplied: Boolean(opts.container),
        seededSkills: seeded,
        dashboardUrl,
      };

      if (opts.json) {
        defaultRuntime.log(JSON.stringify(payload, null, 2));
      } else {
        defaultRuntime.log(info(`Workspace ready: ${workspaceDir}`));
        defaultRuntime.log(
          info(`Created app run: ${String((run as { runId?: string }).runId ?? "unknown")}`),
        );
        defaultRuntime.log(`Dashboard URL: ${dashboardUrl}`);
        if (seeded?.copied.length) {
          defaultRuntime.log(info(`Seeded skills: ${seeded.copied.join(", ")}`));
        }
        if (seeded?.skipped.length) {
          defaultRuntime.log(warn(`Skipped unknown skills: ${seeded.skipped.join(", ")}`));
        }
        if (seeded?.warning) {
          defaultRuntime.log(warn(seeded.warning));
        }
      }

      if (opts.open) {
        const browserSupport = await detectBrowserOpenSupport();
        if (browserSupport.ok) {
          const opened = await openUrl(dashboardUrl);
          if (!opened) {
            defaultRuntime.log(
              warn("Could not open dashboard automatically. Open the URL manually."),
            );
          }
        } else {
          defaultRuntime.log(warn("Browser open support unavailable in this environment."));
        }
      }
    } catch (error) {
      defaultRuntime.error(danger(String(error)));
      defaultRuntime.exit(1);
    }
  });
}
