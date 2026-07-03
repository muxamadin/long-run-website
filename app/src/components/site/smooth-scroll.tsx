import type { ReactNode } from "react";
import { ReactLenis } from "lenis/react";
import { useReducedMotion } from "motion/react";

// Buttery site-wide scroll. Skipped entirely for reduced-motion users,
// who get native instant scroll instead of an eased one.
export function SmoothScroll({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <>{children}</>;
  }

  return (
    <ReactLenis root options={{ lerp: 0.1, duration: 1.1, smoothWheel: true }}>
      {children}
    </ReactLenis>
  );
}
