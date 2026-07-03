import { Star } from "@phosphor-icons/react";

const BADGES = [
  "Driver First Company",
  "No Forced Dispatch",
  "Weekly Direct Deposit",
  "24/7 Support",
  "Bilingual Team",
  "Pet & Rider Friendly",
];

// The page's single marquee (wow-maker §5, max one per page). Real,
// short brand claims from the company's own hiring flyer, not filler.
export function TrustStrip() {
  const items = [...BADGES, ...BADGES];

  return (
    <div className="overflow-hidden border-y border-lr-border/60 bg-lr-bg-alt py-3.5">
      <div className="flex w-max lr-marquee-track">
        {items.map((label, i) => (
          <span
            key={`${label}-${i}`}
            className="flex items-center gap-2 whitespace-nowrap px-6 font-body text-sm font-medium text-lr-ink-dim"
          >
            <Star weight="fill" className="size-3.5 text-lr-gold" />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
