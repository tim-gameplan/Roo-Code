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

		// Register device with CCS after connection
		await this.registerDevice()
	}

	// Register this web client as a device with the CCS
	private async registerDevice(): Promise<void> {
		const deviceRegistration = {
			id: this.generateMessageId(),
			type: "DEVICE_REGISTER",
			fromDeviceId: this.getDeviceId(),
			toDeviceId: "server",
			userId: this.getUserId(),
			payload: {
				id: this.getDeviceId(),
				userId: this.getUserId(),
				type: "desktop", // Web client acts as desktop device
				platform: navigator.platform || "web",
				version: "1.0.0",
				capabilities: {
					supportsFileSync: true,
					supportsVoiceCommands: false,
					supportsVideoStreaming: false,
					supportsNotifications: true,
					maxFileSize: 10 * 1024 * 1024, // 10MB
					supportedFormats: ["json", "text"],
				},
				lastSeen: new Date(),
				status: "online",
			},
			timestamp: new Date(),
			priority: 1, // HIGH priority
			requiresAck: true,
		}

		this.wsClient.send(deviceRegistration)
		console.log("Device registration sent to CCS:", deviceRegistration)
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

			// Map ChatView message to Extension API call via CCS
			const extensionMessage = {
				id: this.generateMessageId(),
				type: "EXTENSION_MESSAGE",
				fromDeviceId: this.getDeviceId(),
				toDeviceId: "extension",
				userId: this.getUserId(),
				payload: {
					// Map to WebviewMessage format that Extension expects
					type: "askResponse",
					text: message.content,
					images: message.images || [],
				},
				timestamp: new Date(),
				priority: 1, // HIGH priority
				requiresAck: false,
			}

			// Send mapped message via WebSocket to CCS
			if (this.wsClient?.isConnected()) {
				this.wsClient.send(extensionMessage)
				console.log("Sent chat message to extension via CCS:", extensionMessage)

				// Update UI to show message as sent
				this.dispatchToUI({
					type: "messageUpdated",
					payload: {
						messageId: this.generateMessageId(),
						status: "sent",
						content: message.content,
					},
				})
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
		console.log("Received message from CCS:", data)

		// Handle CCS protocol messages
		if (data.type) {
			switch (data.type) {
				case "ACK":
					// Registration or message acknowledgment
					if (data.payload?.status === "success") {
						console.log("Device registration successful:", data.payload)
						this.dispatchToUI({
							type: "connectionStatus",
							payload: { connected: true, authenticated: true },
						})
					}
					break

				case "EXTENSION_RESPONSE":
					// Response from extension via CCS
					if (data.payload) {
						// Map extension message format to ChatView format
						const extensionMessage = data.payload
						this.handleExtensionMessage(extensionMessage)
					}
					break

				case "ERROR":
					// Error from CCS
					console.error("CCS Error:", data.payload)
					this.dispatchToUI({
						type: "error",
						payload: { message: data.payload?.message || "Unknown error" },
					})
					break

				default:
					// Forward other messages to UI
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

	// Handle messages from extension (received via CCS)
	private handleExtensionMessage(extensionMessage: any): void {
		console.log("Processing extension message:", extensionMessage)

		switch (extensionMessage.type) {
			case "action":
				// AI responses, tool usage, etc.
				this.dispatchToUI({
					type: "action",
					payload: extensionMessage,
				})
				break

			case "state":
				// Extension state updates
				this.dispatchToUI({
					type: "state",
					payload: extensionMessage,
				})
				break

			case "messageUpdated":
				// Chat message updates (streaming responses)
				this.dispatchToUI({
					type: "messageUpdated",
					payload: extensionMessage,
				})
				break

			default:
				// Generic message forwarding
				this.dispatchToUI(extensionMessage)
				break
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
