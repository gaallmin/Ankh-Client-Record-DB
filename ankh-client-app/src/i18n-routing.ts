// Edge-safe locale metadata shared by middleware and the server request config.
// Keep this module free of next-intl/server and Node.js-only imports.
export const locales = ['en', 'ko'] as const
export type Locale = (typeof locales)[number]
