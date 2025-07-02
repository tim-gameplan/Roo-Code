export interface User {
	id: string
	username: string
	email?: string
}

export interface Device {
	id: string
	name: string
	type: "desktop" | "mobile" | "tablet"
	status: "online" | "offline" | "busy"
	lastSeen: string
	capabilities: string[]
}

export interface Message {
	id: string
	type: "user" | "assistant" | "system"
	content: string
	timestamp: string
	deviceId?: string
	metadata?: Record<string, any>
}

export interface ConnectionState {
	status: "connecting" | "connected" | "disconnected" | "error"
	lastConnected?: string
	error?: string
}

export interface ApiResponse<T = any> {
	success: boolean
	data?: T
	error?: string
	message?: string
}

export interface HealthStatus {
	status: "ok" | "error"
	timestamp: string
	services: {
		database: "ok" | "error"
		websocket: "ok" | "error"
		redis?: "ok" | "error"
	}
}

export interface WebSocketMessage {
	type: string
	payload: any
	timestamp: string
	id?: string
}

export interface RemoteSession {
	id: string
	deviceId: string
	userId: string
	status: "active" | "inactive" | "paused"
	startedAt: string
	lastActivity: string
}
