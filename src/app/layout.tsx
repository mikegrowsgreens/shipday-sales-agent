import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { headers } from 'next/headers';
import './globals.css';
import { Sidebar } from '@/components/layout/Sidebar';
import { Providers } from '@/components/layout/Providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SalesHub',
  description: 'Unified CRM - Outreach, Pipeline, Intelligence, Analytics',
};

// Public routes that render without the app shell (no sidebar)
const PUBLIC_ROUTE_PREFIXES = ['/book', '/widget', '/login', '/signup', '/forgot-password', '/reset-password', '/privacy', '/terms'];

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') || '';
  const isPublicRoute = PUBLIC_ROUTE_PREFIXES.some(prefix => pathname.startsWith(prefix));

  if (isPublicRoute) {
    return (
      <html lang="en" className="h-full">
        <body className={`${inter.className} h-full bg-white text-gray-900`}>
          <div className="min-h-full">
            {children}
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} h-full bg-gray-950 text-gray-100`}>
        <Providers>
          <div className="flex flex-col lg:flex-row h-full">
            <Sidebar />
            <main className="flex-1 overflow-auto min-w-0">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
