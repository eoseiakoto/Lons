import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { ChunkErrorRecovery } from '@/components/layout/chunk-error-recovery';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lons Platform',
  description: 'Platform administration for the Lons lending platform',
};

// Inline script to set theme before first paint (no flash of wrong theme)
const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem('lons.theme');
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = (stored === 'light' || stored === 'dark') ? stored : (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-page text-text-primary antialiased">
        <ChunkErrorRecovery />
        {children}
      </body>
    </html>
  );
}
