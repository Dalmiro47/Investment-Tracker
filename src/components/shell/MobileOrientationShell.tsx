/**
 * Layout-level orientation-aware wrapper.
 *
 * Wraps the full page content and freezes `min-height` during device
 * rotation so portal-based overlays (Shadcn Sheet, dialogs) don't collapse
 * to a dark screen repaint on mobile Safari / Chrome.
 */
"use client";

import * as React from "react";
import { useOrientationStability } from "@/lib/mobile/useOrientationStability";

interface MobileOrientationShellProps {
  children: React.ReactNode;
}

export function MobileOrientationShell({ children }: MobileOrientationShellProps) {
  const { stable, height } = useOrientationStability();

  return (
    <div
      className="relative z-[1] w-full transition-opacity duration-150"
      style={{
        minHeight: stable ? "100dvh" : `${height}px`,
        opacity: stable ? 1 : 0.98,
        // `clip` (not `hidden`) so this wrapper does not become a scroll
        // container — `overflow-x: hidden` forces `overflow-y: auto`, which
        // silently disables every `position: sticky` descendant (header,
        // filter rails). Horizontal overflow is still clipped here and on
        // <body>. Stability values above are untouched.
        overflowX: "clip",
      }}
    >
      {children}
    </div>
  );
}
