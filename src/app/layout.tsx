import type {Metadata, Viewport} from 'next';
import { Toaster } from "@/components/ui/toaster"
import { AuthProvider } from '@/hooks/use-auth';
import OfflineToast from '@/components/OfflineToast';
import './globals.css';

export const metadata: Metadata = {
  title: 'DDS Investment Tracker',
  description: 'Track your investments with ease and prepare for tax season.',
  manifest: '/manifest.webmanifest',
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0B1220" },
    { media: "(prefers-color-scheme: dark)",  color: "#0B1220" },
  ],
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
  },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=PT+Sans:ital,wght@0,400;0,700;1,400;1,700&family=Space+Grotesk:wght@300..700&display=swap" rel="stylesheet" />
        {/* iOS PWA friendliness */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="font-body antialiased">
        <AuthProvider>
          {children}
        </AuthProvider>
        <Toaster />
        <OfflineToast />
        {/* Register SW at the root once on mount */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function(){
                if ('serviceWorker' in navigator) {
                  window.addEventListener('load', function(){
                    navigator.serviceWorker.register('/sw.js').catch(function(e){
                      console.warn('SW registration failed', e);
                    });
                  });
                }
              })();
            `
          }}
        />
      </body>
    </html>
  );
}
