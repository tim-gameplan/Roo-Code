import { useState, useEffect } from "react"
import { User } from "../types"
import { apiClient } from "../utils/api"

interface UseAuthReturn {
	user: User | null
	isAuthenticated: boolean
	isLoading: boolean
	error: string | null
	login: (email: string, deviceName?: string) => Promise<void>
	logout: () => Promise<void>
	refreshUser: () => Promise<void>
}

export function useAuth(): UseAuthReturn {
	const [user, setUser] = useState<User | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	const isAuthenticated = !!user

	const login = async (email: string, deviceName?: string) => {
		try {
			setIsLoading(true)
			setError(null)

			const response = await apiClient.login(email, deviceName)

			if (response.success && response.data?.user) {
				setUser(response.data.user)
				localStorage.setItem("auth_user", JSON.stringify(response.data.user))
			} else {
				throw new Error(response.error || "Login failed")
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : "Login failed"
			setError(errorMessage)
			throw err
		} finally {
			setIsLoading(false)
		}
	}

	const logout = async () => {
		try {
			setIsLoading(true)
			await apiClient.logout()
		} catch (err) {
			console.warn("Logout API call failed:", err)
		} finally {
			setUser(null)
			setError(null)
			localStorage.removeItem("auth_user")
			setIsLoading(false)
		}
	}

	const refreshUser = async () => {
		try {
			setIsLoading(true)
			setError(null)

			const response = await apiClient.getCurrentUser()

			if (response.success && response.data?.user) {
				setUser(response.data.user)
				localStorage.setItem("auth_user", JSON.stringify(response.data.user))
			} else {
				// User not authenticated, clear local storage
				setUser(null)
				localStorage.removeItem("auth_user")
			}
		} catch (err) {
			console.warn("Failed to refresh user:", err)
			setUser(null)
			localStorage.removeItem("auth_user")
			setError(null) // Don't show error for failed refresh
		} finally {
			setIsLoading(false)
		}
	}

	// Initialize auth state on mount
	useEffect(() => {
		const initializeAuth = async () => {
			// Check for stored user first
			const storedUser = localStorage.getItem("auth_user")
			if (storedUser) {
				try {
					const parsedUser = JSON.parse(storedUser)
					setUser(parsedUser)
				} catch (err) {
					console.warn("Failed to parse stored user:", err)
					localStorage.removeItem("auth_user")
				}
			}

			// Always try to refresh user from server
			await refreshUser()
		}

		initializeAuth()
	}, [])

	return {
		user,
		isAuthenticated,
		isLoading,
		error,
		login,
		logout,
		refreshUser,
	}
}
