import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lons Admin Portal',
  description: 'Loan management platform for financial institutions',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
        {children}
      </body>
    </html>
  );
}
