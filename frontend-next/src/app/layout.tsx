import type { Metadata } from 'next';
import './globals.css';
import { Web3Provider } from '@/components/Web3Provider';

export const metadata: Metadata = {
  title: 'PONG-IT',
  description: 'Stake cUSD. Play Pong. Win 2x back. Built for MiniPay on Celo.',
  manifest: '/manifest.json',
  icons: { icon: '/icons/icon-192.png', apple: '/icons/icon-192.png' },
  themeColor: '#7b3fe4',
  openGraph: {
    title: 'PONG-IT',
    description: 'Stake crypto. Play Pong. Win the pot. On Celo.',
    url: 'https://pong-it.app',
    images: [{ url: 'https://pong-it.app/icons/icon-512.png', width: 512, height: 512 }],
  },
  twitter: {
    card: 'summary',
    title: 'PONG-IT',
    description: 'Stake crypto. Play Pong. Win the pot. On Celo.',
    images: ['https://pong-it.app/icons/icon-512.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="minipay-app" content="true" />
        <meta name="talentapp:project_verification" content="3420938a925e382f5ffcfe6ef72be9d74ca645ac3cabe76ebcd5bb2d6bc82d5023640e05200920a152418ab36ccf278363ce50646f72929dc02992978d6fbdf7" />
        <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  );
}
