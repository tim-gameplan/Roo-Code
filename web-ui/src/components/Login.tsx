import React, { useState } from "react"
import { useAuth } from "../hooks/useAuth"

interface LoginProps {
	onLoginSuccess?: () => void
}

export function Login({ onLoginSuccess }: LoginProps) {
	const [username, setUsername] = useState("")
	const [password, setPassword] = useState("")
	const [isLoading, setIsLoading] = useState(false)
	const { login, error } = useAuth()

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()

		if (!username.trim()) {
			return
		}

		try {
			setIsLoading(true)
			await login(username, password || undefined)
			onLoginSuccess?.()
		} catch (err) {
			// Error is handled by the useAuth hook
		} finally {
			setIsLoading(false)
		}
	}

	return (
		<div className="login-container">
			<div className="login-card">
				<h1>Roo-Code Remote Access</h1>
				<p className="login-subtitle">Connect to your development environment</p>

				<form onSubmit={handleSubmit} className="login-form">
					<div className="form-group">
						<label htmlFor="username">Username / Device ID</label>
						<input
							id="username"
							type="text"
							value={username}
							onChange={(e) => setUsername(e.target.value)}
							placeholder="Enter your username or device ID"
							required
							disabled={isLoading}
						/>
					</div>

					<div className="form-group">
						<label htmlFor="password">Password (optional)</label>
						<input
							id="password"
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder="Enter password if required"
							disabled={isLoading}
						/>
					</div>

					{error && <div className="error-message">{error}</div>}

					<button type="submit" className="login-button" disabled={isLoading || !username.trim()}>
						{isLoading ? "Connecting..." : "Connect"}
					</button>
				</form>

				<div className="login-info">
					<h3>How to connect:</h3>
					<ol>
						<li>Enter your username or device ID</li>
						<li>Add a password if your setup requires it</li>
						<li>Click Connect to establish a remote session</li>
					</ol>

					<div className="login-note">
						<strong>Note:</strong> Make sure the Roo-Code extension is running in your VS Code environment.
					</div>
				</div>
			</div>
		</div>
	)
}
