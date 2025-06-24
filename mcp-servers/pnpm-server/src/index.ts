#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
	ListResourcesRequestSchema,
	ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFile, readdir, stat, access } from "fs/promises";
import { join, relative, dirname } from "path";
import { exec } from "child_process";
import { promisify } from "util";
import * as semver from "semver";
import fetch from "node-fetch";

const execAsync = promisify(exec);

interface PackageInfo {
	name: string;
	version: string;
	description?: string;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	scripts?: Record<string, string>;
	workspaces?: string[] | { packages: string[] };
}

interface WorkspaceInfo {
	name: string;
	path: string;
	version: string;
	private?: boolean;
	dependencies: Record<string, string>;
	devDependencies: Record<string, string>;
	scripts: Record<string, string>;
}

interface VulnerabilityInfo {
	id: string;
	title: string;
	severity: string;
	vulnerable_versions: string;
	patched_versions: string;
	overview: string;
	recommendation: string;
}

interface OutdatedPackage {
	package: string;
	current: string;
	wanted: string;
	latest: string;
	location: string;
}

const server = new Server(
	{
		name: "pnpm-mcp-server",
		version: "1.0.0",
	},
	{
		capabilities: {
			tools: {},
			resources: {},
		},
	}
);

// Helper function to execute pnpm commands
async function executePnpmCommand(command: string, cwd: string = "/Users/tim/gameplan/vibing/noo-code/Roo-Code"): Promise<string> {
	try {
		const { stdout, stderr } = await execAsync(`pnpm ${command}`, { cwd });
		if (stderr && !stderr.includes('WARN')) {
			throw new Error(stderr);
		}
		return stdout.trim();
	} catch (error) {
		throw new Error(`PNPM command failed: ${error instanceof Error ? error.message : String(error)}`);
	}
}

