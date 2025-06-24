#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
	ListResourcesRequestSchema,
	ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ESLint } from "eslint";
import { readFile, readdir, stat } from "fs/promises";
import { join, relative, extname } from "path";

interface LintResult {
	filePath: string;
	messages: Array<{
		ruleId: string | null;
		severity: number;
		message: string;
		line: number;
		column: number;
		nodeType?: string;
		messageId?: string;
		endLine?: number;
		endColumn?: number;
	}>;
	errorCount: number;
	warningCount: number;
	fixableErrorCount: number;
	fixableWarningCount: number;
	source?: string;
}

const server = new Server(
	{
		name: "eslint-mcp-server",
		version: "1.0.0",
	},
	{
		capabilities: {
			tools: {},
			resources: {},
		},
	}
);

// Helper function to find files recursively
async function findFiles(dir: string, extensions: string[]): Promise<string[]> {
	const files: string[] = [];
	
	try {
		const entries = await readdir(dir);
		
		for (const entry of entries) {
			const fullPath = join(dir, entry);
			const stats = await stat(fullPath);
			
			if (stats.isDirectory()) {
				// Skip common directories that shouldn't be linted
				if (!['node_modules', '.git', 'dist', 'build', 'out', '.next', '.turbo'].includes(entry)) {
					files.push(...await findFiles(fullPath, extensions));
				}
			} else if (stats.isFile()) {
				const ext = extname(entry);
				if (extensions.includes(ext)) {
					files.push(fullPath);
				}
			}
		}
	} catch (error) {
		// Ignore permission errors and continue
	}
	
	return files;
}

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
	return {
		tools: [
			{
				name: "lint_file",
				description: "Lint a specific file with ESLint",
				inputSchema: {
					type: "object",
					properties: {
						filePath: {
							type: "string",
							description: "Path to the file to lint"
						},
						fix: {
							type: "boolean",
							description: "Whether to apply auto-fixes",
							default: false
						}
					},
					required: ["filePath"]
				}
			},
			{
				name: "lint_directory",
				description: "Lint all files in a directory",
				inputSchema: {
					type: "object",
					properties: {
						directoryPath: {
							type: "string",
							description: "Path to the directory to lint"
						},
						extensions: {
							type: "array",
							items: { type: "string" },
							description: "File extensions to lint",
							default: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]
						},
						fix: {
							type: "boolean",
							description: "Whether to apply auto-fixes",
							default: false
						}
					},
					required: ["directoryPath"]
				}
			},
			{
				name: "get_eslint_config",
				description: "Get the current ESLint configuration for a file or directory",
				inputSchema: {
					type: "object",
					properties: {
						path: {
							type: "string",
							description: "Path to check configuration for"
						}
					},
					required: ["path"]
				}
			},
			{
				name: "check_rule",
				description: "Check if a specific ESLint rule is enabled and get its configuration",
				inputSchema: {
					type: "object",
					properties: {
						ruleName: {
							type: "string",
							description: "Name of the ESLint rule to check"
						},
						filePath: {
							type: "string",
							description: "File path to check rule configuration for",
							default: "."
						}
					},
					required: ["ruleName"]
				}
			}
		]
	};
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
	const { name, arguments: args } = request.params;

	try {
		switch (name) {
			case "lint_file": {
				const filePath = String(args?.filePath);
				const fix = Boolean(args?.fix);

				const eslint = new ESLint({ fix });
				const results = await eslint.lintFiles([filePath]);

				if (fix && results.length > 0) {
					await ESLint.outputFixes(results);
				}

				const result = results[0];
				const summary = {
					filePath: result.filePath,
					errorCount: result.errorCount,
					warningCount: result.warningCount,
					fixableErrorCount: result.fixableErrorCount,
					fixableWarningCount: result.fixableWarningCount,
					messages: result.messages.map(msg => ({
						ruleId: msg.ruleId,
						severity: msg.severity,
						message: msg.message,
						line: msg.line,
						column: msg.column,
						endLine: msg.endLine,
						endColumn: msg.endColumn
					}))
				};

				return {
					content: [{
						type: "text",
						text: `ESLint Results for ${filePath}:\n\n` +
							`Errors: ${result.errorCount}\n` +
							`Warnings: ${result.warningCount}\n` +
							`Fixable Errors: ${result.fixableErrorCount}\n` +
							`Fixable Warnings: ${result.fixableWarningCount}\n\n` +
							(result.messages.length > 0 
								? `Issues:\n${result.messages.map(msg => 
									`  ${msg.line}:${msg.column} ${msg.severity === 2 ? 'error' : 'warning'} ${msg.message} (${msg.ruleId || 'unknown'})`
								).join('\n')}`
								: "No issues found!") +
							(fix ? "\n\nAuto-fixes have been applied where possible." : "")
					}]
				};
			}

			case "lint_directory": {
				const directoryPath = String(args?.directoryPath);
				const extensions = (args?.extensions as string[]) || [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"];
				const fix = Boolean(args?.fix);

				const files = await findFiles(directoryPath, extensions);
				
				if (files.length === 0) {
					return {
						content: [{
							type: "text",
							text: `No files found in ${directoryPath} with extensions: ${extensions.join(', ')}`
						}]
					};
				}

				const eslint = new ESLint({ fix });
				const results = await eslint.lintFiles(files);

				if (fix) {
					await ESLint.outputFixes(results);
				}

				const totalErrors = results.reduce((sum, result) => sum + result.errorCount, 0);
				const totalWarnings = results.reduce((sum, result) => sum + result.warningCount, 0);
				const filesWithIssues = results.filter(result => result.errorCount > 0 || result.warningCount > 0);

				let output = `ESLint Results for ${directoryPath}:\n\n`;
				output += `Files checked: ${results.length}\n`;
				output += `Total errors: ${totalErrors}\n`;
				output += `Total warnings: ${totalWarnings}\n`;
				output += `Files with issues: ${filesWithIssues.length}\n\n`;

				if (filesWithIssues.length > 0) {
					output += "Files with issues:\n";
					for (const result of filesWithIssues) {
						const relativePath = relative(directoryPath, result.filePath);
						output += `\n${relativePath} (${result.errorCount} errors, ${result.warningCount} warnings):\n`;
						for (const msg of result.messages.slice(0, 5)) { // Limit to first 5 messages per file
							output += `  ${msg.line}:${msg.column} ${msg.severity === 2 ? 'error' : 'warning'} ${msg.message} (${msg.ruleId || 'unknown'})\n`;
						}
						if (result.messages.length > 5) {
							output += `  ... and ${result.messages.length - 5} more issues\n`;
						}
					}
				}

				if (fix) {
					output += "\nAuto-fixes have been applied where possible.";
				}

				return {
					content: [{
						type: "text",
						text: output
					}]
				};
			}

			case "get_eslint_config": {
				const path = String(args?.path);
				
				const eslint = new ESLint();
				const config = await eslint.calculateConfigForFile(path);

				return {
					content: [{
						type: "text",
						text: `ESLint Configuration for ${path}:\n\n${JSON.stringify(config, null, 2)}`
					}]
				};
			}

			case "check_rule": {
				const ruleName = String(args?.ruleName);
				const filePath = String(args?.filePath || ".");

				const eslint = new ESLint();
				const config = await eslint.calculateConfigForFile(filePath);
				const ruleConfig = config.rules?.[ruleName];

				let status = "disabled";
				let severity = "off";
				
				if (ruleConfig) {
					if (Array.isArray(ruleConfig)) {
						const level = ruleConfig[0];
						if (level === 1 || level === "warn") {
							status = "enabled";
							severity = "warning";
						} else if (level === 2 || level === "error") {
							status = "enabled";
							severity = "error";
						}
					} else if (ruleConfig === 1 || ruleConfig === "warn") {
						status = "enabled";
						severity = "warning";
					} else if (ruleConfig === 2 || ruleConfig === "error") {
						status = "enabled";
						severity = "error";
					}
				}

				return {
					content: [{
						type: "text",
						text: `ESLint Rule: ${ruleName}\n` +
							`Status: ${status}\n` +
							`Severity: ${severity}\n` +
							`Configuration: ${JSON.stringify(ruleConfig, null, 2)}`
					}]
				};
			}

			default:
				throw new Error(`Unknown tool: ${name}`);
		}
	} catch (error) {
		return {
			content: [{
				type: "text",
				text: `Error: ${error instanceof Error ? error.message : String(error)}`
			}]
		};
	}
});

