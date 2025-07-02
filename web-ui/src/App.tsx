import React, { useState } from "react"
import { Login } from "./components/Login"
import { Chat } from "./components/Chat"
import { useAuth } from "./hooks/useAuth"

function App() {
	const { user, isAuthenticated } = useAuth()

	const handleLoginSuccess = () => {
		// Login success is handled by the useAuth hook
	}

	const handleLogout = () => {
		// Logout is handled by the useAuth hook
	}

	return (
		<div className="app">
			{!isAuthenticated ? <Login onLoginSuccess={handleLoginSuccess} /> : <Chat onLogout={handleLogout} />}
		</div>
	)
}

export default App
