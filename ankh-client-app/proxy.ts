import createMiddleware from 'next-intl/middleware'
import {locales} from './src/i18n-routing'

// Next.js 16 Proxy runs in the Node.js runtime. Keeping locale handling here
// avoids the Edge runtime restriction that caused Vercel's __dirname failure.
const proxy = createMiddleware({
  locales,
  defaultLocale: 'en',
  localeDetection: true,
})

export default proxy

export const config = {
  matcher: ['/', '/(ko|en)/:path*', '/((?!api|_next|_vercel|.*\\..*).*)'],
}
