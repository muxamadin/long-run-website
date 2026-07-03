import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Phone } from "@phosphor-icons/react";

import { APPLY_LABEL, CALL_LABEL, PHONE_HREF } from "./site-content";
import { MaskedVideoBackground } from "./masked-video-bg";

const HEADLINE_LINES = ["Drive More.", "Live More."];

export function Hero() {
  const reduce = useReducedMotion();

  return (
    <section
      id="top"
      className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-lr-bg pt-16 lg:pt-[72px]"
    >
      <MaskedVideoBackground src="/assets/hero-loop.mp4" poster="/assets/hero-loop-poster.jpg" />

      <div className="relative mx-auto flex max-w-3xl flex-col items-center px-4 py-16 text-center sm:px-6 lg:px-8">
        <motion.div
          initial={reduce ? undefined : { opacity: 0, y: 16 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-lr-blue/40 bg-lr-blue/10 px-4 py-1.5"
        >
          <span className="size-1.5 rounded-full bg-lr-blue-light" />
          <span className="font-body text-xs font-semibold uppercase tracking-[0.14em] text-lr-blue-light">
            Now hiring CDL drivers
          </span>
        </motion.div>

        <h1 className="font-display text-5xl font-semibold uppercase leading-[0.95] tracking-tight text-lr-ink sm:text-6xl lg:text-7xl">
          {HEADLINE_LINES.map((line, i) => (
            <motion.span
              key={line}
              className="block"
              initial={reduce ? undefined : { opacity: 0, y: 32 }}
              animate={reduce ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.15 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
            >
              {i === 1 ? <span className="text-lr-blue-light">{line}</span> : line}
            </motion.span>
          ))}
        </h1>

        <motion.p
          initial={reduce ? undefined : { opacity: 0, y: 16 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.45 }}
          className="mt-6 max-w-md font-body text-base text-lr-ink-dim sm:text-lg"
        >
          Solo and team CDL drivers earn top mile pay with no forced dispatch,
          weekly pay, and real home time.
        </motion.p>

        <motion.div
          initial={reduce ? undefined : { opacity: 0, y: 16 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-4"
        >
          <a
            href="#apply"
            className="group inline-flex items-center gap-2 rounded-full bg-lr-blue px-7 py-3.5 font-body text-base font-semibold text-white transition-transform hover:scale-[1.03] active:scale-[0.98]"
          >
            {APPLY_LABEL}
            <ArrowRight weight="bold" className="size-4 transition-transform group-hover:translate-x-0.5" />
          </a>
          <a
            href={PHONE_HREF}
            className="inline-flex items-center gap-2 rounded-full border border-lr-ink/25 bg-white/5 px-7 py-3.5 font-body text-base font-semibold text-lr-ink backdrop-blur-sm transition-colors hover:bg-white/10"
          >
            <Phone weight="fill" className="size-4 text-lr-blue-light" />
            {CALL_LABEL}
          </a>
        </motion.div>
      </div>
    </section>
  );
}
