import React, { useState, useRef, useEffect } from "react"
import { useAuth } from "../hooks/useAuth"
import { useWebSocket } from "../hooks/useWebSocket"
import { Message } from "../types"

interface ChatProps {
	onLogout?: () => void
}

export function Chat({ onLogout }: ChatProps) {
	const [inputMessage, setInputMessage] = useState("")
	const [isTyping, setIsTyping] = useState(false)
	const messagesEndRef = useRef<HTMLDivElement>(null)
	const inputRef = useRef<HTMLInputElement>(null)

	const { user, logout } = useAuth()
	const { isConnected, connectionState, messages, error, sendMessage, clearMessages, reconnect } = useWebSocket(
		user?.id || null,
	)

	const scrollToBottom = () => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
	}

	useEffect(() => {
		scrollToBottom()
	}, [messages])

	const handleSendMessage = (e: React.FormEvent) => {
		e.preventDefault()

		if (!inputMessage.trim() || !isConnected) {
			return
		}

		sendMessage(inputMessage.trim())
		setInputMessage("")
		setIsTyping(false)
	}

	const handleLogout = async () => {
		try {
			await logout()
			onLogout?.()
		} catch (err) {
			console.error("Logout failed:", err)
		}
	}

	const formatTimestamp = (timestamp: string) => {
		return new Date(timestamp).toLocaleTimeString()
	}

	const getConnectionStatusColor = () => {
		switch (connectionState.status) {
			case "connected":
				return "#10b981"
			case "connecting":
				return "#f59e0b"
			case "disconnected":
				return "#6b7280"
			case "error":
				return "#ef4444"
			default:
				return "#6b7280"
		}
	}

	const getConnectionStatusText = () => {
		switch (connectionState.status) {
			case "connected":
				return "Connected"
			case "connecting":
				return "Connecting..."
			case "disconnected":
				return "Disconnected"
			case "error":
				return "Connection Error"
			default:
				return "Unknown"
		}
	}

	return (
		<div className="chat-container">
			{/* Header */}
			<div className="chat-header">
				<div className="chat-header-left">
					<h1>Roo-Code Remote Session</h1>
					<div className="user-info">
						<span className="username">{user?.username || user?.id}</span>
						<div className="connection-status" style={{ color: getConnectionStatusColor() }}>
							<span className="status-dot" style={{ backgroundColor: getConnectionStatusColor() }}></span>
							{getConnectionStatusText()}
						</div>
					</div>
				</div>

				<div className="chat-header-right">
					{!isConnected && connectionState.status !== "connecting" && (
						<button onClick={reconnect} className="reconnect-button">
							Reconnect
						</button>
					)}
					<button onClick={clearMessages} className="clear-button">
						Clear Chat
					</button>
					<button onClick={handleLogout} className="logout-button">
						Logout
					</button>
				</div>
			</div>

			{/* Error Display */}
			{error && (
				<div className="error-banner">
					<span>⚠️ {error}</span>
					<button onClick={() => window.location.reload()} className="retry-button">
						Retry
					</button>
				</div>
			)}

			{/* Messages */}
			<div className="messages-container">
				{messages.length === 0 ? (
					<div className="empty-state">
						<div className="empty-state-content">
							<h3>Welcome to Roo-Code Remote Access</h3>
							<p>Start a conversation with your development environment.</p>
							<div className="connection-info">
								<p>
									<strong>Status:</strong> {getConnectionStatusText()}
								</p>
								{connectionState.lastConnected && (
									<p>
										<strong>Last Connected:</strong>{" "}
										{formatTimestamp(connectionState.lastConnected)}
									</p>
								)}
							</div>
						</div>
					</div>
				) : (
					<div className="messages-list">
						{messages.map((message: Message) => (
							<div
								key={message.id}
								className={`message ${message.type === "user" ? "message-user" : "message-assistant"}`}>
								<div className="message-header">
									<span className="message-type">
										{message.type === "user" ? "👤 You" : "🤖 Assistant"}
									</span>
									<span className="message-time">{formatTimestamp(message.timestamp)}</span>
								</div>
								<div className="message-content">{message.content}</div>
								{message.metadata && (
									<div className="message-metadata">
										<small>{JSON.stringify(message.metadata)}</small>
									</div>
								)}
							</div>
						))}
						{isTyping && (
							<div className="message message-assistant typing">
								<div className="message-header">
									<span className="message-type">🤖 Assistant</span>
									<span className="message-time">typing...</span>
								</div>
								<div className="message-content">
									<div className="typing-indicator">
										<span></span>
										<span></span>
										<span></span>
									</div>
								</div>
							</div>
						)}
					</div>
				)}
				<div ref={messagesEndRef} />
			</div>

			{/* Input */}
			<div className="chat-input-container">
				<form onSubmit={handleSendMessage} className="chat-input-form">
					<input
						ref={inputRef}
						type="text"
						value={inputMessage}
						onChange={(e) => setInputMessage(e.target.value)}
						placeholder={isConnected ? "Type your message..." : "Connecting..."}
						disabled={!isConnected}
						className="chat-input"
					/>
					<button type="submit" disabled={!isConnected || !inputMessage.trim()} className="send-button">
						Send
					</button>
				</form>

				<div className="input-help">
					<small>
						{isConnected ? "Connected to your development environment" : "Waiting for connection..."}
					</small>
				</div>
			</div>
		</div>
	)
}
