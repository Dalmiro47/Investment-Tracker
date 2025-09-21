
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
  experimental: {
    // No longer contains allowedDevOrigins
  },
  // This is required to allow requests from the Studio preview environment
  // which has a different origin.
  allowedDevOrigins: ['https://*.cloudworkstations.dev'],
};

export default nextConfig;
