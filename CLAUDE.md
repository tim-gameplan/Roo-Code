# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Building and Testing

- `pnpm install` - Install all dependencies (runs automatically via preinstall hook)
- `pnpm build` - Build all packages using Turbo
- `pnpm bundle` - Bundle the extension for production
- `pnpm test` - Run all tests across the workspace
- `pnpm lint` - Lint all packages
- `pnpm check-types` - TypeScript type checking across all packages

### Extension Development

- `F5` in VSCode - Start debugging the extension in a new VSCode window
- `pnpm vsix` - Package extension as .vsix file in `bin/` directory
- `pnpm watch:bundle` (in src/) - Watch mode for extension bundling
- `pnpm watch:tsc` (in src/) - Watch mode for TypeScript compilation

### Web UI Development

- `cd web-ui && pnpm dev` - Start Vite development server for web interface
- `cd production-ccs && pnpm dev` - Start the Central Communication Server for remote UI

### Mobile Remote Access (POC)

- `./scripts/start-roo-remote.sh` - Start mobile remote access (POC Remote UI on port 8081)
- `./scripts/stop-roo-remote.sh` - Stop mobile remote access
- `./scripts/start-vscode-with-ipc.sh` - Start VSCode with IPC enabled for remote access

### Testing

- `pnpm test` - Run all tests
- `pnpm test --filter=src` - Run only extension tests
- Individual test commands available in each package's package.json

## Architecture Overview

### Monorepo Structure

This is a pnpm workspace with multiple packages:

- `src/` - Main VSCode extension
- `web-ui/` - React-based remote web interface
- `production-ccs/` - Express.js server for remote UI communication
- `poc-remote-ui/` - Lightweight mobile remote access (port 8081, IPC-based)
- `packages/` - Shared libraries (types, telemetry, cloud, IPC)
- `webview-ui/` - VSCode webview React components
- `mcp-servers/` - Model Context Protocol server implementations

### Key Extension Components

**Core Entry Points:**

- `src/extension.ts` - Main extension activation point
- `src/core/webview/ClineProvider.ts` - Central controller for AI interactions
- `src/core/task/Task.ts` - Individual AI task/conversation management

**Service Layer:**

- `src/services/mcp/` - Model Context Protocol integration for external tools
- `src/services/code-index/` - Codebase indexing and semantic search
- `src/services/checkpoints/` - Git-based state management
- `src/api/providers/` - AI model provider abstractions (Anthropic, OpenAI, etc.)

**Tool System:**

- `src/core/tools/` - Extensible AI tools (file operations, terminal, browser, search)
- Each tool follows consistent interface pattern with validation and progress tracking

### Communication Architecture

**Extension ↔ Webview:**

- `src/shared/ExtensionMessage.ts` and `src/shared/WebviewMessage.ts` define protocols
- Event-driven messaging with type safety
- State synchronization between extension and UI

**Remote UI System:**

- WebSocket-based real-time communication via production-ccs server
- JWT authentication and session management
- PostgreSQL database integration for persistence

**Mobile Remote Access (POC):**

- Direct IPC communication via Unix socket (`/tmp/app.roo-extension`)
- Lightweight Express server on port 8081 for mobile browser access
- TaskCommand protocol for starting new Roo-Code tasks
- Zero dependencies - no databases or complex authentication required

**MCP Integration:**

- `mcp-servers/` contains custom MCP server implementations
- Configuration via `mcp-servers/mcp-config.json`
- Supports stdio, SSE, and HTTP transport types

### Important Patterns

**Provider Pattern:** All AI models implement consistent `ApiHandler` interface in `src/api/providers/`

**Tool System:** Extensible architecture where new tools inherit from base patterns in `src/core/tools/`

**Event-Driven:** Heavy use of EventEmitter for task lifecycle, tool execution, and UI updates

**Type Safety:** Comprehensive TypeScript usage with shared types in `packages/types/`

## Development Workflow

### Making Changes

1. Extension changes require restart of debug session (F5)
2. Webview changes appear immediately during development
3. Use `pnpm lint` and `pnpm check-types` before committing
4. Run tests with specific filters for focused development

### Testing Integration

- Phase 3.3 testing framework exists in `docs/testing/` with automation scripts
- Use `scripts/test-automation/` for comprehensive system testing
- Remote endpoint testing available via `test-remote-*.js` files

### Port Management

- Extension uses dynamic port allocation
- Web UI typically runs on port 5173 (Vite default)
- Production CCS uses port 3000
- POC Remote UI uses port 8081 (mobile access)
- Port conflicts documented in `docs/PORT_*` files

## Key Configuration Files

- `src/package.json` - VSCode extension manifest with commands and contributions
- `mcp-servers/mcp-config.json` - MCP server configurations
- `production-ccs/src/config/` - Server configuration for remote UI
- `.vscode/launch.json` - Debugging configurations (if present)

## Common Development Tasks

**Adding New AI Provider:**

1. Create provider in `src/api/providers/` implementing `ApiHandler`
2. Add provider configuration to `src/shared/api.ts`
3. Update provider selector UI components

**Adding New Tool:**

1. Create tool file in `src/core/tools/` following existing patterns
2. Register tool in tool registry
3. Add corresponding UI handling in webview components

**MCP Server Development:**

1. Add server implementation to `mcp-servers/`
2. Update `mcp-config.json` with server configuration
3. Test via MCP button in extension UI

**Remote UI Features:**

1. Add API endpoints to `production-ccs/src/routes/`
2. Implement corresponding React components in `web-ui/src/`
3. Update WebSocket message handling for real-time features

**Mobile Remote Access (POC):**

1. Modify `poc-remote-ui/ccs/server.js` for server-side changes
2. Update `poc-remote-ui/ccs/public/index.html` for UI changes
3. Extension IPC integration handled via `src/extension/api.ts`
4. Requires VSCode extension to be started with IPC enabled (`ROO_CODE_IPC_SOCKET_PATH` environment variable)
