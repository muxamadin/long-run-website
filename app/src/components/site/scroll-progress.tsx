import { motion, useScroll, useSpring } from "motion/react";

// Thin wayfinding bar so a long single-page scroll always shows where
// you are. Motivated: feedback on scroll position, not decoration.
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 200,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <motion.div
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-gradient-to-r from-lr-blue to-lr-blue-light"
    />
  );
}
