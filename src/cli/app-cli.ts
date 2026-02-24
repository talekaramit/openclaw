import type { Command } from "commander";
import { danger } from "../globals.js";
import { defaultRuntime } from "../runtime.js";
import type { GatewayRpcOpts } from "./gateway-rpc.js";
import { addGatewayClientOptions, callGatewayFromCli } from "./gateway-rpc.js";

type AppCliOpts = GatewayRpcOpts & {
  runId?: string;
  sessionKey?: string;
  agentId?: string;
  workspaceDir?: string;
  reason?: string;
  json?: boolean;
};

function printOutput(opts: { json?: boolean }, payload: unknown) {
  if (opts.json) {
    defaultRuntime.log(JSON.stringify(payload, null, 2));
    return;
  }
  defaultRuntime.log(JSON.stringify(payload, null, 2));
}

export function registerAppCli(program: Command) {
  const app = program
    .command("app")
    .description("Manage agentic app runtime runs")
    .option("--json", "Output JSON", false)
    .action(() => {
      app.outputHelp();
      defaultRuntime.exit(1);
    });

  addGatewayClientOptions(app);

  addGatewayClientOptions(
    app
      .command("create")
      .description("Create an app runtime run")
      .option("--run-id <id>", "Optional explicit run id")
      .option("--session-key <key>", "Requester session key")
      .option("--agent-id <id>", "Primary agent id")
      .option("--workspace-dir <dir>", "Workspace directory override")
      .option("--json", "Output JSON", false),
  ).action(async (opts: AppCliOpts) => {
    try {
      const result = await callGatewayFromCli(
        "app.create",
        opts,
        {
          runId: opts.runId,
          sessionKey: opts.sessionKey,
          agentId: opts.agentId,
          workspaceDir: opts.workspaceDir,
        },
        { expectFinal: false },
      );
      printOutput(opts, result);
    } catch (error) {
      defaultRuntime.error(danger(String(error)));
      defaultRuntime.exit(1);
    }
  });

  addGatewayClientOptions(
    app
      .command("start")
      .description("Start a previously created app run")
      .requiredOption("--run-id <id>", "App run id")
      .option("--json", "Output JSON", false),
  ).action(async (opts: AppCliOpts) => {
    try {
      const result = await callGatewayFromCli(
        "app.start",
        opts,
        { runId: opts.runId },
        { expectFinal: false },
      );
      printOutput(opts, result);
    } catch (error) {
      defaultRuntime.error(danger(String(error)));
      defaultRuntime.exit(1);
    }
  });

  addGatewayClientOptions(
    app
      .command("stop")
      .description("Stop an app run")
      .requiredOption("--run-id <id>", "App run id")
      .option("--reason <reason>", "Stop reason")
      .option("--json", "Output JSON", false),
  ).action(async (opts: AppCliOpts) => {
    try {
      const result = await callGatewayFromCli(
        "app.stop",
        opts,
        { runId: opts.runId, reason: opts.reason },
        { expectFinal: false },
      );
      printOutput(opts, result);
    } catch (error) {
      defaultRuntime.error(danger(String(error)));
      defaultRuntime.exit(1);
    }
  });

  addGatewayClientOptions(
    app
      .command("status")
      .description("Show app run status")
      .option("--run-id <id>", "Single app run id")
      .option("--json", "Output JSON", false),
  ).action(async (opts: AppCliOpts) => {
    try {
      const result = await callGatewayFromCli(
        "app.status",
        opts,
        { runId: opts.runId },
        { expectFinal: false },
      );
      printOutput(opts, result);
    } catch (error) {
      defaultRuntime.error(danger(String(error)));
      defaultRuntime.exit(1);
    }
  });
}
