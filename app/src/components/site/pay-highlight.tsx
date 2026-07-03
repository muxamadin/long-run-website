import { Reveal } from "./reveal";
import { AnimatedStat } from "./animated-stat";

const CENTS_FORMAT = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

const TIERS = [
  {
    label: "Solo drivers",
    low: "0.70",
    high: 0.75,
    note: "Based on experience, route, and equipment.",
  },
  {
    label: "Team drivers",
    low: "0.90",
    high: 1.0,
    note: "Combined team pay, split between both drivers.",
  },
];

export function PayHighlight() {
  return (
    <section id="pay" className="border-y border-lr-border/60 bg-lr-bg-alt py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="max-w-2xl">
          <h2 className="font-display text-3xl font-semibold uppercase tracking-tight text-lr-ink sm:text-4xl">
            Pay that respects the miles
          </h2>
          <p className="mt-3 font-body text-base text-lr-ink-dim">
            Paid weekly, direct to your account. No surprises.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {TIERS.map((tier, i) => (
            <Reveal key={tier.label} delay={i * 0.12}>
              <div className="h-full rounded-2xl border border-lr-border bg-lr-surface p-8">
                <p className="font-body text-sm font-semibold uppercase tracking-[0.12em] text-lr-blue-light">
                  {tier.label}
                </p>
                <p className="mt-4 flex items-baseline gap-1 font-display text-5xl font-semibold text-lr-gold sm:text-6xl">
                  <span>${tier.low}</span>
                  <span className="text-3xl text-lr-ink-dim sm:text-4xl">-</span>
                  <span>
                    $<AnimatedStat value={tier.high} format={CENTS_FORMAT} />
                  </span>
                </p>
                <p className="mt-1 font-body text-sm font-semibold text-lr-ink-dim">
                  per mile
                </p>
                <p className="mt-4 font-body text-sm text-lr-ink-dim">{tier.note}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
