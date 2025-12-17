
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // This is required to allow requests from the Studio preview environment
  // which has a different origin.
  allowedDevOrigins: ['https://*.cloudworkstations.dev'],
  experimental: {
    serverActions: {
      // Allow local dev and the Codespaces preview host seen in logs so
      // forwarded Server Actions requests are trusted.
      allowedOrigins: [
        'localhost:3000',
        'congenial-trout-jjgjg5vxxpj6h5w4v-3000.app.github.dev',
      ],
    },
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
      {
        source: '/(manifest.webmanifest|workbox-.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
