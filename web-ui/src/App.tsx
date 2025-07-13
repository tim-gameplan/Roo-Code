import { Login } from "./components/Login"
import { Chat } from "./components/Chat"
import { useAuth } from "./hooks/useAuth"
import { SimpleImportTest } from "./components/SimpleImportTest"
import { WebviewUIStepTest } from "./components/WebviewUIStepTest"
import VSCodeAPITest from "./components/VSCodeAPITest"
import ChatView from "./components/chat/ChatView"
import { ExtensionStateProvider } from "./context/ExtensionStateContext"
// import { WebviewUIImportTest } from "./components/WebviewUIImportTest"

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
				<SimpleImportTest />
				<WebviewUIStepTest />
				<VSCodeAPITest />

				{/* New ChatView Component */}
				<div style={{ margin: "20px 0", padding: "20px", border: "2px solid #007acc", borderRadius: "8px" }}>
					<h3 style={{ color: "#007acc", marginBottom: "16px" }}>🎯 Phase 1.4: Basic ChatView Integration</h3>
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
