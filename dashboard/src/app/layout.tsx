import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nebula Realtime Dashboard',
  description: 'Visual multiplayer system dashboard with live flow visualization',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
