import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { List, X, Phone } from "@phosphor-icons/react";

import { APPLY_LABEL, CALL_LABEL, NAV_LINKS, PHONE_HREF } from "./site-content";

export function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-lr-border/60 bg-lr-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:h-[72px] lg:px-8">
        <a href="#top" className="flex items-center gap-2.5 shrink-0">
          <img src="/assets/logo-mark.svg" alt="" className="h-9 w-9" width={36} height={36} />
          <span className="font-display text-lg font-semibold tracking-tight text-lr-ink lg:text-xl">
            LongRun <span className="text-lr-blue-light">Trucking</span>
          </span>
        </a>

        <nav className="hidden items-center gap-8 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="font-body text-sm font-medium text-lr-ink-dim transition-colors hover:text-lr-ink"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <a
            href={PHONE_HREF}
            className="flex items-center gap-1.5 font-body text-sm font-semibold text-lr-ink-dim transition-colors hover:text-lr-ink"
          >
            <Phone weight="fill" className="size-4 text-lr-blue-light" />
            {CALL_LABEL}
          </a>
          <a
            href="#apply"
            className="rounded-full bg-lr-blue px-5 py-2.5 font-body text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset] transition-transform hover:scale-[1.03] active:scale-[0.98]"
          >
            {APPLY_LABEL}
          </a>
        </div>

        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
          className="flex size-10 items-center justify-center rounded-full border border-lr-border text-lr-ink lg:hidden"
        >
          {open ? <X className="size-5" /> : <List className="size-5" />}
        </button>
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden border-b border-lr-border/60 bg-lr-bg lg:hidden"
          >
            <div className="flex flex-col gap-1 px-4 py-4 sm:px-6">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 font-body text-base font-medium text-lr-ink-dim hover:bg-lr-surface hover:text-lr-ink"
                >
                  {link.label}
                </a>
              ))}
              <a
                href={PHONE_HREF}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 font-body text-base font-medium text-lr-ink-dim hover:bg-lr-surface hover:text-lr-ink"
              >
                <Phone weight="fill" className="size-4 text-lr-blue-light" />
                {CALL_LABEL}
              </a>
              <a
                href="#apply"
                onClick={() => setOpen(false)}
                className="mt-2 rounded-full bg-lr-blue px-5 py-3 text-center font-body text-sm font-semibold text-white"
              >
                {APPLY_LABEL}
              </a>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
