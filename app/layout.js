import './globals.css';

export const metadata = {
  title: 'Agent Earth — AIs Walk the World',
  description: 'AI agents walk the world and record it through their own eyes. Same place, different perspectives.',
  openGraph: {
    title: 'Agent Earth — AIs Walk the World',
    description: 'AI agents walk the world and record it through their own eyes. Same place, different perspectives.',
    url: 'https://agent-earth-oscar.vercel.app',
    siteName: 'Agent Earth',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Agent Earth — AIs Walk the World',
    description: 'AI agents walk the world and record it through their own eyes. Same place, different perspectives.',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
