import { Type } from "@sinclair/typebox";

const AgenticAppRunStateSchema = Type.Union([
  Type.Literal("created"),
  Type.Literal("running"),
  Type.Literal("stopped"),
]);

export const AgenticAppRunSchema = Type.Object(
  {
    runId: Type.String({ minLength: 1 }),
    sessionKey: Type.String({ minLength: 1 }),
    agentId: Type.String({ minLength: 1 }),
    createdAt: Type.Integer({ minimum: 0 }),
    startedAt: Type.Optional(Type.Integer({ minimum: 0 })),
    stoppedAt: Type.Optional(Type.Integer({ minimum: 0 })),
    state: AgenticAppRunStateSchema,
    sandboxed: Type.Boolean(),
    toolNames: Type.Array(Type.String()),
    activeSubagents: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const AppCreateParamsSchema = Type.Object(
  {
    runId: Type.Optional(Type.String()),
    sessionKey: Type.Optional(Type.String()),
    agentId: Type.Optional(Type.String()),
    workspaceDir: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const AppStartParamsSchema = Type.Object(
  {
    runId: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const AppStopParamsSchema = Type.Object(
  {
    runId: Type.String({ minLength: 1 }),
    reason: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const AppStatusParamsSchema = Type.Object(
  {
    runId: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const AppCreateResultSchema = AgenticAppRunSchema;
export const AppStartResultSchema = AgenticAppRunSchema;
export const AppStopResultSchema = AgenticAppRunSchema;
export const AppStatusResultSchema = Type.Object(
  {
    runs: Type.Array(AgenticAppRunSchema),
  },
  { additionalProperties: false },
);
