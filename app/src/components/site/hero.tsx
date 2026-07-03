import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Phone } from "@phosphor-icons/react";

import { APPLY_LABEL, CALL_LABEL, PHONE_HREF } from "./site-content";

const HEADLINE_LINES = ["Drive More.", "Live More."];

export function Hero() {
  const reduce = useReducedMotion();

  return (
    <section
      id="top"
      className="relative flex min-h-[100dvh] items-center overflow-hidden bg-lr-bg pt-16 lg:pt-[72px]"
    >
      <motion.img
        src="/assets/hero-truck.jpg"
        alt="LongRun Trucking semi truck driving on the highway at dusk"
        className="absolute inset-0 h-full w-full object-cover"
        initial={reduce ? undefined : { scale: 1.1 }}
        animate={reduce ? undefined : { scale: 1 }}
        transition={{ duration: 2.2, ease: [0.16, 1, 0.3, 1] }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-lr-bg via-lr-bg/85 to-lr-bg/20" />
      <div className="absolute inset-0 bg-gradient-to-t from-lr-bg via-transparent to-lr-bg/40" />

      <div className="relative mx-auto grid w-full max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-6 lg:px-8 lg:py-24">
        <div className="flex flex-col justify-center">
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
            className="mt-8 flex flex-wrap items-center gap-4"
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

        <div className="hidden lg:block" aria-hidden="true" />
      </div>

      <motion.div
        initial={reduce ? undefined : { opacity: 0, y: 24 }}
        animate={reduce ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.9 }}
        className="absolute bottom-8 right-4 hidden rounded-2xl border border-white/10 bg-lr-bg/70 px-6 py-5 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:right-6 sm:block lg:right-10"
      >
        <p className="font-body text-[11px] font-semibold uppercase tracking-[0.14em] text-lr-ink-dim">
          Pay per mile
        </p>
        <div className="mt-2 flex items-end gap-6">
          <div>
            <p className="font-display text-3xl font-semibold text-lr-gold">65-75</p>
            <p className="font-body text-xs text-lr-ink-dim">CPM Solo</p>
          </div>
          <div>
            <p className="font-display text-3xl font-semibold text-lr-gold">80-92</p>
            <p className="font-body text-xs text-lr-ink-dim">CPM Teams</p>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
