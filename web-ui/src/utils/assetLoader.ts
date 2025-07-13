/**
 * Asset loader for VSCode icons and resources in web environment
 */
export class AssetLoader {
	private static iconCache = new Map<string, string>()
	private static loadingPromises = new Map<string, Promise<string>>()

	/**
	 * Load a VSCode icon by name and return SVG content
	 */
	static async loadVSCodeIcon(iconName: string): Promise<string> {
		// Return cached version if available
		if (this.iconCache.has(iconName)) {
			return this.iconCache.get(iconName)!
		}

		// Return existing loading promise if in progress
		if (this.loadingPromises.has(iconName)) {
			return this.loadingPromises.get(iconName)!
		}

		// Create new loading promise
		const loadingPromise = this.fetchIcon(iconName)
		this.loadingPromises.set(iconName, loadingPromise)

		try {
			const iconSvg = await loadingPromise
			this.iconCache.set(iconName, iconSvg)
			this.loadingPromises.delete(iconName)
			return iconSvg
		} catch (error) {
			this.loadingPromises.delete(iconName)
			console.warn(`Failed to load icon: ${iconName}`, error)
			return this.getFallbackIcon()
		}
	}

	/**
	 * Get the URL for a VSCode icon
	 */
	static getIconUrl(iconName: string): string {
		return `/icons/${iconName}.svg`
	}

	/**
	 * Preload multiple icons for better performance
	 */
	static async preloadIcons(iconNames: string[]): Promise<void> {
		const promises = iconNames.map((name) => this.loadVSCodeIcon(name))
		await Promise.allSettled(promises)
	}

	/**
	 * Get icon as data URL for inline usage
	 */
	static async getIconDataUrl(iconName: string): Promise<string> {
		try {
			const svgContent = await this.loadVSCodeIcon(iconName)
			const encoded = btoa(unescape(encodeURIComponent(svgContent)))
			return `data:image/svg+xml;base64,${encoded}`
		} catch (error) {
			console.warn(`Failed to create data URL for icon: ${iconName}`, error)
			return ""
		}
	}

	/**
	 * Check if an icon is available/cached
	 */
	static isIconCached(iconName: string): boolean {
		return this.iconCache.has(iconName)
	}

	/**
	 * Clear icon cache (useful for memory management)
	 */
	static clearCache(): void {
		this.iconCache.clear()
		this.loadingPromises.clear()
	}

	/**
	 * Get cache statistics
	 */
	static getCacheStats(): { cached: number; loading: number } {
		return {
			cached: this.iconCache.size,
			loading: this.loadingPromises.size,
		}
	}

	/**
	 * Private method to fetch icon from server
	 */
	private static async fetchIcon(iconName: string): Promise<string> {
		const iconUrl = this.getIconUrl(iconName)

		try {
			const response = await fetch(iconUrl)

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`)
			}

			const contentType = response.headers.get("content-type")
			if (!contentType?.includes("svg")) {
				console.warn(`Icon ${iconName} is not SVG format: ${contentType}`)
			}

			return await response.text()
		} catch (error) {
			throw new Error(`Failed to fetch icon ${iconName}: ${error}`)
		}
	}

	/**
	 * Get fallback icon for missing assets
	 */
	private static getFallbackIcon(): string {
		return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1" fill="none"/>
      <path d="M6 6L10 10M10 6L6 10" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
    </svg>`
	}
}

// Add React import for the hook and component
import React from "react"

/**
 * React hook for loading VSCode icons
 */
export function useVSCodeIcon(iconName: string) {
	const [iconSvg, setIconSvg] = React.useState<string>("")
	const [loading, setLoading] = React.useState<boolean>(true)
	const [error, setError] = React.useState<string | null>(null)

	React.useEffect(() => {
		let mounted = true

		async function loadIcon() {
			try {
				setLoading(true)
				setError(null)

				const svg = await AssetLoader.loadVSCodeIcon(iconName)

				if (mounted) {
					setIconSvg(svg)
					setLoading(false)
				}
			} catch (err) {
				if (mounted) {
					setError(err instanceof Error ? err.message : "Unknown error")
					setLoading(false)
				}
			}
		}

		loadIcon()

		return () => {
			mounted = false
		}
	}, [iconName])

	return { iconSvg, loading, error }
}

/**
 * VSCode Icon component for easy usage in React
 */
interface VSCodeIconProps {
	name: string
	size?: number
	className?: string
	style?: React.CSSProperties
}

export function VSCodeIcon({ name, size = 16, className = "", style = {} }: VSCodeIconProps) {
	const { iconSvg, loading, error } = useVSCodeIcon(name)

	if (loading) {
		return React.createElement(
			"div",
			{
				className: `vscode-icon-loading ${className}`,
				style: { width: size, height: size, ...style },
			},
			React.createElement("div", { className: "vscode-loading-spinner" }),
		)
	}

	if (error || !iconSvg) {
		return React.createElement(
			"div",
			{
				className: `vscode-icon-error ${className}`,
				style: { width: size, height: size, ...style },
				title: error || "Icon not found",
			},
			"?",
		)
	}

	return React.createElement("div", {
		className: `vscode-icon ${className}`,
		style: { width: size, height: size, ...style },
		dangerouslySetInnerHTML: { __html: iconSvg },
	})
}
