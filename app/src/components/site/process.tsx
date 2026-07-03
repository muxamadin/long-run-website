import { ArrowRight, ClipboardText, Phone, PaperPlaneTilt, SteeringWheel } from "@phosphor-icons/react";

import { Reveal } from "./reveal";
import { Magnetic } from "./magnetic";
import { APPLY_LABEL } from "./site-content";

const STEPS = [
  {
    icon: PaperPlaneTilt,
    title: "Apply",
    body: "Fill out the form below or call us directly. It takes about two minutes.",
  },
  {
    icon: Phone,
    title: "Talk to us",
    body: "Our team calls you back, usually the same day, to go over pay and routes.",
  },
  {
    icon: ClipboardText,
    title: "Get oriented",
    body: "A quick orientation covers your paperwork and truck assignment.",
  },
  {
    icon: SteeringWheel,
    title: "Hit the road",
    body: "Start driving and earning, with dispatch and support behind you.",
  },
];

export function Process() {
  return (
    <section className="bg-lr-bg-alt py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="max-w-2xl">
          <h2 className="font-display text-3xl font-semibold uppercase tracking-tight text-lr-ink sm:text-4xl">
            From application to on the road
          </h2>
          <p className="mt-3 font-body text-base text-lr-ink-dim">
            No hoops to jump through. Most drivers are on their first load
            within days of applying.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <Reveal key={title} delay={i * 0.08} className="relative">
              <div className="flex size-14 items-center justify-center rounded-2xl border border-lr-border bg-lr-surface text-lr-blue-light">
                <Icon weight="duotone" className="size-7" />
              </div>
              <h3 className="mt-5 font-display text-lg font-semibold uppercase tracking-tight text-lr-ink">
                {title}
              </h3>
              <p className="mt-2 font-body text-sm text-lr-ink-dim">{body}</p>
              {i < STEPS.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="absolute right-[-1rem] top-7 hidden h-px w-8 bg-lr-border lg:block"
                />
              ) : null}
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.3} className="mt-14 flex justify-center">
          <Magnetic>
            <a
              href="#apply"
              className="group inline-flex items-center gap-2 rounded-full bg-lr-blue px-7 py-3.5 font-body text-base font-semibold text-white transition-transform hover:scale-[1.03] active:scale-[0.98]"
            >
              {APPLY_LABEL}
              <ArrowRight weight="bold" className="size-4 transition-transform group-hover:translate-x-0.5" />
            </a>
          </Magnetic>
        </Reveal>
      </div>
    </section>
  );
}
