import type { Command } from "commander";
import { defaultRuntime } from "../runtime.js";
import { callGatewayFromCli } from "./gateway-rpc.js";

export function registerSecretsCli(program: Command) {
  const secrets = program.command("secrets").description("Manage scoped secrets");

  secrets
    .command("list")
    .option("--agent <id>")
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      const res = await callGatewayFromCli("secrets.list", opts, {
        agentId: opts.agent,
      });
      defaultRuntime.log(opts.json ? JSON.stringify(res, null, 2) : JSON.stringify(res));
    });

  secrets
    .command("set")
    .argument("<key>")
    .argument("<value>")
    .option("--scope <scope>", "app|agent", "app")
    .option("--agent <id>")
    .option("--target <target>", "sandbox|skills|exec", collectTarget, [])
    .option("--allow-host-exec", "Allow host exec injection", false)
    .action(async (key, value, opts) => {
      await callGatewayFromCli("secrets.set", opts, {
        scope: opts.scope,
        agentId: opts.agent,
        key,
        value,
        targets: opts.target,
        allowHostExec: opts.allowHostExec === true,
      });
      defaultRuntime.log("ok");
    });

  secrets
    .command("delete")
    .argument("<key>")
    .option("--scope <scope>", "app|agent", "app")
    .option("--agent <id>")
    .action(async (key, opts) => {
      await callGatewayFromCli("secrets.delete", opts, {
        scope: opts.scope,
        agentId: opts.agent,
        key,
      });
      defaultRuntime.log("ok");
    });

  secrets
    .command("assign")
    .argument("<key>")
    .argument("<target>")
    .option("--scope <scope>", "app|agent", "app")
    .option("--agent <id>")
    .option("--off", "Disable assignment", false)
    .action(async (key, target, opts) => {
      await callGatewayFromCli("secrets.assign", opts, {
        scope: opts.scope,
        agentId: opts.agent,
        key,
        target,
        enabled: !opts.off,
      });
      defaultRuntime.log("ok");
    });
}

function collectTarget(value: string, previous: string[]) {
  return [...previous, value];
}
