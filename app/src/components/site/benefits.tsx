import type { Icon } from "@phosphor-icons/react";
import {
  Clock,
  CurrencyDollar,
  GasPump,
  Gauge,
  Gift,
  Headset,
  House,
  PawPrint,
  Prohibit,
  ShieldCheck,
  Truck,
  UsersThree,
} from "@phosphor-icons/react";

import { Reveal } from "./reveal";

type Benefit = { icon: Icon; label: string };

type Cluster = {
  title: string;
  tint: string;
  items: Benefit[];
};

const CLUSTERS: Cluster[] = [
  {
    title: "Pay & bonuses",
    tint: "from-lr-blue/10",
    items: [
      { icon: CurrencyDollar, label: "Weekly direct deposit" },
      { icon: Gift, label: "Sign-on & referral bonuses" },
      { icon: ShieldCheck, label: "Safety & inspection bonuses" },
      { icon: GasPump, label: "Fuel efficiency bonus" },
    ],
  },
  {
    title: "On the road",
    tint: "from-lr-gold/10",
    items: [
      { icon: Gauge, label: "Consistent miles" },
      { icon: Prohibit, label: "No forced dispatch" },
      { icon: Clock, label: "Paid detention & layover pay" },
      { icon: UsersThree, label: "Friendly dispatch team" },
    ],
  },
  {
    title: "Home & equipment",
    tint: "from-lr-blue/10",
    items: [
      { icon: House, label: "Flexible home time" },
      { icon: PawPrint, label: "Pet & rider friendly" },
      { icon: Truck, label: "Clean, well-maintained trucks" },
      { icon: Headset, label: "24/7 support" },
    ],
  },
];

export function Benefits() {
  return (
    <section id="why" className="bg-lr-bg py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="max-w-2xl">
          <h2 className="font-display text-3xl font-semibold uppercase tracking-tight text-lr-ink sm:text-4xl">
            Why drivers choose LongRun
          </h2>
          <p className="mt-3 font-body text-base text-lr-ink-dim">
            Your journey, our respect. Everything below ships to every driver,
            every week, not just the ones who ask.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {CLUSTERS.map((cluster, i) => (
            <Reveal key={cluster.title} delay={i * 0.1}>
              <div
                className={`h-full rounded-2xl border border-lr-border bg-gradient-to-b ${cluster.tint} to-lr-surface p-6`}
              >
                <h3 className="font-display text-sm font-semibold uppercase tracking-[0.1em] text-lr-blue-light">
                  {cluster.title}
                </h3>
                <ul className="mt-5 flex flex-col gap-4">
                  {cluster.items.map(({ icon: Icon, label }) => (
                    <li key={label} className="flex items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-lr-surface-2 text-lr-blue-light">
                        <Icon weight="duotone" className="size-[18px]" />
                      </span>
                      <span className="pt-1.5 font-body text-sm font-medium text-lr-ink">
                        {label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
