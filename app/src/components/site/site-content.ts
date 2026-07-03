// Single source of truth for copy that repeats across sections (nav, hero,
// footer). Keeps CTA/label wording identical everywhere per one-label-per-intent.
export const PHONE_DISPLAY = "(219) 444-3285";
export const PHONE_HREF = "tel:+12194443285";
export const APPLY_LABEL = "Apply Now";
export const CALL_LABEL = PHONE_DISPLAY;

export const NAV_LINKS = [
  { href: "#why", label: "Why LongRun" },
  { href: "#pay", label: "Pay" },
  { href: "#apply", label: "Apply" },
] as const;
