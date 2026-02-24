export type AgenticAppConfig = {
  sandbox?: {
    /** Default app sandbox profile. */
    defaultProfile?: "off" | "workspace-write" | "workspace-read";
    /** Optional workspace root override for app runs. */
    workspaceRoot?: string;
    /** Scope for app workspaces. */
    workspaceMode?: "shared" | "session";
  };
  tools?: {
    bundles?: {
      file?: boolean;
      browser?: boolean;
      exec?: boolean;
      api?: boolean;
    };
  };
  subagents?: {
    /** Soft cap for active subagent runs per app run. */
    maxActiveRuns?: number;
    /** Where subagent completion updates are routed by default. */
    routing?: "requester" | "silent";
  };
  ui?: {
    /** Surface app runs in UI status lists. */
    exposeRuns?: boolean;
    /** Default visibility for app runs in UI surfaces. */
    defaultVisibility?: "private" | "operator";
  };
  auth?: {
    /** Require auth for app lifecycle operations. */
    required?: boolean;
    /** Default auth mode for app surfaces. */
    mode?: "gateway" | "operator";
  };
};
