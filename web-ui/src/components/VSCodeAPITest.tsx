import { useState, useEffect } from "react"

export default function VSCodeAPITest() {
	const [connectionStatus, setConnectionStatus] = useState("connecting...")
	const [testState, setTestState] = useState<any>(null)
	const [messageLog, setMessageLog] = useState<string[]>([])

	useEffect(() => {
		// Check if VSCode API is available
		if (window.vscode) {
			setConnectionStatus("✅ VSCode API Available")

			// Test getting state
			const currentState = window.vscode.getState()
			setTestState(currentState)

			// Test setting state
			window.vscode.setState({
				testKey: "testValue",
				timestamp: Date.now(),
				component: "VSCodeAPITest",
			})

			// Test posting a message
			window.vscode.postMessage({
				type: "test_message",
				data: "Hello from VSCode API Test component",
			})

			setMessageLog((prev) => [...prev, "✅ VSCode API tests completed"])
		} else {
			setConnectionStatus("❌ VSCode API Not Available")
		}

		// Listen for VSCode messages
		const handleVSCodeMessage = (event: CustomEvent) => {
			setMessageLog((prev) => [...prev, `📨 Received: ${JSON.stringify(event.detail)}`])
		}

		window.addEventListener("vscode-message", handleVSCodeMessage as EventListener)

		return () => {
			window.removeEventListener("vscode-message", handleVSCodeMessage as EventListener)
		}
	}, [])

	const testPostMessage = () => {
		if (window.vscode) {
			window.vscode.postMessage({
				type: "manual_test",
				data: "Manual test message",
				timestamp: Date.now(),
			})
			setMessageLog((prev) => [...prev, "📤 Sent manual test message"])
		}
	}

	const testStateOperations = () => {
		if (window.vscode) {
			const newState = {
				manualTest: true,
				counter: Math.floor(Math.random() * 1000),
				timestamp: Date.now(),
			}
			window.vscode.setState(newState)
			const retrieved = window.vscode.getState()
			setTestState(retrieved)
			setMessageLog((prev) => [...prev, "💾 State updated and retrieved"])
		}
	}

	return (
		<div className="p-6 bg-gray-50 rounded-lg">
			<h2 className="text-xl font-bold mb-4">VSCode API Adapter Test</h2>

			<div className="mb-4">
				<h3 className="font-semibold mb-2">Connection Status:</h3>
				<p className={connectionStatus.includes("✅") ? "text-green-600" : "text-red-600"}>
					{connectionStatus}
				</p>
			</div>

			<div className="mb-4">
				<h3 className="font-semibold mb-2">VSCode Environment:</h3>
				{window.vscode?.env && (
					<pre className="bg-gray-100 p-2 rounded text-sm">{JSON.stringify(window.vscode.env, null, 2)}</pre>
				)}
			</div>

			<div className="mb-4">
				<h3 className="font-semibold mb-2">Current State:</h3>
				<pre className="bg-gray-100 p-2 rounded text-sm max-h-32 overflow-auto">
					{JSON.stringify(testState, null, 2)}
				</pre>
			</div>

			<div className="mb-4">
				<h3 className="font-semibold mb-2">Actions:</h3>
				<div className="space-x-2">
					<button
						onClick={testPostMessage}
						className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
						Test Post Message
					</button>
					<button
						onClick={testStateOperations}
						className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600">
						Test State Operations
					</button>
				</div>
			</div>

			<div className="mb-4">
				<h3 className="font-semibold mb-2">Message Log:</h3>
				<div className="bg-gray-100 p-2 rounded text-sm max-h-40 overflow-auto">
					{messageLog.map((msg, idx) => (
						<div key={idx} className="mb-1">
							{msg}
						</div>
					))}
				</div>
			</div>
		</div>
	)
}
