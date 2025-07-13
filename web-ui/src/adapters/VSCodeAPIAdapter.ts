// VSCode API compatibility layer for web environment
import { WebSocketClient } from "./WebSocketClient"
import { WebStateManager } from "./StateManager"

export class VSCodeAPIAdapter {
	private wsClient: WebSocketClient
	private messageHandlers: Map<string, Function>

	constructor(serverUrl: string) {
		this.wsClient = new WebSocketClient(serverUrl)
		this.messageHandlers = new Map()
	}

	async connect(): Promise<void> {
		await this.wsClient.connect()

		// Set up message handling
		this.wsClient.onMessage((data) => {
			this.handleIncomingMessage(data)
		})
	}

	// Mock VSCode postMessage API
	postMessage(message: any): void {
		console.log("VSCode API: postMessage", message)

		// Handle different message types locally for testing
		this.handleOutgoingMessage(message)

		if (!this.wsClient?.isConnected()) {
			console.warn("WebSocket not connected, queueing message:", message)
			// TODO: Implement message queuing
			return
		}

		// Route to WebSocket instead of VSCode
		this.wsClient.send({
			type: "vscode_message",
			payload: message,
			timestamp: Date.now(),
		})
	}

	// Handle outgoing messages from web app
	private handleOutgoingMessage(message: any): void {
		switch (message.type) {
			case "chat":
				this.handleChatMessage(message)
				break
			case "chatMessage":
				this.handleChatMessage({ ...message, action: "sendMessage", content: message.message })
				break
			default:
				console.log("Unhandled outgoing message type:", message.type)
		}
	}

	// Handle chat messages specifically
	private handleChatMessage(message: any): void {
		if (message.action === "sendMessage" && message.content) {
			// Simulate processing the chat message
			console.log("Processing chat message:", message.content)

			// For now, simulate a response after a delay
			setTimeout(() => {
				this.simulateIncomingMessage({
					type: "chatResponse",
					content: `I received your message: "${message.content}". This is a test response from the WebSocket adapter.`,
					timestamp: Date.now(),
				})
			}, 500)
		}
	}

	// Simulate incoming messages (for testing)
	private simulateIncomingMessage(message: any): void {
		this.handleIncomingMessage(message)
	}

	// Mock VSCode getState API
	getState(): any {
		return WebStateManager.getState()
	}

	// Mock VSCode setState API
	setState(state: any): void {
		WebStateManager.setState(state)
	}

	// Register message handler
	onMessage(type: string, handler: Function): void {
		this.messageHandlers.set(type, handler)
	}

	// Remove message handler
	offMessage(type: string): void {
		this.messageHandlers.delete(type)
	}

	private handleIncomingMessage(data: any): void {
		if (data.type && this.messageHandlers.has(data.type)) {
			const handler = this.messageHandlers.get(data.type)
			if (handler) {
				handler(data.payload || data)
			}
		}

		// Emit generic message event for webview-ui components
		window.dispatchEvent(
			new CustomEvent("vscode-message", {
				detail: data,
			}),
		)
	}

	// Get connection status
	isConnected(): boolean {
		return this.wsClient?.isConnected() ?? false
	}

	// Clean up resources
	destroy(): void {
		this.messageHandlers.clear()
		this.wsClient.close()
	}
}
