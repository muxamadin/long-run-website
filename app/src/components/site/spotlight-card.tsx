import type { MouseEvent, ReactNode } from "react";

import { cn } from "@/lib/utils";

// A soft light that follows the cursor across the card, clipped to its
// shape. Feedback on hover, not an infinite loop. Position is written
// straight to the DOM style so it never triggers a React re-render.
export function SpotlightCard({ children, className }: { children: ReactNode; className?: string }) {
  function handleMove(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    e.currentTarget.style.setProperty("--spot-x", `${x}%`);
    e.currentTarget.style.setProperty("--spot-y", `${y}%`);
  }

  return (
    <div onMouseMove={handleMove} className={cn("group relative overflow-hidden", className)}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(360px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(111,155,255,0.16), transparent 70%)",
        }}
      />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}
