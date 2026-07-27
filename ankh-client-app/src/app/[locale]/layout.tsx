import type { Viewport } from "next";
import "./globals.css";
import {NextIntlClientProvider} from 'next-intl';
import {getMessages} from 'next-intl/server';
import {locales} from '@/i18n';
import CapacitorBridge from '@/components/CapacitorBridge';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export function generateStaticParams() {
  return locales.map((locale) => ({locale}));
}

export async function generateMetadata({params}: {params: Promise<{locale: string}>}) {
  return {
    title: "Ankh Client Record DB",
    description: "This is the Ankh Client Record Database application",
  };
}

export default async function RootLayout({
  children,
  params
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{locale: string}>;
}>) {
  const {locale} = await params;

  // Providing all messages to the client side
  const messages = await getMessages({locale});

  return (
    <html lang={locale} translate="no">
      <body
        className="antialiased"
        suppressHydrationWarning={true}
      >
        <NextIntlClientProvider messages={messages}>
          <CapacitorBridge />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
