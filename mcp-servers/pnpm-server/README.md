# PNPM MCP Server

A comprehensive Model Context Protocol (MCP) server for PNPM package management and workspace operations in the Roo-Code monorepo.

## Features

### Workspace Analysis
- **analyze_workspace**: Complete analysis of workspace structure and dependencies
- **workspace_info**: Detailed information about specific workspaces
- **dependency_graph**: Visual dependency relationships between packages

### Package Management
- **install_package**: Install packages in specific workspaces
- **update_package**: Update packages across workspaces
- **remove_package**: Remove packages from workspaces
- **check_outdated**: Check for outdated dependencies

### Security & Quality
- **audit_security**: Security vulnerability scanning
- **list_scripts**: List available npm scripts across workspaces

### Script Execution
- **run_script**: Execute npm scripts in specific workspaces

## Tools

### analyze_workspace
Analyzes the entire pnpm workspace structure and dependencies.

**Parameters:**
- `rootPath` (string, optional): Root path of the workspace (default: ".")
- `includeDevDeps` (boolean, optional): Include development dependencies (default: true)

**Example:**
```json
{
  "rootPath": "/Users/tim/gameplan/vibing/noo-code/Roo-Code",
  "includeDevDeps": true
}
```

### check_outdated
Checks for outdated packages across the workspace.

**Parameters:**
- `workspace` (string, optional): Specific workspace to check
- `depth` (number, optional): Dependency depth to check (default: 0)

### audit_security
Performs security audit on workspace dependencies.

**Parameters:**
- `workspace` (string, optional): Specific workspace to audit
- `severity` (string, optional): Minimum severity level ("low", "moderate", "high", "critical")

### install_package
Installs a package in a specific workspace.

**Parameters:**
- `packageName` (string, required): Name of the package to install
- `workspace` (string, required): Target workspace path
- `version` (string, optional): Specific version to install
- `isDev` (boolean, optional): Install as development dependency
- `isPeer` (boolean, optional): Install as peer dependency

### update_package
Updates a package in workspace(s).

**Parameters:**
- `packageName` (string, required): Name of the package to update
- `workspace` (string, optional): Specific workspace to update
- `version` (string, optional): Target version
- `interactive` (boolean, optional): Use interactive update mode

### remove_package
Removes a package from workspace(s).

**Parameters:**
- `packageName` (string, required): Name of the package to remove
- `workspace` (string, required): Specific workspace to remove from

### run_script
Runs a script in a specific workspace.

**Parameters:**
- `scriptName` (string, required): Name of the script to run
- `workspace` (string, required): Workspace to run script in
- `args` (array, optional): Additional arguments for the script

### list_scripts
Lists all available scripts across workspaces.

**Parameters:**
- `workspace` (string, optional): Specific workspace to list scripts for

### dependency_graph
Generates dependency graph for workspace packages.

**Parameters:**
- `format` (string, optional): Output format ("text", "json")
- `includeExternal` (boolean, optional): Include external dependencies

### workspace_info
Gets detailed information about a specific workspace.

**Parameters:**
- `workspace` (string, required): Workspace path or name

## Resources

### pnpm://workspace/config
Current pnpm workspace configuration in JSON format.

### pnpm://lockfile/info
Information about the pnpm-lock.yaml file including size and modification date.

### pnpm://packages/list
List of all packages in the workspace with summary information.

## Installation

1. Install dependencies:
```bash
cd mcp-servers/pnpm-server
npm install
```

2. Build the server:
```bash
npm run build
```

3. The server is automatically configured in the MCP settings.

## Usage

The server integrates with Cline and provides package management capabilities for the Roo-Code monorepo. It automatically detects workspace structure from `pnpm-workspace.yaml` and provides comprehensive package management tools.

## Architecture

- **TypeScript**: Built with TypeScript for type safety
- **MCP SDK**: Uses the official Model Context Protocol SDK
- **PNPM Integration**: Direct integration with pnpm commands
- **Workspace Detection**: Automatic workspace discovery and analysis
- **Error Handling**: Comprehensive error handling and reporting

## Development

- `npm run dev`: Watch mode for development
- `npm run build`: Build for production
- `npm run start`: Start the server directly

## Security

The server includes security audit capabilities and follows clean code principles with proper error handling and input validation.
