import {getRequestConfig} from 'next-intl/server';
import {locales, type Locale} from './i18n-routing';

export {locales, type Locale} from './i18n-routing';

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
