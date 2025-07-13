import React from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { VSCodeAPIAdapter } from "./adapters/VSCodeAPIAdapter"
import { setupMockVSCodeGlobal } from "./adapters/MockVSCodeAPI"
import App from "./App.tsx"
import "./index.css"
import "./styles/vscode-theme.css"
import "./styles/responsive.css"

// Create a client
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 1000 * 60 * 5, // 5 minutes
			retry: (failureCount, error) => {
				// Don't retry on 4xx errors
				if (error instanceof Error && "status" in error) {
					const status = (error as any).status
					if (status >= 400 && status < 500) {
						return false
					}
				}
				return failureCount < 3
			},
		},
	},
})

// Initialize VSCode API adapter before React app
const adapter = new VSCodeAPIAdapter("ws://localhost:3001")
setupMockVSCodeGlobal(adapter)

// Function to render the app
function renderApp() {
	// Apply VSCode theme class to body
	document.body.classList.add("vscode-dark-theme")

	ReactDOM.createRoot(document.getElementById("root")!).render(
		<React.StrictMode>
			<QueryClientProvider client={queryClient}>
				<BrowserRouter>
					<App />
				</BrowserRouter>
			</QueryClientProvider>
		</React.StrictMode>,
	)
}

// Wait for WebSocket connection before rendering, with fallback
adapter
	.connect()
	.then(() => {
		console.log("VSCode API adapter connected successfully")
		renderApp()
	})
	.catch((error) => {
		console.warn("VSCode API adapter connection failed, rendering app anyway:", error)
		renderApp()
	})

// Export adapter for use in components if needed
;(window as any).rooCodeAdapter = adapter
