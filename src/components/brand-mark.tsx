import { useId, type SVGProps } from 'react';

type BrandMarkProps = Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> & {
  /** Rendered width/height in px. */
  size?: number;
  /**
   * `glyph` — bare mint mark for inline lockups (headers, nav).
   * `tile`  — the app icon as it appears on a home screen: graphite tile, rounded corners.
   */
  variant?: 'glyph' | 'tile';
};

/**
 * DDS Investment Tracker brand mark: a rising sparkline on a graphite tile.
 * Keep in sync with `public/logo.svg` (PWA icons) and `src/app/icon.svg` (favicon).
 */
export function BrandMark({ size = 24, variant = 'glyph', ...props }: BrandMarkProps) {
  const id = useId();

  if (variant === 'tile') {
    const bgId = `${id}-bg`;
    const glowId = `${id}-glow`;
    const lineId = `${id}-line`;
    const clipId = `${id}-clip`;
    return (
      <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden {...props}>
        <defs>
          <linearGradient id={bgId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#161B21" />
            <stop offset="1" stopColor="#0C0F12" />
          </linearGradient>
          <radialGradient id={glowId} cx="0.78" cy="0.22" r="0.7">
            <stop offset="0" stopColor="#57C7A2" stopOpacity="0.22" />
            <stop offset="0.55" stopColor="#57C7A2" stopOpacity="0.04" />
            <stop offset="1" stopColor="#57C7A2" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={lineId} x1="124" y1="336" x2="388" y2="176" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#3FAE8B" />
            <stop offset="1" stopColor="#57C7A2" />
          </linearGradient>
          <clipPath id={clipId}>
            <rect width="512" height="512" rx="112" />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <rect width="512" height="512" fill={`url(#${bgId})`} />
          <rect width="512" height="512" fill={`url(#${glowId})`} />
        </g>
        <path
          d="M124 336 L239 236 L300 285 L388 176"
          fill="none"
          stroke={`url(#${lineId})`}
          strokeWidth="46"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <path
        d="M5.8 15.75 11.2 11.05 14.05 13.35 18.2 8.25"
        stroke="hsl(var(--primary))"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
