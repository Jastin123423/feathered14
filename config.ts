
/**
 * Retrieves the API Key for Google GenAI.
 * Checks multiple sources to support different build environments (Vite, Netlify, Standard Node).
 */
export const getGeminiApiKey = (): string => {
    // Check for Vite/Netlify environment variable (VITE_ prefix required for client-side exposure)
    // We use 'as any' to avoid TypeScript errors if types are not configured for import.meta.env
    if (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_API_KEY) {
        return (import.meta as any).env.VITE_API_KEY;
    }

    // Check for standard process.env (often polyfilled or used in other bundlers)
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
        return process.env.API_KEY;
    }

    // Return empty string if not found (caller should handle validation)
    return '';
};
