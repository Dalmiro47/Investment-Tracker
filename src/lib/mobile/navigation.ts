/**
 * E) Mobile nav domain model with ETF section
 *
 * Declares the canonical set of mobile sections and maps each to a
 * Next.js route.  Used by `BottomTabs` and the `MobileAppShell`.
 */

export type MobileSection = "summary" | "investments" | "etf";

/**
 * Returns the Next.js route path for the given mobile section.
 */
export function nextSectionRoute(section: MobileSection): string {
  switch (section) {
    case "summary":
      return "/";
    case "investments":
      return "/";
    case "etf":
      return "/etf";
    default:
      return "/";
  }
}
