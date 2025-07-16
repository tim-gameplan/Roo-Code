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
			console.log("Processing chat message:", message.content)

			// Map ChatView message to RCCS CloudMessage protocol
			const cloudMessage = {
				id: this.generateMessageId(),
				type: "MESSAGE",
				fromDeviceId: this.getDeviceId(),
				toDeviceId: "extension",
				userId: this.getUserId(),
				payload: {
					type: "newTask",
					text: message.content,
					images: message.images || [],
				},
				timestamp: new Date(),
				priority: 1, // HIGH priority
				requiresAck: false,
			}

			// Send mapped message via WebSocket
			if (this.wsClient?.isConnected()) {
				this.wsClient.send(cloudMessage)
				console.log("Sent chat message to extension via WebSocket:", cloudMessage)
			} else {
				console.warn("WebSocket not connected, cannot send message")
				// Show error to user
				this.simulateIncomingMessage({
					type: "error",
					content: "Not connected to server. Please check your connection.",
					timestamp: Date.now(),
				})
			}
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
		// Map WebSocket messages from extension to ChatView format
		if (data.type) {
			console.log("Received message from WebSocket:", data)

			// Handle specific message types from extension
			switch (data.type) {
				case "messageUpdated":
				case "state":
					// Extension state/message updates - pass through to ChatView
					this.dispatchToUI(data)
					break
				case "action":
					// Extension action messages (AI responses, tool usage, etc.)
					this.dispatchToUI(data)
					break
				default:
					// Generic message handling
					this.dispatchToUI(data)
					break
			}
		}

		// Call registered message handlers
		if (data.type && this.messageHandlers.has(data.type)) {
			const handler = this.messageHandlers.get(data.type)
			if (handler) {
				handler(data.payload || data)
			}
		}
	}

	// Dispatch messages to UI components
	private dispatchToUI(data: any): void {
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

	// Helper methods for CloudMessage protocol
	private generateMessageId(): string {
		return `web_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
	}

	private getDeviceId(): string {
		// Generate or retrieve device ID from localStorage
		let deviceId = localStorage.getItem("roo-device-id")
		if (!deviceId) {
			deviceId = `web_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
			localStorage.setItem("roo-device-id", deviceId)
		}
		return deviceId
	}

	private getUserId(): string {
		// For now, use a default user ID
		// TODO: Implement proper user authentication
		return localStorage.getItem("roo-user-id") || "web-user"
	}

	// Clean up resources
	destroy(): void {
		this.messageHandlers.clear()
		this.wsClient.close()
	}
}