// List resources (ESLint configuration files)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
	return {
		resources: [
			{
				uri: "eslint://config/current",
				mimeType: "application/json",
				name: "Current ESLint Configuration",
				description: "The currently active ESLint configuration"
			},
			{
				uri: "eslint://rules/all",
				mimeType: "application/json", 
				name: "All ESLint Rules",
				description: "List of all available ESLint rules"
			}
		]
	};
});

// Read resources
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
	const url = new URL(request.params.uri);
	
	try {
		switch (url.pathname) {
			case "/config/current": {
				const eslint = new ESLint();
				const config = await eslint.calculateConfigForFile(".");
				
				return {
					contents: [{
						uri: request.params.uri,
						mimeType: "application/json",
						text: JSON.stringify(config, null, 2)
					}]
				};
			}
			
			case "/rules/all": {
				const eslint = new ESLint();
				const rules = eslint.getRulesMetaForResults([]);
				
				return {
					contents: [{
						uri: request.params.uri,
						mimeType: "application/json",
						text: JSON.stringify(Object.keys(rules), null, 2)
					}]
				};
			}
			
			default:
				throw new Error(`Unknown resource: ${url.pathname}`);
		}
	} catch (error) {
		throw new Error(`Failed to read resource: ${error instanceof Error ? error.message : String(error)}`);
	}
});

async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

main().catch((error) => {
	console.error("ESLint MCP Server error:", error);
	process.exit(1);
});
