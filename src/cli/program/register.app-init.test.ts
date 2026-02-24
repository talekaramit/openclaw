import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const callGatewayFromCli = vi.fn();
const loadConfig = vi.fn(() => ({}));
const writeConfigFile = vi.fn();
const readConfigFileSnapshot = vi.fn(async () => ({ valid: true, config: {} }));
const resolveGatewayPort = vi.fn(() => 18789);
const resolveControlUiLinks = vi.fn(() => ({ httpUrl: "http://127.0.0.1:18789" }));
const detectBrowserOpenSupport = vi.fn(async () => ({ ok: true }));
const openUrl = vi.fn(async () => true);

const runtime = {
  log: vi.fn(),
  error: vi.fn(),
  exit: vi.fn(),
};

vi.mock("../gateway-rpc.js", () => ({
  callGatewayFromCli,
}));

vi.mock("../../config/config.js", () => ({
  loadConfig,
  writeConfigFile,
  readConfigFileSnapshot,
  resolveGatewayPort,
}));

vi.mock("../../commands/onboard-helpers.js", () => ({
  resolveControlUiLinks,
  detectBrowserOpenSupport,
  openUrl,
}));

vi.mock("../../runtime.js", () => ({
  defaultRuntime: runtime,
}));

let registerAppInitCommand: typeof import("./register.app-init.js").registerAppInitCommand;

beforeAll(async () => {
  ({ registerAppInitCommand } = await import("./register.app-init.js"));
});

describe("registerAppInitCommand", () => {
  let tempDir = "";

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-app-init-"));
    callGatewayFromCli.mockResolvedValue({ runId: "app-test-run" });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function runCli(args: string[]) {
    const program = new Command();
    const app = program.command("app");
    registerAppInitCommand(app, (command) => command);
    await program.parseAsync(["app", "init", ...args], { from: "user" });
  }

  it("creates app workspace layout and app run", async () => {
    await runCli(["--workspace-dir", tempDir]);

    for (const dirname of ["tasks", "artifacts", "skills", "logs"]) {
      const stat = await fs.stat(path.join(tempDir, dirname));
      expect(stat.isDirectory()).toBe(true);
    }
    expect(callGatewayFromCli).toHaveBeenCalledWith(
      "app.create",
      expect.anything(),
      expect.objectContaining({ workspaceDir: tempDir }),
      { expectFinal: false },
    );
  });

  it("writes container defaults and opens dashboard when requested", async () => {
    await runCli(["--workspace-dir", tempDir, "--container", "--open"]);

    expect(writeConfigFile).toHaveBeenCalledTimes(1);
    const next = writeConfigFile.mock.calls[0]?.[0] as { tools?: { preset?: string } };
    expect(next.tools?.preset).toBe("container-agent-default");
    expect(openUrl).toHaveBeenCalledWith(expect.stringContaining("runId%3Dapp-test-run"));
  });
});