// Helper function to find package.json files in workspace
async function findWorkspacePackages(rootDir: string): Promise<WorkspaceInfo[]> {
	const workspaces: WorkspaceInfo[] = [];
	
	try {
		// Read workspace configuration
		const workspaceConfigPath = join(rootDir, 'pnpm-workspace.yaml');
		let workspacePatterns: string[] = [];
		
		try {
			const workspaceConfig = await readFile(workspaceConfigPath, 'utf-8');
			const lines = workspaceConfig.split('\n');
			let inPackagesSection = false;
			
			for (const line of lines) {
				const trimmed = line.trim();
				if (trimmed === 'packages:') {
					inPackagesSection = true;
					continue;
				}
				if (inPackagesSection && trimmed.startsWith('- ')) {
					const pattern = trimmed.substring(2).replace(/['"]/g, '');
					workspacePatterns.push(pattern);
				}
			}
		} catch {
			// Fallback to checking package.json workspaces
			const rootPackageJson = JSON.parse(await readFile(join(rootDir, 'package.json'), 'utf-8'));
			if (rootPackageJson.workspaces) {
				workspacePatterns = Array.isArray(rootPackageJson.workspaces) 
					? rootPackageJson.workspaces 
					: rootPackageJson.workspaces.packages || [];
			}
		}

		// Find all package.json files in workspace patterns
		for (const pattern of workspacePatterns) {
			const searchPath = pattern.replace('/*', '');
			const fullPath = join(rootDir, searchPath);
			
			try {
				const stats = await stat(fullPath);
				if (stats.isDirectory()) {
					if (pattern.endsWith('/*')) {
						// Search subdirectories
						const entries = await readdir(fullPath);
						for (const entry of entries) {
							const entryPath = join(fullPath, entry);
							const entryStats = await stat(entryPath);
							if (entryStats.isDirectory()) {
								await addWorkspaceIfExists(entryPath, workspaces, rootDir);
							}
						}
					} else {
						// Direct directory
						await addWorkspaceIfExists(fullPath, workspaces, rootDir);
					}
				}
			} catch {
				// Pattern doesn't exist, skip
			}
		}
	} catch (error) {
		throw new Error(`Failed to find workspace packages: ${error instanceof Error ? error.message : String(error)}`);
	}
	
	return workspaces;
}

async function addWorkspaceIfExists(dirPath: string, workspaces: WorkspaceInfo[], rootDir: string): Promise<void> {
	try {
		const packageJsonPath = join(dirPath, 'package.json');
		await access(packageJsonPath);
		
		const packageJson: PackageInfo = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
		
		workspaces.push({
			name: packageJson.name,
			path: relative(rootDir, dirPath),
			version: packageJson.version,
			private: (packageJson as any).private,
			dependencies: packageJson.dependencies || {},
			devDependencies: packageJson.devDependencies || {},
			scripts: packageJson.scripts || {}
		});
	} catch {
		// No package.json in this directory
	}
}

// Helper function to check for vulnerabilities using npm audit API
async function checkVulnerabilities(packageName: string, version: string): Promise<VulnerabilityInfo[]> {
	try {
		const response = await fetch(`https://registry.npmjs.org/-/npm/v1/security/advisories/search?text=${packageName}`);
		if (!response.ok) {
			return [];
		}
		
		const data = await response.json() as any;
		const vulnerabilities: VulnerabilityInfo[] = [];
		
		if (data.objects) {
			for (const advisory of data.objects) {
				if (advisory.package_name === packageName) {
					const vuln = advisory.advisory;
					if (semver.satisfies(version, vuln.vulnerable_versions)) {
						vulnerabilities.push({
							id: vuln.id.toString(),
							title: vuln.title,
							severity: vuln.severity,
							vulnerable_versions: vuln.vulnerable_versions,
							patched_versions: vuln.patched_versions,
							overview: vuln.overview,
							recommendation: vuln.recommendation
						});
					}
				}
			}
		}
		
		return vulnerabilities;
	} catch {
		return [];
	}
}

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
	return {
		tools: [
			{
				name: "analyze_workspace",
				description: "Analyze the entire pnpm workspace structure and dependencies",
				inputSchema: {
					type: "object",
					properties: {
						rootPath: {
							type: "string",
							description: "Root path of the workspace",
							default: "."
						},
						includeDevDeps: {
							type: "boolean",
							description: "Include development dependencies in analysis",
							default: true
						}
					}
				}
			},
			{
				name: "check_outdated",
				description: "Check for outdated packages across the workspace",
				inputSchema: {
					type: "object",
					properties: {
						workspace: {
							type: "string",
							description: "Specific workspace to check (optional)"
						},
						depth: {
							type: "number",
							description: "Dependency depth to check",
							default: 0
						}
					}
				}
			},
			{
				name: "audit_security",
				description: "Perform security audit on workspace dependencies",
				inputSchema: {
					type: "object",
					properties: {
						workspace: {
							type: "string",
							description: "Specific workspace to audit (optional)"
						},
						severity: {
							type: "string",
							description: "Minimum severity level to report",
							enum: ["low", "moderate", "high", "critical"],
							default: "moderate"
						}
					}
				}
			},
			{
				name: "install_package",
				description: "Install a package in a specific workspace",
				inputSchema: {
					type: "object",
					properties: {
						packageName: {
							type: "string",
							description: "Name of the package to install"
						},
						workspace: {
							type: "string",
							description: "Target workspace path"
						},
						version: {
							type: "string",
							description: "Specific version to install (optional)"
						},
						isDev: {
							type: "boolean",
							description: "Install as development dependency",
							default: false
						},
						isPeer: {
							type: "boolean",
							description: "Install as peer dependency",
							default: false
						}
					},
					required: ["packageName", "workspace"]
				}
			},
			{
				name: "update_package",
				description: "Update a package in workspace(s)",
				inputSchema: {
					type: "object",
					properties: {
						packageName: {
							type: "string",
							description: "Name of the package to update"
						},
						workspace: {
							type: "string",
							description: "Specific workspace to update (optional)"
						},
						version: {
							type: "string",
							description: "Target version (optional, defaults to latest)"
						},
						interactive: {
							type: "boolean",
							description: "Use interactive update mode",
							default: false
						}
					},
					required: ["packageName"]
				}
			},
			{
				name: "remove_package",
				description: "Remove a package from workspace(s)",
				inputSchema: {
					type: "object",
					properties: {
						packageName: {
							type: "string",
							description: "Name of the package to remove"
						},
						workspace: {
							type: "string",
							description: "Specific workspace to remove from"
						}
					},
					required: ["packageName", "workspace"]
				}
			},
			{
				name: "run_script",
				description: "Run a script in a specific workspace",
				inputSchema: {
					type: "object",
					properties: {
						scriptName: {
							type: "string",
							description: "Name of the script to run"
						},
						workspace: {
							type: "string",
							description: "Workspace to run script in"
						},
						args: {
							type: "array",
							items: { type: "string" },
							description: "Additional arguments for the script",
							default: []
						}
					},
					required: ["scriptName", "workspace"]
				}
			},
			{
				name: "list_scripts",
				description: "List all available scripts across workspaces",
				inputSchema: {
					type: "object",
					properties: {
						workspace: {
							type: "string",
							description: "Specific workspace to list scripts for (optional)"
						}
					}
				}
			},
			{
				name: "dependency_graph",
				description: "Generate dependency graph for workspace packages",
				inputSchema: {
					type: "object",
					properties: {
						format: {
							type: "string",
							description: "Output format",
							enum: ["text", "json"],
							default: "text"
						},
						includeExternal: {
							type: "boolean",
							description: "Include external dependencies",
							default: false
						}
					}
				}
			},
			{
				name: "workspace_info",
				description: "Get detailed information about a specific workspace",
				inputSchema: {
					type: "object",
					properties: {
						workspace: {
							type: "string",
							description: "Workspace path or name"
						}
					},
					required: ["workspace"]
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
			case "analyze_workspace": {
				const rootPath = String(args?.rootPath || ".");
				const includeDevDeps = Boolean(args?.includeDevDeps ?? true);

				const workspaces = await findWorkspacePackages(rootPath);
				
				let output = `Workspace Analysis for ${rootPath}:\n\n`;
				output += `Total workspaces: ${workspaces.length}\n\n`;

				const allDependencies = new Set<string>();
				const duplicateDependencies = new Map<string, Set<string>>();

				for (const workspace of workspaces) {
					output += `📦 ${workspace.name} (${workspace.path})\n`;
					output += `   Version: ${workspace.version}\n`;
					output += `   Private: ${workspace.private ? 'Yes' : 'No'}\n`;
					
					const deps = Object.keys(workspace.dependencies);
					const devDeps = includeDevDeps ? Object.keys(workspace.devDependencies) : [];
					
					output += `   Dependencies: ${deps.length}\n`;
					if (includeDevDeps) {
						output += `   Dev Dependencies: ${devDeps.length}\n`;
					}
					output += `   Scripts: ${Object.keys(workspace.scripts).length}\n`;

					// Track dependencies for duplicate analysis
					[...deps, ...(includeDevDeps ? devDeps : [])].forEach(dep => {
						allDependencies.add(dep);
						if (!duplicateDependencies.has(dep)) {
							duplicateDependencies.set(dep, new Set());
						}
						duplicateDependencies.get(dep)!.add(workspace.name);
					});

					output += '\n';
				}

				// Find duplicate dependencies
				const duplicates = Array.from(duplicateDependencies.entries())
					.filter(([_, workspaces]) => workspaces.size > 1)
					.sort((a, b) => b[1].size - a[1].size);

				if (duplicates.length > 0) {
					output += `\n🔄 Duplicate Dependencies (${duplicates.length}):\n`;
					for (const [dep, workspaceSet] of duplicates.slice(0, 10)) {
						output += `   ${dep} (used in ${workspaceSet.size} workspaces)\n`;
					}
					if (duplicates.length > 10) {
						output += `   ... and ${duplicates.length - 10} more\n`;
					}
				}

				output += `\n📊 Summary:\n`;
				output += `   Total unique dependencies: ${allDependencies.size}\n`;
				output += `   Duplicate dependencies: ${duplicates.length}\n`;

				return {
					content: [{
						type: "text",
						text: output
					}]
				};
			}

			case "check_outdated": {
				const workspace = args?.workspace ? String(args.workspace) : undefined;
				const depth = Number(args?.depth || 0);

				let command = `outdated --depth=${depth} --format=json`;
				if (workspace) {
					command += ` --filter=${workspace}`;
				}

				try {
					const result = await executePnpmCommand(command);
					const outdatedData = JSON.parse(result || '{}');
					
					let output = `Outdated Packages Report:\n\n`;
					
					if (Object.keys(outdatedData).length === 0) {
						output += "All packages are up to date! 🎉\n";
					} else {
						for (const [packageName, info] of Object.entries(outdatedData)) {
							const pkg = info as any;
							output += `📦 ${packageName}\n`;
							output += `   Current: ${pkg.current}\n`;
							output += `   Wanted: ${pkg.wanted}\n`;
							output += `   Latest: ${pkg.latest}\n`;
							if (pkg.location) {
								output += `   Location: ${pkg.location}\n`;
							}
							output += '\n';
						}
					}

					return {
						content: [{
							type: "text",
							text: output
						}]
					};
				} catch (error) {
					return {
						content: [{
							type: "text",
							text: `No outdated packages found or error checking: ${error instanceof Error ? error.message : String(error)}`
						}]
					};
				}
			}

			case "audit_security": {
				const workspace = args?.workspace ? String(args.workspace) : undefined;
				const severity = String(args?.severity || "moderate");

				let command = "audit --format=json";
				if (workspace) {
					command += ` --filter=${workspace}`;
				}

				try {
					const result = await executePnpmCommand(command);
					const auditData = JSON.parse(result || '{}');
					
					let output = `Security Audit Report:\n\n`;
					
					if (!auditData.vulnerabilities || Object.keys(auditData.vulnerabilities).length === 0) {
						output += "No security vulnerabilities found! 🔒\n";
					} else {
						const vulnerabilities = Object.values(auditData.vulnerabilities) as any[];
						const filteredVulns = vulnerabilities.filter(vuln => {
							const severityLevels = ["low", "moderate", "high", "critical"];
							const minLevel = severityLevels.indexOf(severity);
							const vulnLevel = severityLevels.indexOf(vuln.severity);
							return vulnLevel >= minLevel;
						});

						output += `Found ${filteredVulns.length} vulnerabilities (${severity}+ severity):\n\n`;
						
						for (const vuln of filteredVulns.slice(0, 10)) {
							output += `🚨 ${vuln.title}\n`;
							output += `   Severity: ${vuln.severity.toUpperCase()}\n`;
							output += `   Package: ${vuln.module_name}\n`;
							output += `   Vulnerable: ${vuln.vulnerable_versions}\n`;
							output += `   Patched: ${vuln.patched_versions}\n`;
							if (vuln.recommendation) {
								output += `   Fix: ${vuln.recommendation}\n`;
							}
							output += '\n';
						}

						if (filteredVulns.length > 10) {
							output += `... and ${filteredVulns.length - 10} more vulnerabilities\n`;
						}
					}

					return {
						content: [{
							type: "text",
							text: output
						}]
					};
				} catch (error) {
					return {
						content: [{
							type: "text",
							text: `Security audit completed with no issues or error: ${error instanceof Error ? error.message : String(error)}`
						}]
					};
				}
			}

			case "install_package": {
				const packageName = String(args?.packageName);
				const workspace = String(args?.workspace);
				const version = args?.version ? String(args.version) : undefined;
				const isDev = Boolean(args?.isDev);
				const isPeer = Boolean(args?.isPeer);

				let command = `add ${packageName}`;
				if (version) {
					command += `@${version}`;
				}
				if (isDev) {
					command += " --save-dev";
				}
				if (isPeer) {
					command += " --save-peer";
				}
				command += ` --filter=${workspace}`;

				try {
					const result = await executePnpmCommand(command);
					
					return {
						content: [{
							type: "text",
							text: `Successfully installed ${packageName}${version ? `@${version}` : ''} in ${workspace}\n\n${result}`
						}]
					};
				} catch (error) {
					return {
						content: [{
							type: "text",
							text: `Failed to install ${packageName}: ${error instanceof Error ? error.message : String(error)}`
						}]
					};
				}
			}

			case "update_package": {
				const packageName = String(args?.packageName);
				const workspace = args?.workspace ? String(args.workspace) : undefined;
				const version = args?.version ? String(args.version) : undefined;
				const interactive = Boolean(args?.interactive);

				let command = `update ${packageName}`;
				if (version) {
					command += `@${version}`;
				}
				if (workspace) {
					command += ` --filter=${workspace}`;
				}
				if (interactive) {
					command += " --interactive";
				}

				try {
					const result = await executePnpmCommand(command);
					
					return {
						content: [{
							type: "text",
							text: `Successfully updated ${packageName}${version ? ` to ${version}` : ''}\n\n${result}`
						}]
					};
				} catch (error) {
					return {
						content: [{
							type: "text",
							text: `Failed to update ${packageName}: ${error instanceof Error ? error.message : String(error)}`
						}]
					};
				}
			}

			case "remove_package": {
				const packageName = String(args?.packageName);
				const workspace = String(args?.workspace);

				const command = `remove ${packageName} --filter=${workspace}`;

				try {
					const result = await executePnpmCommand(command);
					
					return {
						content: [{
							type: "text",
							text: `Successfully removed ${packageName} from ${workspace}\n\n${result}`
						}]
					};
				} catch (error) {
					return {
						content: [{
							type: "text",
							text: `Failed to remove ${packageName}: ${error instanceof Error ? error.message : String(error)}`
						}]
					};
				}
			}

			case "run_script": {
				const scriptName = String(args?.scriptName);
				const workspace = String(args?.workspace);
				const scriptArgs = (args?.args as string[]) || [];

				let command = `run ${scriptName}`;
				if (scriptArgs.length > 0) {
					command += ` -- ${scriptArgs.join(' ')}`;
				}
				command += ` --filter=${workspace}`;

				try {
					const result = await executePnpmCommand(command);
					
					return {
						content: [{
							type: "text",
							text: `Script '${scriptName}' executed in ${workspace}:\n\n${result}`
						}]
					};
				} catch (error) {
					return {
						content: [{
							type: "text",
							text: `Failed to run script '${scriptName}': ${error instanceof Error ? error.message : String(error)}`
						}]
					};
				}
			}

			case "list_scripts": {
				const workspace = args?.workspace ? String(args.workspace) : undefined;

				try {
					const workspaces = await findWorkspacePackages("/Users/tim/gameplan/vibing/noo-code/Roo-Code");
					let output = "Available Scripts:\n\n";

					const targetWorkspaces = workspace 
						? workspaces.filter(w => w.name === workspace || w.path === workspace)
						: workspaces;

					if (targetWorkspaces.length === 0) {
						output += workspace ? `No workspace found matching: ${workspace}` : "No workspaces found";
					} else {
						for (const ws of targetWorkspaces) {
							output += `📦 ${ws.name} (${ws.path}):\n`;
							const scripts = Object.entries(ws.scripts);
							if (scripts.length === 0) {
								output += "   No scripts defined\n";
							} else {
								for (const [name, command] of scripts) {
									output += `   ${name}: ${command}\n`;
								}
							}
							output += '\n';
						}
					}

					return {
						content: [{
							type: "text",
							text: output
						}]
					};
				} catch (error) {
					return {
						content: [{
							type: "text",
							text: `Failed to list scripts: ${error instanceof Error ? error.message : String(error)}`
						}]
					};
				}
			}

			case "dependency_graph": {
				const format = String(args?.format || "text");
				const includeExternal = Boolean(args?.includeExternal);

				try {
					const workspaces = await findWorkspacePackages("/Users/tim/gameplan/vibing/noo-code/Roo-Code");
					
					if (format === "json") {
						const graph = {
							workspaces: workspaces.map(ws => ({
								name: ws.name,
								path: ws.path,
								dependencies: ws.dependencies,
								devDependencies: ws.devDependencies
							}))
						};
						
						return {
							content: [{
								type: "text",
								text: JSON.stringify(graph, null, 2)
							}]
						};
					} else {
						let output = "Dependency Graph:\n\n";
						
						for (const workspace of workspaces) {
							output += `📦 ${workspace.name}\n`;
							
							const allDeps = {
								...workspace.dependencies,
								...(includeExternal ? workspace.devDependencies : {})
							};
							
							const internalDeps = Object.keys(allDeps).filter(dep => 
								workspaces.some(ws => ws.name === dep)
							);
							
							const externalDeps = Object.keys(allDeps).filter(dep => 
								!workspaces.some(ws => ws.name === dep)
							);

							if (internalDeps.length > 0) {
								output += "   Internal Dependencies:\n";
								for (const dep of internalDeps) {
									output += `   ├── ${dep}\n`;
								}
							}

							if (includeExternal && externalDeps.length > 0) {
								output += "   External Dependencies:\n";
								for (const dep of externalDeps.slice(0, 5)) {
									output += `   ├── ${dep}\n`;
								}
								if (externalDeps.length > 5) {
									output += `   └── ... and ${externalDeps.length - 5} more\n`;
								}
							}
							
							output += '\n';
						}

						return {
							content: [{
								type: "text",
								text: output
							}]
						};
					}
				} catch (error) {
					return {
						content: [{
							type: "text",
							text: `Failed to generate dependency graph: ${error instanceof Error ? error.message : String(error)}`
						}]
					};
				}
			}

			case "workspace_info": {
				const workspace = String(args?.workspace);

				try {
					const workspaces = await findWorkspacePackages("/Users/tim/gameplan/vibing/noo-code/Roo-Code");
					const targetWorkspace = workspaces.find(w => w.name === workspace || w.path === workspace);

					if (!targetWorkspace) {
						return {
							content: [{
								type: "text",
								text: `Workspace not found: ${workspace}`
							}]
						};
					}

					let output = `Workspace Information: ${targetWorkspace.name}\n\n`;
					output += `📍 Path: ${targetWorkspace.path}\n`;
					output += `📦 Version: ${targetWorkspace.version}\n`;
					output += `🔒 Private: ${targetWorkspace.private ? 'Yes' : 'No'}\n\n`;

					output += `Dependencies (${Object.keys(targetWorkspace.dependencies).length}):\n`;
					for (const [name, version] of Object.entries(targetWorkspace.dependencies)) {
						output += `   ${name}: ${version}\n`;
					}

					output += `\nDev Dependencies (${Object.keys(targetWorkspace.devDependencies).length}):\n`;
					for (const [name, version] of Object.entries(targetWorkspace.devDependencies)) {
						output += `   ${name}: ${version}\n`;
					}

					output += `\nScripts (${Object.keys(targetWorkspace.scripts).length}):\n`;
					for (const [name, command] of Object.entries(targetWorkspace.scripts)) {
						output += `   ${name}: ${command}\n`;
					}

					return {
						content: [{
							type: "text",
							text: output
						}]
					};
				} catch (error) {
					return {
						content: [{
							type: "text",
							text: `Failed to get workspace info: ${error instanceof Error ? error.message : String(error)}`
						}]
					};
				}
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

// List resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
	return {
		resources: [
			{
				uri: "pnpm://workspace/config",
				mimeType: "application/json",
				name: "Workspace Configuration",
				description: "Current pnpm workspace configuration"
			},
			{
				uri: "pnpm://lockfile/info",
				mimeType: "application/json",
				name: "Lockfile Information",
				description: "Information about pnpm-lock.yaml"
			},
			{
				uri: "pnpm://packages/list",
				mimeType: "application/json",
				name: "Package List",
				description: "List of all packages in the workspace"
			}
		]
	};
});

// Read resources
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
	const url = new URL(request.params.uri);
	
	try {
		switch (url.pathname) {
			case "/workspace/config": {
				const workspaces = await findWorkspacePackages("/Users/tim/gameplan/vibing/noo-code/Roo-Code");
				const config = {
					workspaces: workspaces.map(ws => ({
						name: ws.name,
						path: ws.path,
						version: ws.version,
						private: ws.private
					}))
				};
				
				return {
					contents: [{
						uri: request.params.uri,
						mimeType: "application/json",
						text: JSON.stringify(config, null, 2)
					}]
				};
			}
			
			case "/lockfile/info": {
				try {
					const lockfilePath = join("/Users/tim/gameplan/vibing/noo-code/Roo-Code", "pnpm-lock.yaml");
					const lockfileStats = await stat(lockfilePath);
					const lockfileInfo = {
						exists: true,
						size: lockfileStats.size,
						modified: lockfileStats.mtime.toISOString(),
						path: lockfilePath
					};
					
					return {
						contents: [{
							uri: request.params.uri,
							mimeType: "application/json",
							text: JSON.stringify(lockfileInfo, null, 2)
						}]
					};
				} catch {
					return {
						contents: [{
							uri: request.params.uri,
							mimeType: "application/json",
							text: JSON.stringify({ exists: false }, null, 2)
						}]
					};
				}
			}
			
			case "/packages/list": {
				const workspaces = await findWorkspacePackages("/Users/tim/gameplan/vibing/noo-code/Roo-Code");
				const packageList = {
					total: workspaces.length,
					packages: workspaces.map(ws => ({
						name: ws.name,
						version: ws.version,
						path: ws.path,
						dependencyCount: Object.keys(ws.dependencies).length,
						devDependencyCount: Object.keys(ws.devDependencies).length,
						scriptCount: Object.keys(ws.scripts).length
					}))
				};
				
				return {
					contents: [{
						uri: request.params.uri,
						mimeType: "application/json",
						text: JSON.stringify(packageList, null, 2)
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
	console.error("PNPM MCP Server error:", error);
	process.exit(1);
});
