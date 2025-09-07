
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
    // This is to allow the Next.js dev server to accept requests from the
    // Firebase Studio development environment.
    allowedForwardedHosts: ['9000-firebase-studio-1753990342652.cluster-lu4mup47g5gm4rtyvhzpwbfadi.cloudworkstations.dev'],
    allowedFrameAncestors: ['https://9000-firebase-studio-1753990342652.cluster-lu4mup47g5gm4rtyvhzpwbfadi.cloudworkstations.dev'],
  },
};

export default nextConfig;
