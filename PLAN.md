# Agentic Container Application - Implementation Plan

## Overview

Build an agentic application that runs inside a container, providing a self-contained AI agent with file management tools, browser access, CLI for 3rd-party APIs, a web UI for interaction, sub-agent spawning capabilities, and integration with existing OpenClaw skills.

## Current State Analysis

### What Already Exists

| Component | Status | Location |
|-----------|--------|----------|
| Gateway server (HTTP/WS) | Mature | `src/gateway/` |
| Agent orchestration | Mature | `src/agents/` |
| Browser automation (Playwright) | Mature | `src/browser/` |
| 54+ Skills | Mature | `skills/` |
| Plugin/tool system | Mature | `src/plugins/`, `src/agents/tools/` |
| Web UI (Lit.js) | Mature | `ui/` |
| Sandbox Dockerfiles | Basic | `Dockerfile.sandbox*` |
| Docker Compose | Basic | `docker-compose.yml` |
| Tool policy/security | Mature | `src/security/`, `src/agents/tool-policy*.ts` |
| Sub-agent session routing | Exists | `src/routing/session-key.ts` |
| Process/PTY management | Exists | `src/process/`, `src/node-host/` |
| CLI commands | 350+ files | `src/commands/` |

### What Needs to Be Built

The container agent app is a **new `apps/container-agent/` workspace package** that bundles a purpose-built agent runtime into a single container image with dedicated tools and a streamlined UI.

---

## Architecture

