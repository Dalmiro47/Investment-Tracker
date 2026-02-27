/**
 * Orientation-safe viewport stabilizer
 *
 * Tracks the visual viewport and debounces the aggressive resize events
 * triggered by mobile Safari/Chrome during device rotation.  Consumers
 * can gate expensive re-layouts or overlay dismissals on `stable === true`.
 */
"use client";

import * as React from "react";

export type OrientationStability = {
  /** `true` once the viewport has stopped resizing for ≥150 ms. */
  stable: boolean;
  width: number;
  height: number;
};

export function useOrientationStability(): OrientationStability {
  const [state, setState] = React.useState<OrientationStability>({
    stable: true,
    // Safely initialize for SSR
    width: typeof window !== "undefined" ? window.innerWidth : 0,
    height: typeof window !== "undefined" ? window.innerHeight : 0,
  });

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    let timeoutId: number;

    const handleResize = () => {
      const vv = window.visualViewport;
      const currentWidth = vv?.width ?? window.innerWidth;
      const currentHeight = vv?.height ?? window.innerHeight;

      // Immediately flag as unstable to freeze UI
      setState((prev) => ({
        ...prev,
        stable: false,
        width: currentWidth,
        height: currentHeight,
      }));

      // Debounce the settled state to outlast the rotation animation (~150ms)
      clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        setState({ stable: true, width: currentWidth, height: currentHeight });
      }, 150);
    };

    window.addEventListener("resize", handleResize);
    window.visualViewport?.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    // Initial read
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
      window.visualViewport?.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
      clearTimeout(timeoutId);
    };
  }, []);

  return state;
}
