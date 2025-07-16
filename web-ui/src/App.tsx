import { Login } from "./components/Login"
import { Chat } from "./components/Chat"
import { useAuth } from "./hooks/useAuth"
import { SimpleImportTest } from "./components/SimpleImportTest"
import { WebviewUIStepTest } from "./components/WebviewUIStepTest"
import VSCodeAPITest from "./components/VSCodeAPITest"
import ChatView from "./components/chat/ChatView"
import { ExtensionStateProvider, useExtensionState } from "./context/ExtensionStateContext"
import { VSCodeAPIAdapter } from "./adapters/VSCodeAPIAdapter"
import { useEffect, useState } from "react"
// import { WebviewUIImportTest } from "./components/WebviewUIImportTest"

// Connection component to initialize CCS connection
function ConnectionManager() {
	const { setConnectionStatus } = useExtensionState()
	const [adapter, setAdapter] = useState<VSCodeAPIAdapter | null>(null)

	useEffect(() => {
		const initializeConnection = async () => {
			try {
				const vscodeAdapter = new VSCodeAPIAdapter("ws://localhost:3001")

				// Expose adapter globally for ChatView to use
				;(window as any).vscode = vscodeAdapter

				await vscodeAdapter.connect()
				setAdapter(vscodeAdapter)
				setConnectionStatus(true)

				console.log("✅ Connected to Production CCS successfully")
			} catch (error) {
				console.error("❌ Failed to connect to Production CCS:", error)
				setConnectionStatus(false, "Failed to connect to server")
			}
		}

		initializeConnection()

		return () => {
			if (adapter) {
				adapter.destroy()
			}
		}
	}, [setConnectionStatus])

	return null // This component doesn't render anything
}

function App() {
	const { isAuthenticated, isLoading } = useAuth()

	const handleLoginSuccess = () => {
		// Login success is handled by the useAuth hook
	}

	const handleLogout = () => {
		// Logout is handled by the useAuth hook
	}

	// Show loading state while auth is initializing
	if (isLoading) {
		return (
			<div className="app">
				<div
					style={{
						display: "flex",
						justifyContent: "center",
						alignItems: "center",
						height: "100vh",
						fontSize: "18px",
						color: "#666",
					}}>
					Loading Roo-Code Remote UI...
				</div>
			</div>
		)
	}

	return (
		<ExtensionStateProvider>
			<div className="app">
				{/* Initialize CCS connection */}
				<ConnectionManager />

				<SimpleImportTest />
				<WebviewUIStepTest />
				<VSCodeAPITest />

				{/* Phase 2.1: ChatView Connected to Production CCS */}
				<div style={{ margin: "20px 0", padding: "20px", border: "2px solid #28a745", borderRadius: "8px" }}>
					<h3 style={{ color: "#28a745", marginBottom: "16px" }}>
						🚀 Phase 2.1: ChatView ↔ Production CCS Integration
					</h3>
					<div style={{ height: "400px" }}>
						<ChatView />
					</div>
				</div>

				{/* <WebviewUIImportTest /> */}
				{!isAuthenticated ? <Login onLoginSuccess={handleLoginSuccess} /> : <Chat onLogout={handleLogout} />}
			</div>
		</ExtensionStateProvider>
	)
}

export default App