```
┌────────────────────────── Container ──────────────────────────┐
│                                                               │
│  ┌─────────────┐    ┌──────────────────────────────────────┐  │
│  │   Web UI    │◄──►│        Agent Runtime (Gateway)       │  │
│  │  (Lit.js)   │    │                                      │  │
│  │  Port 3000  │    │  ┌────────────┐  ┌───────────────┐   │  │
│  └─────────────┘    │  │  Tool      │  │  Skill        │   │  │
│                     │  │  Registry  │  │  Loader       │   │  │
│  ┌─────────────┐    │  └────────────┘  └───────────────┘   │  │
│  │  Browser    │    │                                      │  │
│  │  (Chromium) │◄──►│  ┌────────────┐  ┌───────────────┐   │  │
│  │  Headless   │    │  │  Sub-Agent │  │  Session       │  │  │
│  └─────────────┘    │  │  Manager   │  │  Manager      │   │  │
│                     │  └────────────┘  └───────────────┘   │  │
│  ┌─────────────┐    │                                      │  │
│  │  Workspace  │◄──►│  Port 18789 (API)                    │  │
│  │  /workspace │    └──────────────────────────────────────┘  │
│  └─────────────┘                                              │
└───────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan (Phases)

### Phase 1: Container Agent Core (`apps/container-agent/`)

**Goal:** Create the new workspace package with a dedicated container agent runtime.

#### 1.1 Project Scaffolding

- **Create** `apps/container-agent/` workspace package
  - `apps/container-agent/package.json` - workspace package definition
  - `apps/container-agent/tsconfig.json` - TypeScript config
  - `apps/container-agent/src/index.ts` - Entry point
- **Update** `pnpm-workspace.yaml` to include `apps/container-agent`
- **Create** `apps/container-agent/Dockerfile` - Container image definition
- **Create** `apps/container-agent/docker-compose.yml` - Dev/run compose file

#### 1.2 Agent Runtime Bootstrap

- **Create** `apps/container-agent/src/runtime.ts` - Container agent runtime
  - Initializes the gateway server
  - Loads configuration from env vars + config file
  - Registers container-specific tools
  - Sets up workspace directory at `/workspace`
  - Configures model provider (API key from env)
- **Create** `apps/container-agent/src/config.ts` - Container-specific config
  - Default model configuration
  - Workspace paths
  - Tool permissions (allow file ops, browser, CLI by default)
  - Security boundaries (container-level isolation)

---

### Phase 2: Container Tools

**Goal:** Build dedicated tool implementations that are first-class inside the container.

#### 2.1 File Management Tool

- **Create** `apps/container-agent/src/tools/file-manager.ts`
  - Implementation: **Node.js `fs` APIs** (not bash) for safety, performance, and proper error handling
  - `file_read` - Read file contents with line range support (`fs.readFile`)
  - `file_write` - Write/overwrite file contents (`fs.writeFile`)
  - `file_edit` - String replacement editing, read + replace + write (`fs.readFile` + `fs.writeFile`)
  - `file_list` - List directory contents with glob support (`fs.readdir` + glob)
  - `file_search` - Search file contents — **shells out to `ripgrep`** (only tool that uses bash; rg is pre-installed in sandbox images and is far faster than any JS alternative)
  - `file_delete` - Delete files/directories (`fs.rm` with recursive option)
  - `file_move` - Move/rename files (`fs.rename`)
  - `file_info` - Get file metadata: size, modified time, permissions (`fs.stat`)
  - All paths validated and scoped to `/workspace` to prevent directory traversal
  - No shell escaping needed (except `file_search`) — eliminates command injection risk
- **Create** `apps/container-agent/src/tools/file-manager.test.ts`

#### 2.2 Browser Tool

- **Create** `apps/container-agent/src/tools/browser.ts`
  - Wraps existing `src/browser/` Playwright infrastructure
  - `browser_navigate` - Go to URL
  - `browser_screenshot` - Take screenshot (returns base64)
  - `browser_click` - Click element by selector/text
  - `browser_type` - Type into input field
  - `browser_read` - Extract text content from page
  - `browser_evaluate` - Run JavaScript in page context
  - Headless Chromium pre-installed in container
- **Create** `apps/container-agent/src/tools/browser.test.ts`

#### 2.3 CLI / Shell Tool

- **Create** `apps/container-agent/src/tools/shell.ts`
  - `shell_exec` - Execute shell commands
  - `shell_exec_background` - Run long-running commands in background
  - `shell_check` - Check status of background processes
  - `shell_kill` - Kill background processes
  - Timeout controls and output limits
  - Environment variable management
  - Working directory support
  - Integrates with existing `src/node-host/invoke.ts` and `src/process/` for PTY
- **Create** `apps/container-agent/src/tools/shell.test.ts`

#### 2.4 HTTP/API Tool

- **Create** `apps/container-agent/src/tools/http-client.ts`
  - `http_request` - Make HTTP requests (GET, POST, PUT, DELETE, PATCH)
  - Supports headers, body, auth tokens
  - Response parsing (JSON, text, binary)
  - Timeout and redirect controls
  - For accessing 3rd-party APIs from the agent
- **Create** `apps/container-agent/src/tools/http-client.test.ts`

#### 2.5 Tool Registry

- **Create** `apps/container-agent/src/tools/registry.ts`
  - Registers all container tools
  - Maps to the existing `AnyAgentTool` interface from `src/agents/tools/common.ts`
  - Integrates with existing tool policy pipeline (`src/agents/tool-policy-pipeline.ts`)
  - Exposes tool schemas for the agent's system prompt

---

### Phase 3: Sub-Agent System

**Goal:** Enable the container agent to spawn sub-agents for complex tasks.

#### 3.1 Sub-Agent Manager

- **Create** `apps/container-agent/src/sub-agents/manager.ts`
  - `spawn_sub_agent` tool - Create a sub-agent with:
    - Specific task/prompt
    - Tool subset (which tools the sub-agent can use)
    - Optional model override
    - Workspace scope (subdirectory of `/workspace`)
  - Sub-agent lifecycle management (track running sub-agents)
  - Sub-agent result aggregation
  - Leverages existing `src/routing/session-key.ts` sub-agent session routing
  - Integrates with existing `src/agents/agent-scope.ts` for scoped configuration

#### 3.2 Sub-Agent Communication

- **Create** `apps/container-agent/src/sub-agents/protocol.ts`
  - Parent-child message passing
  - Status reporting (progress updates from sub-agents)
  - Result return (sub-agent outputs back to parent)
  - Error propagation
  - Uses existing gateway WebSocket infrastructure

#### 3.3 Sub-Agent Tools

- **Create** `apps/container-agent/src/sub-agents/tools.ts`
  - `create_sub_agent` - Spawn a new sub-agent with a task
  - `check_sub_agent` - Get status/output of running sub-agent
  - `list_sub_agents` - List all active sub-agents
  - `cancel_sub_agent` - Cancel a running sub-agent
- **Create** `apps/container-agent/src/sub-agents/manager.test.ts`

---

### Phase 4: Skills Integration

**Goal:** Allow the container agent to use existing OpenClaw skills.

#### 4.1 Skill Loader

- **Create** `apps/container-agent/src/skills/loader.ts`
  - Scan `/app/skills/` directory in the container
  - Parse `SKILL.md` frontmatter for metadata
  - Register skill tools into the agent's tool registry
  - Filter skills based on configuration (allowlist/blocklist)
  - Reuses existing skill loading patterns from `src/agents/agent-scope.ts`

#### 4.2 Skill Runtime

- **Create** `apps/container-agent/src/skills/runtime.ts`
  - Execute skill commands within the container
  - Provide skill context (workspace dir, session info, agent config)
  - Map skill tool invocations to bash/process execution
  - Handle skill-specific dependencies

---

### Phase 5: Web UI

**Goal:** Build a chat-based web UI for interacting with the container agent.

#### 5.1 Container UI App

- **Create** `apps/container-agent/ui/` - Dedicated UI for the container agent
  - `apps/container-agent/ui/package.json`
  - `apps/container-agent/ui/vite.config.ts`
  - `apps/container-agent/ui/index.html`
  - Built with Lit.js (consistent with existing `ui/`)

#### 5.2 UI Components

- **Create** `apps/container-agent/ui/src/app.ts` - Main app shell
- **Create** `apps/container-agent/ui/src/components/`
  - `chat-panel.ts` - Chat message list and input
  - `message-bubble.ts` - Individual message rendering (user + agent)
  - `tool-output.ts` - Tool execution result display (file diffs, screenshots, shell output)
  - `sub-agent-panel.ts` - Sub-agent status and output viewer
  - `file-explorer.ts` - Workspace file browser sidebar
  - `terminal-view.ts` - Live terminal output view

#### 5.3 UI-Gateway Connection

- **Create** `apps/container-agent/ui/src/gateway-client.ts`
  - WebSocket connection to the gateway (port 18789)
  - Real-time message streaming
  - Tool execution status updates
  - Sub-agent progress tracking
  - Reuses patterns from existing `ui/src/ui/gateway.ts`

---

### Phase 6: Container Image

**Goal:** Package everything into a production-ready Docker image.

#### 6.1 Dockerfile

- **Create** `apps/container-agent/Dockerfile`
  ```
  Base: node:22-bookworm
  + Chromium (headless browser)
  + ripgrep (file search)
  + Common dev tools (git, curl, jq, python3)
  + Bun (for fast TypeScript execution)
  + Pre-built gateway + UI
  + Skills directory
  + /workspace volume mount point
  ```

#### 6.2 Docker Compose

- **Create** `apps/container-agent/docker-compose.yml`
  - Single service definition
  - Volume mount for `/workspace`
  - Port mapping: 3000 (UI), 18789 (API)
  - Environment variables for model provider keys
  - Health check endpoint

#### 6.3 Entrypoint

- **Create** `apps/container-agent/scripts/entrypoint.sh`
  - Start Xvfb (for headless browser)
  - Start the gateway server
  - Serve the UI
  - Health check setup

---

### Phase 7: Integration & Polish

#### 7.1 API Endpoint for External Access

- **Create** `apps/container-agent/src/api/routes.ts`
  - `POST /api/chat` - Send message to agent, get response
  - `GET /api/chat/stream` - SSE stream for real-time responses
  - `POST /api/tools/invoke` - Direct tool invocation
  - `GET /api/status` - Agent status and health
  - `GET /api/sub-agents` - List sub-agents and their status
  - Leverages existing gateway HTTP handlers from `src/gateway/`

#### 7.2 Configuration

- **Create** `apps/container-agent/src/config/defaults.ts`
  - Default model (configurable via `AGENT_MODEL` env var)
  - Default tools enabled
  - Workspace path
  - Browser config
  - Security defaults (container-scoped)

#### 7.3 Tests

- Unit tests for each tool
- Integration tests for sub-agent spawning
- E2E test for chat flow (message -> tool use -> response)
- Container build smoke test

---

## File Structure (Final)

```
apps/container-agent/
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── scripts/
│   └── entrypoint.sh
├── src/
│   ├── index.ts                    # Entry point
│   ├── runtime.ts                  # Agent runtime bootstrap
│   ├── config.ts                   # Container-specific config
│   ├── api/
│   │   └── routes.ts               # HTTP API endpoints
│   ├── tools/
│   │   ├── registry.ts             # Tool registration
│   │   ├── file-manager.ts         # File read/write/edit/search
│   │   ├── file-manager.test.ts
│   │   ├── browser.ts              # Browser automation
│   │   ├── browser.test.ts
│   │   ├── shell.ts                # CLI/shell execution
│   │   ├── shell.test.ts
│   │   ├── http-client.ts          # HTTP requests for 3rd-party APIs
│   │   └── http-client.test.ts
│   ├── sub-agents/
│   │   ├── manager.ts              # Sub-agent lifecycle
│   │   ├── manager.test.ts
│   │   ├── protocol.ts             # Parent-child communication
│   │   └── tools.ts                # Sub-agent tools
│   └── skills/
│       ├── loader.ts               # Skill discovery and loading
│       └── runtime.ts              # Skill execution runtime
└── ui/
    ├── package.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── app.ts                  # Main app shell
        ├── gateway-client.ts       # WebSocket client
        └── components/
            ├── chat-panel.ts       # Chat interface
            ├── message-bubble.ts   # Message rendering
            ├── tool-output.ts      # Tool result display
            ├── sub-agent-panel.ts  # Sub-agent viewer
            ├── file-explorer.ts    # File browser
            └── terminal-view.ts    # Terminal output
