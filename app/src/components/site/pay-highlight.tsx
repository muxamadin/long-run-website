import { Reveal } from "./reveal";
import { AnimatedStat } from "./animated-stat";
import { MaskedVideoBackground } from "./masked-video-bg";
import { SpotlightCard } from "./spotlight-card";

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
    <section
      id="pay"
      className="relative overflow-hidden border-y border-lr-border/60 bg-lr-bg py-24 sm:py-32"
    >
      <MaskedVideoBackground src="/assets/pay-loop.mp4" poster="/assets/pay-loop-poster.jpg" />

      <div className="relative mx-auto flex max-w-3xl flex-col items-center px-4 text-center sm:px-6 lg:px-8">
        <Reveal className="flex flex-col items-center">
          <h2 className="font-display text-3xl font-semibold uppercase tracking-tight text-lr-ink sm:text-4xl">
            Pay that respects the miles
          </h2>
          <p className="mt-3 max-w-md font-body text-base text-lr-ink-dim">
            Paid weekly, direct to your account. No surprises.
          </p>
        </Reveal>

        <div className="mt-12 flex w-full flex-col gap-5 sm:flex-row sm:justify-center">
          {TIERS.map((tier, i) => (
            <Reveal key={tier.label} delay={i * 0.12} className="sm:w-72">
              <SpotlightCard className="h-full rounded-2xl border border-lr-border bg-lr-surface p-8">
                <p className="font-body text-sm font-semibold uppercase tracking-[0.12em] text-lr-blue-light">
                  {tier.label}
                </p>
                <p className="mt-4 flex items-baseline justify-center gap-1 font-display text-5xl font-semibold text-lr-gold sm:text-6xl">
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
              </SpotlightCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
