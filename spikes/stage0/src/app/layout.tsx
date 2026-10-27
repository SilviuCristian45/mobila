import type { ReactNode } from 'react';
import './globals.css';

export const metadata = { title: 'Spike Etapa 0' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ro">
      <body className="bg-neutral-50 text-neutral-900">{children}</body>
    </html>
  );
}
