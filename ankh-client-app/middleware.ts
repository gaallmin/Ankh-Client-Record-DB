import createMiddleware from 'next-intl/middleware';
import {locales} from './src/i18n';

export default createMiddleware({
  // A list of all locales that are supported
  locales: locales,
  
  // Used when no locale matches
  defaultLocale: 'en',
  
  // Automatically detect the user's locale based on the `Accept-Language` header
  localeDetection: true
});

export const config = {
  // Match only internationalized pathnames
  matcher: ['/', '/(ko|en)/:path*', '/((?!api|_next|_vercel|.*\\..*).*)']
};
