import type {Metadata} from 'next';
import { Toaster } from "@/components/ui/toaster"
import { AuthProvider } from '@/hooks/use-auth';
import './globals.css';
import 'react-datepicker/dist/react-datepicker.css';

export const metadata: Metadata = {
  title: 'DDS Investment Tracker',
  description: 'Track your investments with ease and prepare for tax season.',
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
      </head>
      <body className="font-body antialiased">
        <AuthProvider>
          {children}
        </AuthProvider>
        <Toaster />
        <div id="app-datepicker-portal" />
      </body>
    </html>
  );
}
