
import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile(): boolean | undefined {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    mql.addEventListener("change", onChange)
    onChange(); // set initial
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile; // <-- do NOT coerce to !!
}
