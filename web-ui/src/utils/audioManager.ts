/**
 * Audio manager for notification sounds and audio feedback in web environment
 */
export class AudioManager {
	private static audioCache = new Map<string, HTMLAudioElement>()
	private static loadingPromises = new Map<string, Promise<void>>()
	private static isEnabled = true
	private static globalVolume = 0.5

	/**
	 * Preload audio file for better performance
	 */
	static async preloadAudio(audioName: string): Promise<void> {
		// Return if already cached
		if (this.audioCache.has(audioName)) {
			return Promise.resolve()
		}

		// Return existing loading promise if in progress
		if (this.loadingPromises.has(audioName)) {
			return this.loadingPromises.get(audioName)!
		}

		// Create new loading promise
		const loadingPromise = this.loadAudio(audioName)
		this.loadingPromises.set(audioName, loadingPromise)

		try {
			await loadingPromise
			this.loadingPromises.delete(audioName)
		} catch (error) {
			this.loadingPromises.delete(audioName)
			console.warn(`Failed to preload audio: ${audioName}`, error)
		}
	}

	/**
	 * Play a sound with optional volume override
	 */
	static async playSound(audioName: string, volume?: number): Promise<void> {
		if (!this.isEnabled) {
			return
		}

		try {
			// Ensure audio is loaded
			if (!this.audioCache.has(audioName)) {
				await this.preloadAudio(audioName)
			}

			const audio = this.audioCache.get(audioName)
			if (!audio) {
				console.warn(`Audio not found: ${audioName}`)
				return
			}

			// Clone audio element to allow overlapping sounds
			const audioClone = audio.cloneNode() as HTMLAudioElement
			audioClone.volume = (volume ?? this.globalVolume) * this.globalVolume
			audioClone.currentTime = 0

			// Play the audio
			const playPromise = audioClone.play()

			if (playPromise !== undefined) {
				await playPromise
			}

			// Clean up after playing
			audioClone.addEventListener("ended", () => {
				audioClone.remove()
			})
		} catch (error) {
			// Ignore autoplay policy errors and other audio failures
			console.debug(`Audio play failed for ${audioName}:`, error)
		}
	}

	/**
	 * Set global volume (0.0 to 1.0)
	 */
	static setVolume(volume: number): void {
		this.globalVolume = Math.max(0, Math.min(1, volume))
	}

	/**
	 * Get current global volume
	 */
	static getVolume(): number {
		return this.globalVolume
	}

	/**
	 * Enable or disable audio
	 */
	static setEnabled(enabled: boolean): void {
		this.isEnabled = enabled
	}

	/**
	 * Check if audio is enabled
	 */
	static isAudioEnabled(): boolean {
		return this.isEnabled
	}

	/**
	 * Preload multiple audio files
	 */
	static async preloadMultiple(audioNames: string[]): Promise<void> {
		const promises = audioNames.map((name) => this.preloadAudio(name))
		await Promise.allSettled(promises)
	}

	/**
	 * Clear audio cache (useful for memory management)
	 */
	static clearCache(): void {
		// Stop all playing audio
		this.audioCache.forEach((audio) => {
			audio.pause()
			audio.currentTime = 0
		})

		this.audioCache.clear()
		this.loadingPromises.clear()
	}

	/**
	 * Get cache statistics
	 */
	static getCacheStats(): { cached: number; loading: number } {
		return {
			cached: this.audioCache.size,
			loading: this.loadingPromises.size,
		}
	}

	/**
	 * Check if an audio file is available/cached
	 */
	static isAudioCached(audioName: string): boolean {
		return this.audioCache.has(audioName)
	}

	/**
	 * Get audio URL for a given audio name
	 */
	static getAudioUrl(audioName: string): string {
		return `/audio/${audioName}.mp3`
	}

	/**
	 * Test if audio is supported and can be played
	 */
	static async testAudioSupport(): Promise<boolean> {
		try {
			const audio = new Audio()
			const canPlayMp3 = audio.canPlayType("audio/mpeg")
			return canPlayMp3 !== ""
		} catch (error) {
			return false
		}
	}

	/**
	 * Private method to load audio file
	 */
	private static async loadAudio(audioName: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const audio = new Audio(this.getAudioUrl(audioName))
			audio.preload = "auto"

			const cleanup = () => {
				audio.removeEventListener("canplaythrough", onLoad)
				audio.removeEventListener("error", onError)
				audio.removeEventListener("abort", onError)
			}

			const onLoad = () => {
				cleanup()
				this.audioCache.set(audioName, audio)
				resolve()
			}

			const onError = () => {
				cleanup()
				const error = new Error(`Failed to load audio: ${audioName}`)
				reject(error)
			}

			audio.addEventListener("canplaythrough", onLoad)
			audio.addEventListener("error", onError)
			audio.addEventListener("abort", onError)

			// Set a timeout to prevent hanging
			setTimeout(() => {
				if (!this.audioCache.has(audioName)) {
					cleanup()
					reject(new Error(`Audio loading timeout: ${audioName}`))
				}
			}, 10000) // 10 second timeout
		})
	}
}

/**
 * React hook for audio management
 */
export function useAudioManager() {
	const [isEnabled, setIsEnabled] = React.useState(AudioManager.isAudioEnabled())
	const [volume, setVolume] = React.useState(AudioManager.getVolume())

	const toggleAudio = React.useCallback(() => {
		const newEnabled = !isEnabled
		AudioManager.setEnabled(newEnabled)
		setIsEnabled(newEnabled)
	}, [isEnabled])

	const changeVolume = React.useCallback((newVolume: number) => {
		AudioManager.setVolume(newVolume)
		setVolume(newVolume)
	}, [])

	const playSound = React.useCallback(async (audioName: string, overrideVolume?: number) => {
		await AudioManager.playSound(audioName, overrideVolume)
	}, [])

	const preloadAudio = React.useCallback(async (audioName: string) => {
		await AudioManager.preloadAudio(audioName)
	}, [])

	return {
		isEnabled,
		volume,
		toggleAudio,
		changeVolume,
		playSound,
		preloadAudio,
		cacheStats: AudioManager.getCacheStats(),
	}
}

/**
 * Audio notification sounds enum for type safety
 */
export enum AudioNotification {
	MESSAGE_SENT = "message-sent",
	MESSAGE_RECEIVED = "message-received",
	ERROR = "error",
	SUCCESS = "success",
	WARNING = "warning",
	CLICK = "click",
}

/**
 * Convenience functions for common audio notifications
 */
export const AudioNotifications = {
	async messageSent(): Promise<void> {
		await AudioManager.playSound(AudioNotification.MESSAGE_SENT)
	},

	async messageReceived(): Promise<void> {
		await AudioManager.playSound(AudioNotification.MESSAGE_RECEIVED)
	},

	async error(): Promise<void> {
		await AudioManager.playSound(AudioNotification.ERROR)
	},

	async success(): Promise<void> {
		await AudioManager.playSound(AudioNotification.SUCCESS)
	},

	async warning(): Promise<void> {
		await AudioManager.playSound(AudioNotification.WARNING)
	},

	async click(): Promise<void> {
		await AudioManager.playSound(AudioNotification.CLICK, 0.3) // Quieter for UI feedback
	},
}

// Add React import for the hook
import React from "react"
