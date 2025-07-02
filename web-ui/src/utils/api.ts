import { ApiResponse } from "../types"

const API_BASE_URL = "http://localhost:3001"

class ApiClient {
	private baseURL: string

	constructor(baseURL: string = API_BASE_URL) {
		this.baseURL = baseURL
	}

	private async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
		const url = `${this.baseURL}${endpoint}`

		const defaultHeaders = {
			"Content-Type": "application/json",
		}

		const config: RequestInit = {
			...options,
			headers: {
				...defaultHeaders,
				...options.headers,
			},
		}

		try {
			const response = await fetch(url, config)

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`)
			}

			const data = await response.json()
			return data
		} catch (error) {
			console.error("API request failed:", error)
			throw error
		}
	}

	async get<T = any>(endpoint: string): Promise<T> {
		return this.request<T>(endpoint, { method: "GET" })
	}

	async post<T = any>(endpoint: string, data?: any): Promise<T> {
		return this.request<T>(endpoint, {
			method: "POST",
			body: data ? JSON.stringify(data) : undefined,
		})
	}

	async put<T = any>(endpoint: string, data?: any): Promise<T> {
		return this.request<T>(endpoint, {
			method: "PUT",
			body: data ? JSON.stringify(data) : undefined,
		})
	}

	async delete<T = any>(endpoint: string): Promise<T> {
		return this.request<T>(endpoint, { method: "DELETE" })
	}

	// Health check
	async checkHealth() {
		return this.get("/api/health")
	}

	// Device management
	async getDevices() {
		return this.get("/api/devices")
	}

	async getDevice(deviceId: string) {
		return this.get(`/api/devices/${deviceId}`)
	}

	// Authentication
	async login(username: string, password?: string) {
		return this.post("/api/auth/login", { username, password })
	}

	async logout() {
		return this.post("/api/auth/logout")
	}

	async getCurrentUser() {
		return this.get("/api/auth/me")
	}

	// Remote sessions
	async createRemoteSession(deviceId: string) {
		return this.post("/api/remote/sessions", { deviceId })
	}

	async getRemoteSession(sessionId: string) {
		return this.get(`/api/remote/sessions/${sessionId}`)
	}

	async endRemoteSession(sessionId: string) {
		return this.delete(`/api/remote/sessions/${sessionId}`)
	}

	// Messages
	async getMessages(deviceId: string, limit = 50) {
		return this.get(`/api/messages?deviceId=${deviceId}&limit=${limit}`)
	}

	async sendMessage(deviceId: string, content: string, type = "user") {
		return this.post("/api/messages", { deviceId, content, type })
	}
}

export const apiClient = new ApiClient()
export default apiClient
