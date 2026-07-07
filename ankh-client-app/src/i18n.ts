import {getRequestConfig} from 'next-intl/server';

// Can be imported from a shared config
export const locales = ['en', 'ko'] as const;
export type Locale = (typeof locales)[number];

export default getRequestConfig(async ({requestLocale}) => {
  // requestLocale is a Promise in Next.js 15
  let locale = await requestLocale;
  
  // Fallback to 'en' if locale is undefined
  if (!locale || !locales.includes(locale as Locale)) {
    locale = 'en';
  }
  
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default
  };
});
