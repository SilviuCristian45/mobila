import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { THEME_INIT_SCRIPT } from '@/lib/theme-script';
import './globals.css';

export const metadata: Metadata = {
  title: 'RoomCraft (nume provizoriu)',
  description:
    'Aplicație web de amenajări interioare: planuri, mobilier, finisaje și buget. Datele rămân pe dispozitivul tău.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ro" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="bg-stone-50 text-stone-900 antialiased">{children}</body>
    </html>
  );
}
