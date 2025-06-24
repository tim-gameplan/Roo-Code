#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
	ListResourcesRequestSchema,
	ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as prettier from "prettier";
import { readFile, writeFile, readdir, stat } from "fs/promises";
import { join, relative, extname } from "path";

const server = new Server(
	{
		name: "prettier-mcp-server",
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
				// Skip common directories that shouldn't be formatted
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

// Helper function to get file info for Prettier
async function getFileInfo(filePath: string): Promise<prettier.FileInfoResult> {
	return await prettier.getFileInfo(filePath);
}

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
	return {
		tools: [
			{
				name: "format_file",
				description: "Format a specific file with Prettier",
				inputSchema: {
					type: "object",
					properties: {
						filePath: {
							type: "string",
							description: "Path to the file to format"
						},
						write: {
							type: "boolean",
							description: "Whether to write the formatted content back to the file",
							default: false
						}
					},
					required: ["filePath"]
				}
			},
			{
				name: "format_directory",
				description: "Format all files in a directory with Prettier",
				inputSchema: {
					type: "object",
					properties: {
						directoryPath: {
							type: "string",
							description: "Path to the directory to format"
						},
						extensions: {
							type: "array",
							items: { type: "string" },
							description: "File extensions to format",
							default: [".js", ".jsx", ".ts", ".tsx", ".json", ".css", ".scss", ".html", ".md", ".yaml", ".yml"]
						},
						write: {
							type: "boolean",
							description: "Whether to write the formatted content back to files",
							default: false
						}
					},
					required: ["directoryPath"]
				}
			},
			{
				name: "check_formatting",
				description: "Check if a file or directory is properly formatted",
				inputSchema: {
					type: "object",
					properties: {
						path: {
							type: "string",
							description: "Path to the file or directory to check"
						},
						extensions: {
							type: "array",
							items: { type: "string" },
							description: "File extensions to check (for directories)",
							default: [".js", ".jsx", ".ts", ".tsx", ".json", ".css", ".scss", ".html", ".md", ".yaml", ".yml"]
						}
					},
					required: ["path"]
				}
			},
			{
				name: "get_prettier_config",
				description: "Get the Prettier configuration for a file or directory",
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
				name: "format_code",
				description: "Format code content directly without file I/O",
				inputSchema: {
					type: "object",
					properties: {
						code: {
							type: "string",
							description: "Code content to format"
						},
						parser: {
							type: "string",
							description: "Prettier parser to use (typescript, babel, json, css, html, markdown, yaml)",
							default: "typescript"
						},
						options: {
							type: "object",
							description: "Additional Prettier options",
							default: {}
						}
					},
					required: ["code"]
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
			case "format_file": {
				const filePath = String(args?.filePath);
				const write = Boolean(args?.write);

				const fileInfo = await getFileInfo(filePath);
				
				if (fileInfo.ignored) {
					return {
						content: [{
							type: "text",
							text: `File ${filePath} is ignored by Prettier configuration.`
						}]
					};
				}

				if (!fileInfo.inferredParser) {
					return {
						content: [{
							type: "text",
							text: `File ${filePath} cannot be formatted - no parser available.`
						}]
					};
				}

				const originalContent = await readFile(filePath, 'utf8');
				const config = await prettier.resolveConfig(filePath);
				
				const formatted = await prettier.format(originalContent, {
					...config,
					filepath: filePath,
				});

				const isAlreadyFormatted = originalContent === formatted;

				if (write && !isAlreadyFormatted) {
					await writeFile(filePath, formatted, 'utf8');
				}

				return {
					content: [{
						type: "text",
						text: `Prettier Results for ${filePath}:\n\n` +
							`Parser: ${fileInfo.inferredParser}\n` +
							`Status: ${isAlreadyFormatted ? 'Already formatted' : 'Formatting needed'}\n` +
							(write && !isAlreadyFormatted ? 'File has been formatted and saved.\n' : '') +
							(!write && !isAlreadyFormatted ? 'Use write: true to save changes.\n' : '') +
							`\nFormatted content:\n\`\`\`${fileInfo.inferredParser}\n${formatted}\n\`\`\``
					}]
				};
			}

			case "format_directory": {
				const directoryPath = String(args?.directoryPath);
				const extensions = (args?.extensions as string[]) || [".js", ".jsx", ".ts", ".tsx", ".json", ".css", ".scss", ".html", ".md", ".yaml", ".yml"];
				const write = Boolean(args?.write);

				const files = await findFiles(directoryPath, extensions);
				
				if (files.length === 0) {
					return {
						content: [{
							type: "text",
							text: `No files found in ${directoryPath} with extensions: ${extensions.join(', ')}`
						}]
					};
				}

				const results: Array<{
					file: string;
					status: 'formatted' | 'already-formatted' | 'ignored' | 'error';
					error?: string;
				}> = [];

				for (const filePath of files) {
					try {
						const fileInfo = await getFileInfo(filePath);
						
						if (fileInfo.ignored) {
							results.push({ file: relative(directoryPath, filePath), status: 'ignored' });
							continue;
						}

						if (!fileInfo.inferredParser) {
							results.push({ file: relative(directoryPath, filePath), status: 'ignored' });
							continue;
						}

						const originalContent = await readFile(filePath, 'utf8');
						const config = await prettier.resolveConfig(filePath);
						
						const formatted = await prettier.format(originalContent, {
							...config,
							filepath: filePath,
						});

						const isAlreadyFormatted = originalContent === formatted;

						if (write && !isAlreadyFormatted) {
							await writeFile(filePath, formatted, 'utf8');
						}

						results.push({
							file: relative(directoryPath, filePath),
							status: isAlreadyFormatted ? 'already-formatted' : 'formatted'
						});
					} catch (error) {
						results.push({
							file: relative(directoryPath, filePath),
							status: 'error',
							error: error instanceof Error ? error.message : String(error)
						});
					}
				}

				const formatted = results.filter(r => r.status === 'formatted').length;
				const alreadyFormatted = results.filter(r => r.status === 'already-formatted').length;
				const ignored = results.filter(r => r.status === 'ignored').length;
				const errors = results.filter(r => r.status === 'error').length;

				let output = `Prettier Results for ${directoryPath}:\n\n`;
				output += `Files processed: ${results.length}\n`;
				output += `Formatted: ${formatted}\n`;
				output += `Already formatted: ${alreadyFormatted}\n`;
				output += `Ignored: ${ignored}\n`;
				output += `Errors: ${errors}\n\n`;

				if (formatted > 0) {
					output += "Files that were formatted:\n";
					results.filter(r => r.status === 'formatted').forEach(r => {
						output += `  ✓ ${r.file}\n`;
					});
					output += "\n";
				}

				if (errors > 0) {
					output += "Files with errors:\n";
					results.filter(r => r.status === 'error').forEach(r => {
						output += `  ✗ ${r.file}: ${r.error}\n`;
					});
					output += "\n";
				}

				if (write && formatted > 0) {
					output += "All formatting changes have been saved.";
				} else if (!write && formatted > 0) {
					output += "Use write: true to save formatting changes.";
				}

				return {
					content: [{
						type: "text",
						text: output
					}]
				};
			}

			case "check_formatting": {
				const path = String(args?.path);
				const extensions = (args?.extensions as string[]) || [".js", ".jsx", ".ts", ".tsx", ".json", ".css", ".scss", ".html", ".md", ".yaml", ".yml"];

				const pathStats = await stat(path);
				const files = pathStats.isDirectory() ? await findFiles(path, extensions) : [path];

				const results: Array<{
					file: string;
					isFormatted: boolean;
					error?: string;
				}> = [];

				for (const filePath of files) {
					try {
						const fileInfo = await getFileInfo(filePath);
						
						if (fileInfo.ignored || !fileInfo.inferredParser) {
							continue;
						}

						const originalContent = await readFile(filePath, 'utf8');
						const config = await prettier.resolveConfig(filePath);
						
						const formatted = await prettier.format(originalContent, {
							...config,
							filepath: filePath,
						});

						results.push({
							file: pathStats.isDirectory() ? relative(path, filePath) : filePath,
							isFormatted: originalContent === formatted
						});
					} catch (error) {
						results.push({
							file: pathStats.isDirectory() ? relative(path, filePath) : filePath,
							isFormatted: false,
							error: error instanceof Error ? error.message : String(error)
						});
					}
				}

				const wellFormatted = results.filter(r => r.isFormatted).length;
				const needsFormatting = results.filter(r => !r.isFormatted && !r.error).length;
				const errors = results.filter(r => r.error).length;

				let output = `Formatting Check for ${path}:\n\n`;
				output += `Files checked: ${results.length}\n`;
				output += `Well formatted: ${wellFormatted}\n`;
				output += `Need formatting: ${needsFormatting}\n`;
				output += `Errors: ${errors}\n\n`;

				if (needsFormatting > 0) {
					output += "Files that need formatting:\n";
					results.filter(r => !r.isFormatted && !r.error).forEach(r => {
						output += `  • ${r.file}\n`;
					});
					output += "\n";
				}

				if (errors > 0) {
					output += "Files with errors:\n";
					results.filter(r => r.error).forEach(r => {
						output += `  ✗ ${r.file}: ${r.error}\n`;
					});
				}

				return {
					content: [{
						type: "text",
						text: output
					}]
				};
			}

			case "get_prettier_config": {
				const path = String(args?.path);
				
				const config = await prettier.resolveConfig(path);
				const fileInfo = await getFileInfo(path);

				return {
					content: [{
						type: "text",
						text: `Prettier Configuration for ${path}:\n\n` +
							`File Info:\n${JSON.stringify(fileInfo, null, 2)}\n\n` +
							`Resolved Config:\n${JSON.stringify(config, null, 2)}`
					}]
				};
			}

			case "format_code": {
				const code = String(args?.code);
				const parser = String(args?.parser || "typescript");
				const options = (args?.options as prettier.Options) || {};

				const formatted = await prettier.format(code, {
					parser,
					...options,
				});

				return {
					content: [{
						type: "text",
						text: `Formatted code (${parser}):\n\n\`\`\`${parser}\n${formatted}\n\`\`\``
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

// List resources (Prettier configuration files)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
	return {
		resources: [
			{
				uri: "prettier://config/current",
				mimeType: "application/json",
				name: "Current Prettier Configuration",
				description: "The currently active Prettier configuration"
			},
			{
				uri: "prettier://info/supported-languages",
				mimeType: "application/json",
				name: "Supported Languages",
				description: "List of languages supported by Prettier"
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
				const config = await prettier.resolveConfig(".");
				
				return {
					contents: [{
						uri: request.params.uri,
						mimeType: "application/json",
						text: JSON.stringify(config, null, 2)
					}]
				};
			}
			
			case "/info/supported-languages": {
				const supportInfo = await prettier.getSupportInfo();
				const languages = supportInfo.languages.map(lang => ({
					name: lang.name,
					extensions: lang.extensions,
					parsers: lang.parsers
				}));
				
				return {
					contents: [{
						uri: request.params.uri,
						mimeType: "application/json",
						text: JSON.stringify(languages, null, 2)
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
	console.error("Prettier MCP Server error:", error);
	process.exit(1);
});
