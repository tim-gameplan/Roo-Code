# Roo-Code MCP Servers

This directory contains Model Context Protocol (MCP) servers for enhancing your development workflow with automated code quality tools.

## Available Servers

### 1. ESLint MCP Server (`eslint-code-quality`)

Provides automated ESLint code quality checks and fixes.

**Tools:**
- `lint_file` - Lint a specific file with ESLint
- `lint_directory` - Lint all files in a directory
- `get_eslint_config` - Get the current ESLint configuration
- `check_rule` - Check if a specific ESLint rule is enabled

**Resources:**
- `eslint://config/current` - Current ESLint configuration
- `eslint://rules/all` - List of all available ESLint rules

### 2. Prettier MCP Server (`prettier-formatter`)

Provides automated code formatting with Prettier.

**Tools:**
- `format_file` - Format a specific file with Prettier
- `format_directory` - Format all files in a directory
- `check_formatting` - Check if files are properly formatted
- `get_prettier_config` - Get the Prettier configuration
- `format_code` - Format code content directly

**Resources:**
- `prettier://config/current` - Current Prettier configuration
- `prettier://info/supported-languages` - Supported languages and parsers

### 3. PNPM MCP Server (`pnpm-package-manager`)

Provides comprehensive package management for PNPM workspaces.

**Tools:**
- `analyze_workspace` - Complete analysis of workspace structure and dependencies
- `check_outdated` - Check for outdated packages across workspaces
- `audit_security` - Security vulnerability scanning
- `install_package` - Install packages in specific workspaces
- `update_package` - Update packages across workspaces
- `remove_package` - Remove packages from workspaces
- `run_script` - Execute npm scripts in specific workspaces
- `list_scripts` - List available npm scripts across workspaces
- `dependency_graph` - Visual dependency relationships between packages
- `workspace_info` - Detailed information about specific workspaces

**Resources:**
- `pnpm://workspace/config` - Current pnpm workspace configuration
- `pnpm://lockfile/info` - Information about pnpm-lock.yaml
- `pnpm://packages/list` - List of all packages in the workspace

## Setup Instructions

### 1. Build the Servers

```bash
# Build ESLint server
cd mcp-servers/eslint-server
npm install
npm run build

# Build Prettier server
cd ../prettier-server
npm install
npm run build

# Build PNPM server
cd ../pnpm-server
npm install
npm run build
```

### 2. Configure MCP Client

Add the servers to your MCP client configuration. For Cline, add to your `cline_mcp_settings.json`:

```json
{
  "mcpServers": {
    "eslint-code-quality": {
      "command": "node",
      "args": ["/Users/tim/gameplan/vibing/noo-code/Roo-Code/mcp-servers/eslint-server/dist/index.js"],
      "env": {}
    },
    "prettier-formatter": {
      "command": "node", 
      "args": ["/Users/tim/gameplan/vibing/noo-code/Roo-Code/mcp-servers/prettier-server/dist/index.js"],
      "env": {}
    },
    "pnpm-package-manager": {
      "command": "node",
      "args": ["/Users/tim/gameplan/vibing/noo-code/Roo-Code/mcp-servers/pnpm-server/dist/index.js"],
      "env": {}
    }
  }
}
```

### 3. Restart Your MCP Client

Restart Cline or your MCP client to load the new servers.

## Usage Examples

### ESLint Server

```javascript
// Lint a specific file
use_mcp_tool("eslint-code-quality", "lint_file", {
  "filePath": "src/components/App.tsx",
  "fix": true
})

// Lint entire src directory
use_mcp_tool("eslint-code-quality", "lint_directory", {
  "directoryPath": "src",
  "extensions": [".ts", ".tsx"],
  "fix": false
})

// Check if a rule is enabled
use_mcp_tool("eslint-code-quality", "check_rule", {
  "ruleName": "@typescript-eslint/no-unused-vars",
  "filePath": "src/index.ts"
})
```

### Prettier Server

```javascript
// Format a file
use_mcp_tool("prettier-formatter", "format_file", {
  "filePath": "src/components/App.tsx",
  "write": true
})

// Check formatting for entire directory
use_mcp_tool("prettier-formatter", "check_formatting", {
  "path": "src",
  "extensions": [".ts", ".tsx", ".json"]
})

// Format code directly
use_mcp_tool("prettier-formatter", "format_code", {
  "code": "const x={a:1,b:2};",
  "parser": "typescript"
})
```

### PNPM Server

```javascript
// Analyze entire workspace
use_mcp_tool("pnpm-package-manager", "analyze_workspace", {
  "rootPath": "/Users/tim/gameplan/vibing/noo-code/Roo-Code",
  "includeDevDeps": true
})

// Check for outdated packages
use_mcp_tool("pnpm-package-manager", "check_outdated", {
  "workspace": "src",
  "depth": 0
})

// Security audit
use_mcp_tool("pnpm-package-manager", "audit_security", {
  "severity": "moderate"
})

// Install a package
use_mcp_tool("pnpm-package-manager", "install_package", {
  "packageName": "lodash",
  "workspace": "src",
  "isDev": false
})

// List scripts across workspaces
use_mcp_tool("pnpm-package-manager", "list_scripts", {
  "workspace": "src"
})

// Get workspace information
use_mcp_tool("pnpm-package-manager", "workspace_info", {
  "workspace": "src"
})
```

## Integration with Roo-Code Workflow

These MCP servers integrate seamlessly with your existing Roo-Code development workflow:

1. **Pre-commit Hooks**: Use with your existing lint-staged configuration
2. **CI/CD**: Integrate into your Turbo build pipeline
3. **Development**: Real-time code quality checks during development
4. **Code Reviews**: Automated formatting and linting before PRs

## Development

### Adding New Tools

To add new tools to either server:

1. Add the tool definition to the `ListToolsRequestSchema` handler
2. Implement the tool logic in the `CallToolRequestSchema` handler
3. Update the README with usage examples
4. Rebuild the server: `npm run build`

### Testing

Test the servers locally:

```bash
# Test ESLint server
echo '{"method": "tools/list"}' | node mcp-servers/eslint-server/dist/index.js

# Test Prettier server  
echo '{"method": "tools/list"}' | node mcp-servers/prettier-server/dist/index.js
```

## Troubleshooting

### Common Issues

1. **Module not found errors**: Ensure all dependencies are installed with `npm install`
2. **Permission errors**: Check file permissions and paths in configuration
3. **ESLint config not found**: Ensure your project has a valid ESLint configuration
4. **Prettier config not found**: Prettier will use defaults if no config is found

### Debug Mode

Run servers with debug output:

```bash
DEBUG=* node mcp-servers/eslint-server/dist/index.js
DEBUG=* node mcp-servers/prettier-server/dist/index.js
```

## Contributing

When contributing to these MCP servers:

1. Follow Uncle Bob's clean code principles
2. Add comprehensive error handling
3. Include usage examples in documentation
4. Test with various file types and configurations
5. Ensure compatibility with the existing Roo-Code toolchain
