
'use client';
import { useEffect, useState } from 'react';

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const shortest = Math.min(w, h);
      const coarse = window.matchMedia('(pointer: coarse)').matches;

      // Treat as mobile if it's a touch device AND the shortest side is phone-sized.
      // This keeps mobile UI in landscape too.
      setIsMobile(coarse && shortest <= 720);
    };

    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('orientationchange', compute);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('orientationchange', compute);
    };
  }, []);

  return isMobile;
}
