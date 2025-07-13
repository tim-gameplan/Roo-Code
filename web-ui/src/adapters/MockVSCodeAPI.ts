import { VSCodeAPIAdapter } from "./VSCodeAPIAdapter"

// Define the VSCode API interface that webview-ui components expect
export interface VSCodeAPI {
	postMessage: (message: any) => void
	getState: () => any
	setState: (state: any) => void
	env: {
		appName: string
		language: string
		[key: string]: any
	}
}

// Mock the global VSCode API that webview-ui components expect
export function createMockVSCodeAPI(adapter: VSCodeAPIAdapter): VSCodeAPI {
	// Create window.vscode equivalent for web environment
	return {
		postMessage: (message: any) => {
			console.log("VSCode API postMessage called:", message)
			adapter.postMessage(message)
		},

		getState: () => {
			const state = adapter.getState()
			console.log("VSCode API getState called, returning:", state)
			return state
		},

		setState: (state: any) => {
			console.log("VSCode API setState called with:", state)
			adapter.setState(state)
		},

		// Mock other VSCode APIs as needed
		env: {
			appName: "Roo-Code Web",
			language: "en-US",
			machineId: "web-client",
			sessionId: `web-${Date.now()}`,
			remoteName: "web-remote",
		},
	}
}

// Set up global for webview-ui components
export function setupMockVSCodeGlobal(adapter: VSCodeAPIAdapter): void {
	const mockAPI = createMockVSCodeAPI(adapter)

	// Set up global window.vscode object
	;(window as any).vscode = mockAPI

	// Also set up global for acquireVsCodeApi() function that some components might use
	;(window as any).acquireVsCodeApi = () => mockAPI

	console.log("Mock VSCode API set up globally")
}

// Clean up global VSCode API
export function cleanupMockVSCodeGlobal(): void {
	delete (window as any).vscode
	delete (window as any).acquireVsCodeApi
	console.log("Mock VSCode API cleaned up")
}

// Type declarations for global VSCode API
declare global {
	interface Window {
		vscode?: VSCodeAPI
		acquireVsCodeApi?: () => VSCodeAPI
	}
}
