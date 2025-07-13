export class WebStateManager {
	private static readonly STORAGE_KEY = "roo-code-web-state"

	static getState(): any {
		try {
			const stored = localStorage.getItem(this.STORAGE_KEY)
			return stored ? JSON.parse(stored) : {}
		} catch (error) {
			console.warn("Failed to get state from localStorage:", error)
			return {}
		}
	}

	static setState(state: any): void {
		try {
			localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state))

			// Dispatch event for components listening to state changes
			window.dispatchEvent(
				new CustomEvent("roo-state-change", {
					detail: state,
				}),
			)
		} catch (error) {
			console.warn("Failed to save state to localStorage:", error)
		}
	}

	static updateState(partial: any): void {
		const current = this.getState()
		const updated = { ...current, ...partial }
		this.setState(updated)
	}

	static clearState(): void {
		try {
			localStorage.removeItem(this.STORAGE_KEY)

			// Dispatch clear event
			window.dispatchEvent(new CustomEvent("roo-state-clear"))
		} catch (error) {
			console.warn("Failed to clear state from localStorage:", error)
		}
	}

	static getStateItem(key: string): any {
		const state = this.getState()
		return state[key]
	}

	static setStateItem(key: string, value: any): void {
		const current = this.getState()
		current[key] = value
		this.setState(current)
	}

	static removeStateItem(key: string): void {
		const current = this.getState()
		delete current[key]
		this.setState(current)
	}

	// Subscribe to state changes
	static onStateChange(callback: (state: any) => void): () => void {
		const handler = (event: CustomEvent) => {
			callback(event.detail)
		}

		window.addEventListener("roo-state-change", handler as EventListener)

		// Return unsubscribe function
		return () => {
			window.removeEventListener("roo-state-change", handler as EventListener)
		}
	}

	// Check if localStorage is available
	static isStorageAvailable(): boolean {
		try {
			const test = "__storage_test__"
			localStorage.setItem(test, test)
			localStorage.removeItem(test)
			return true
		} catch {
			return false
		}
	}

	// Get storage size info
	static getStorageInfo(): { used: number; available: boolean } {
		try {
			const test = JSON.stringify(this.getState())
			return {
				used: test.length,
				available: this.isStorageAvailable(),
			}
		} catch {
			return {
				used: 0,
				available: false,
			}
		}
	}
}
