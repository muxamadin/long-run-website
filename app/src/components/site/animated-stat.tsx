import { useRef } from "react";
import { useInView } from "motion/react";
import NumberFlow from "@number-flow/react";

export function AnimatedStat({ value, suffix }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });

  return (
    <span ref={ref} className="tabular-nums">
      <NumberFlow value={inView ? value : 0} />
      {suffix}
    </span>
  );
}
