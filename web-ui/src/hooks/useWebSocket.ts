import { useState, useEffect, useRef, useCallback } from "react"
import { Message, ConnectionState, WebSocketMessage } from "../types"

interface UseWebSocketReturn {
	isConnected: boolean
	connectionState: ConnectionState
	messages: Message[]
	error: string | null
	sendMessage: (content: string, type?: string) => void
	clearMessages: () => void
	reconnect: () => void
}

const WS_URL = "ws://localhost:3001"

export function useWebSocket(deviceId: string | null): UseWebSocketReturn {
	const [isConnected, setIsConnected] = useState(false)
	const [connectionState, setConnectionState] = useState<ConnectionState>({
		status: "disconnected",
	})
	const [messages, setMessages] = useState<Message[]>([])
	const [error, setError] = useState<string | null>(null)

	const wsRef = useRef<WebSocket | null>(null)
	const reconnectTimeoutRef = useRef<number | null>(null)
	const reconnectAttemptsRef = useRef(0)
	const maxReconnectAttempts = 5

	const connect = useCallback(() => {
		if (!deviceId) return

		try {
			setConnectionState({ status: "connecting" })
			setError(null)

			const ws = new WebSocket(`${WS_URL}/ws?deviceId=${deviceId}`)
			wsRef.current = ws

			ws.onopen = () => {
				console.log("WebSocket connected")
				setIsConnected(true)
				setConnectionState({
					status: "connected",
					lastConnected: new Date().toISOString(),
				})
				reconnectAttemptsRef.current = 0
				setError(null)
			}

			ws.onmessage = (event) => {
				try {
					const wsMessage: WebSocketMessage = JSON.parse(event.data)

					if (wsMessage.type === "message" && wsMessage.payload) {
						const message: Message = {
							id: wsMessage.id || Date.now().toString(),
							type: wsMessage.payload.type || "assistant",
							content: wsMessage.payload.content || "",
							timestamp: wsMessage.timestamp || new Date().toISOString(),
							deviceId: wsMessage.payload.deviceId,
							metadata: wsMessage.payload.metadata,
						}

						setMessages((prev) => [...prev, message])
					} else if (wsMessage.type === "error") {
						setError(wsMessage.payload?.message || "WebSocket error")
					}
				} catch (err) {
					console.error("Failed to parse WebSocket message:", err)
				}
			}

			ws.onclose = (event) => {
				console.log("WebSocket disconnected:", event.code, event.reason)
				setIsConnected(false)
				setConnectionState({
					status: "disconnected",
					error: event.reason || "Connection closed",
				})
				wsRef.current = null

				// Attempt to reconnect if not a normal closure
				if (event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
					const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000)
					reconnectTimeoutRef.current = setTimeout(() => {
						reconnectAttemptsRef.current++
						connect()
					}, delay)
				}
			}

			ws.onerror = (event) => {
				console.error("WebSocket error:", event)
				setError("WebSocket connection error")
				setConnectionState({
					status: "error",
					error: "Connection error",
				})
			}
		} catch (err) {
			console.error("Failed to create WebSocket connection:", err)
			setError("Failed to connect to WebSocket")
			setConnectionState({
				status: "error",
				error: "Failed to connect",
			})
		}
	}, [deviceId])

	const disconnect = useCallback(() => {
		if (reconnectTimeoutRef.current) {
			clearTimeout(reconnectTimeoutRef.current)
			reconnectTimeoutRef.current = null
		}

		if (wsRef.current) {
			wsRef.current.close(1000, "User disconnected")
			wsRef.current = null
		}

		setIsConnected(false)
		setConnectionState({ status: "disconnected" })
		reconnectAttemptsRef.current = 0
	}, [])

	const sendMessage = useCallback(
		(content: string, type: string = "user") => {
			if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
				setError("WebSocket is not connected")
				return
			}

			try {
				const message: WebSocketMessage = {
					type: "message",
					payload: {
						type,
						content,
						deviceId,
					},
					timestamp: new Date().toISOString(),
					id: Date.now().toString(),
				}

				wsRef.current.send(JSON.stringify(message))

				// Add user message to local state immediately
				const userMessage: Message = {
					id: message.id!,
					type: "user",
					content,
					timestamp: message.timestamp,
					deviceId: deviceId || undefined,
				}

				setMessages((prev) => [...prev, userMessage])
			} catch (err) {
				console.error("Failed to send message:", err)
				setError("Failed to send message")
			}
		},
		[deviceId],
	)

	const clearMessages = useCallback(() => {
		setMessages([])
	}, [])

	const reconnect = useCallback(() => {
		disconnect()
		setTimeout(() => {
			reconnectAttemptsRef.current = 0
			connect()
		}, 1000)
	}, [connect, disconnect])

	// Connect when deviceId changes
	useEffect(() => {
		if (deviceId) {
			connect()
		} else {
			disconnect()
		}

		return () => {
			disconnect()
		}
	}, [deviceId, connect, disconnect])

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			disconnect()
		}
	}, [disconnect])

	return {
		isConnected,
		connectionState,
		messages,
		error,
		sendMessage,
		clearMessages,
		reconnect,
	}
}
