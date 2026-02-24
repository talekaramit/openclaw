import {
  createAgenticAppRun,
  getAgenticAppRunStatus,
  listAgenticAppRuns,
  startAgenticAppRun,
  stopAgenticAppRun,
} from "../../agentic-app/runtime.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateAppCreateParams,
  validateAppStartParams,
  validateAppStatusParams,
  validateAppStopParams,
} from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

export const appHandlers: GatewayRequestHandlers = {
  "app.create": async ({ params, respond }) => {
    if (!validateAppCreateParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid app.create params: ${formatValidationErrors(validateAppCreateParams.errors)}`,
        ),
      );
      return;
    }
    const p = params as {
      runId?: string;
      sessionKey?: string;
      agentId?: string;
      workspaceDir?: string;
    };
    const run = await createAgenticAppRun(p);
    respond(true, run, undefined);
  },
  "app.start": ({ params, respond }) => {
    if (!validateAppStartParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid app.start params: ${formatValidationErrors(validateAppStartParams.errors)}`,
        ),
      );
      return;
    }
    const p = params as { runId: string };
    const run = startAgenticAppRun({ runId: p.runId });
    if (!run) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `unknown app run: ${p.runId}`),
      );
      return;
    }
    respond(true, run, undefined);
  },
  "app.stop": ({ params, respond }) => {
    if (!validateAppStopParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid app.stop params: ${formatValidationErrors(validateAppStopParams.errors)}`,
        ),
      );
      return;
    }
    const p = params as { runId: string; reason?: string };
    const run = stopAgenticAppRun({ runId: p.runId, reason: p.reason });
    if (!run) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `unknown app run: ${p.runId}`),
      );
      return;
    }
    respond(true, run, undefined);
  },
  "app.status": ({ params, respond }) => {
    if (!validateAppStatusParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid app.status params: ${formatValidationErrors(validateAppStatusParams.errors)}`,
        ),
      );
      return;
    }
    const p = params as { runId?: string };
    if (p.runId) {
      const run = getAgenticAppRunStatus({ runId: p.runId });
      respond(true, { runs: run ? [run] : [] }, undefined);
      return;
    }
    respond(true, { runs: listAgenticAppRuns() }, undefined);
  },
};
