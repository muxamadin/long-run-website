import { Phone } from "@phosphor-icons/react";

import { CALL_LABEL, NAV_LINKS, PHONE_HREF } from "./site-content";

export function Footer() {
  return (
    <footer className="border-t border-lr-border/60 bg-lr-bg-alt">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <a href="#top" className="flex items-center">
              <img
                src="/assets/logo-lockup-white.png"
                alt="LongRun Trucking LLC"
                className="h-7 w-auto"
                width={760}
                height={176}
              />
            </a>
            <p className="mt-3 max-w-xs font-body text-sm text-lr-ink-dim">
              Your journey. Our respect. Your success. Our mission.
            </p>
          </div>

          <div className="flex flex-wrap gap-x-10 gap-y-6">
            <div className="flex flex-col gap-2">
              <p className="font-body text-xs font-semibold uppercase tracking-[0.12em] text-lr-ink-dim">
                Site
              </p>
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="font-body text-sm text-lr-ink-dim transition-colors hover:text-lr-ink"
                >
                  {link.label}
                </a>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <p className="font-body text-xs font-semibold uppercase tracking-[0.12em] text-lr-ink-dim">
                Contact
              </p>
              <a
                href={PHONE_HREF}
                className="flex items-center gap-1.5 font-body text-sm text-lr-ink-dim transition-colors hover:text-lr-ink"
              >
                <Phone weight="fill" className="size-3.5 text-lr-blue-light" />
                {CALL_LABEL}
              </a>
              <p className="font-body text-sm text-lr-ink-dim">
                English &amp; Espanol
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-lr-border/60 pt-6">
          <p className="font-body text-xs text-lr-ink-dim">
            © 2026 LongRun Trucking LLC. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
