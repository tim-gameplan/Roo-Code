export class WebSocketClient {
	private ws: WebSocket | null = null
	private messageQueue: any[] = []
	private reconnectAttempts = 0
	private maxReconnectAttempts = 5
	private reconnectDelay = 1000 // Start with 1 second
	private messageHandlers: Set<(data: any) => void> = new Set()
	private reconnectTimer: number | null = null

	constructor(_serverUrl: string) {}

	connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				// Clean up existing connection
				if (this.ws) {
					this.ws.close()
				}

				this.ws = new WebSocket(`ws://localhost:3001/ws`)

				this.ws.onopen = () => {
					console.log("WebSocket connected to CCS server")
					this.reconnectAttempts = 0
					this.reconnectDelay = 1000
					this.processMessageQueue()
					resolve()
				}

				this.ws.onmessage = (event) => {
					try {
						const data = JSON.parse(event.data)
						this.handleIncomingMessage(data)
					} catch (error) {
						console.error("Failed to parse WebSocket message:", error)
					}
				}

				this.ws.onclose = (event) => {
					console.log("WebSocket connection closed:", event.code, event.reason)
					this.ws = null

					if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
						this.handleReconnection()
					}
				}

				this.ws.onerror = (error) => {
					console.error("WebSocket error:", error)
					reject(new Error("WebSocket connection failed"))
				}
			} catch (error) {
				reject(error)
			}
		})
	}

	send(message: any): void {
		if (this.ws?.readyState === WebSocket.OPEN) {
			try {
				this.ws.send(JSON.stringify(message))
			} catch (error) {
				console.error("Failed to send WebSocket message:", error)
				this.messageQueue.push(message)
			}
		} else {
			console.log("WebSocket not open, queueing message")
			this.messageQueue.push(message)
		}
	}

	onMessage(handler: (data: any) => void): void {
		this.messageHandlers.add(handler)
	}

	offMessage(handler: (data: any) => void): void {
		this.messageHandlers.delete(handler)
	}

	isConnected(): boolean {
		return this.ws?.readyState === WebSocket.OPEN
	}

	close(): void {
		if (this.reconnectTimer) {
			window.clearTimeout(this.reconnectTimer)
			this.reconnectTimer = null
		}

		if (this.ws) {
			this.ws.close(1000, "Client initiated close")
			this.ws = null
		}

		this.messageHandlers.clear()
		this.messageQueue.length = 0
	}

	private processMessageQueue(): void {
		while (this.messageQueue.length > 0 && this.isConnected()) {
			const message = this.messageQueue.shift()
			this.send(message)
		}
	}

	private handleIncomingMessage(data: any): void {
		this.messageHandlers.forEach((handler) => {
			try {
				handler(data)
			} catch (error) {
				console.error("Error in message handler:", error)
			}
		})
	}

	private handleReconnection(): void {
		if (this.reconnectTimer) {
			window.clearTimeout(this.reconnectTimer)
		}

		this.reconnectTimer = window.setTimeout(async () => {
			this.reconnectAttempts++
			console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`)

			try {
				await this.connect()
				console.log("Reconnection successful")
			} catch (error) {
				console.error("Reconnection failed:", error)

				if (this.reconnectAttempts < this.maxReconnectAttempts) {
					// Exponential backoff
					this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000)
					this.handleReconnection()
				} else {
					console.error("Max reconnection attempts reached")
				}
			}
		}, this.reconnectDelay)
	}
}
