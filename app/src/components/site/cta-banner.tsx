import { Reveal } from "./reveal";
import { APPLY_LABEL } from "./site-content";

export function CtaBanner() {
  return (
    <section className="bg-lr-bg-alt py-20 sm:py-28">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-8">
        <Reveal>
          <h2 className="max-w-lg font-display text-4xl font-semibold uppercase leading-[0.98] tracking-tight text-lr-ink sm:text-5xl">
            You hold the key. We open the doors.
          </h2>
          <p className="mt-4 max-w-md font-body text-lg text-lr-ink-dim">
            Great pay. Respect. Freedom. Future. Join a company that drives
            you forward.
          </p>
          <a
            href="#apply"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-lr-blue px-7 py-3.5 font-body text-base font-semibold text-white transition-transform hover:scale-[1.03] active:scale-[0.98]"
          >
            {APPLY_LABEL}
          </a>
        </Reveal>

        <Reveal delay={0.12}>
          <div className="overflow-hidden rounded-2xl border border-lr-border">
            <img
              src="/assets/cta-doors.jpg"
              alt="Open doors leading to a highway at sunrise"
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