```

---

## Key Design Decisions

1. **Workspace package** - Lives under `apps/container-agent/` as a workspace member, can import from the root `openclaw` package for gateway, agent, and tool infrastructure.

2. **Reuse over rebuild** - Leverage existing gateway server, tool policy system, agent orchestration, browser automation, and skill loader rather than reimplementing.

3. **Container-first security** - All file operations scoped to `/workspace`. The container itself is the security boundary. No need for the complex sandbox-in-sandbox pattern.

4. **Lit.js UI** - Matches the existing `ui/` tech stack. Lightweight, fast, web-component based.

5. **Sub-agents via session routing** - Use the existing sub-agent session key system (`src/routing/session-key.ts`) rather than building a new orchestration layer.

6. **Skills as SKILL.md** - Load skills from the bundled `skills/` directory using the same `SKILL.md` frontmatter format.

7. **Single container** - Everything (agent runtime, UI, browser, workspace) in one container for simplicity. Can be split later if needed.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes* | Anthropic API key (or use another provider) |
| `OPENAI_API_KEY` | No | OpenAI API key |
| `AGENT_MODEL` | No | Model to use (default: `claude-sonnet-4-20250514`) |
| `AGENT_NAME` | No | Agent display name |
| `WORKSPACE_DIR` | No | Workspace mount path (default: `/workspace`) |
| `UI_PORT` | No | UI port (default: `3000`) |
| `API_PORT` | No | API port (default: `18789`) |
| `ENABLE_BROWSER` | No | Enable browser tool (default: `true`) |
| `ENABLE_SHELL` | No | Enable shell tool (default: `true`) |
| `ALLOWED_SKILLS` | No | Comma-separated skill allowlist |

---

## Implementation Order

1. Phase 1 (Scaffolding + Runtime) - Foundation
2. Phase 2 (Tools) - Core agent capabilities
3. Phase 5 (UI) - User-facing interface (can parallel with Phase 3-4)
4. Phase 3 (Sub-agents) - Advanced orchestration
5. Phase 4 (Skills) - Existing skill reuse
6. Phase 6 (Container) - Packaging
7. Phase 7 (Polish) - API, config, tests
