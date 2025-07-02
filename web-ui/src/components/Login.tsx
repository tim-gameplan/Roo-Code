import React, { useState } from "react"
import { useAuth } from "../hooks/useAuth"

interface LoginProps {
	onLoginSuccess?: () => void
}

export function Login({ onLoginSuccess }: LoginProps) {
	const [email, setEmail] = useState("")
	const [deviceName, setDeviceName] = useState("Web Browser")
	const [isLoading, setIsLoading] = useState(false)
	const { login, error } = useAuth()

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()

		if (!email.trim()) {
			return
		}

		try {
			setIsLoading(true)
			await login(email, deviceName)
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
						<label htmlFor="email">Email</label>
						<input
							id="email"
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="Enter your email address"
							required
							disabled={isLoading}
						/>
					</div>

					<div className="form-group">
						<label htmlFor="deviceName">Device Name</label>
						<input
							id="deviceName"
							type="text"
							value={deviceName}
							onChange={(e) => setDeviceName(e.target.value)}
							placeholder="Web Browser"
							disabled={isLoading}
						/>
					</div>

					{error && <div className="error-message">{error}</div>}

					<button type="submit" className="login-button" disabled={isLoading || !email.trim()}>
						{isLoading ? "Connecting..." : "Connect"}
					</button>
				</form>

				<div className="login-info">
					<h3>How to connect:</h3>
					<ol>
						<li>Enter your email address</li>
						<li>Optionally customize your device name</li>
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
