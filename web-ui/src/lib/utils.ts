// Utility functions for webview-ui compatibility
// This provides the @/lib/utils import that some webview-ui components expect

import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}
